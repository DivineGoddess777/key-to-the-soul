import {applicationPool,databaseConnection} from './postgres-schema.mjs';
import {randomUUID} from 'node:crypto';
import {getBagLine} from '../ritual-bag.js';
import {confirmedOrderCapture,createOrderQuote} from './order-core.mjs';
import {usdCents,refundCaptureId,captureIdentity} from './payment-adjustments.mjs';
import {enqueueOrderMail} from './mail-outbox.mjs';

const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const session=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const record=row=>row?Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['total_cents','created_at','expires_at','paid_at','fulfilled_at'].includes(key)&&value!==null?Number(value):value])):null;

export function createPostgresOrders(pool,{environment,clock=Date.now}={}){
 if(!['sandbox','live'].includes(environment))throw Error('Choose an explicit order environment.');
 async function transaction(action){
  const client=await pool.connect();
  try{await client.query('BEGIN');const result=await action(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
 }
 const one=async(db,sql,args)=>record((await db.query(sql,args)).rows[0]);
 const lock=(db,id)=>one(db,'SELECT * FROM ktts_orders WHERE id=$1 AND environment=$2 FOR UPDATE',[id,environment]);
 const audit=async(db,id,type,detail={})=>{
  await db.query('INSERT INTO ktts_order_events(order_id,event_type,detail_json,created_at) VALUES($1,$2,$3,$4)',[id,type,JSON.stringify(detail),clock()]);
  const messageType=type==='FULFILLED'?'SHIPMENT':type==='PAYMENT_ADJUSTED'?'PAYMENT_ADJUSTED':['PAID','PAYMENT_REVIEW'].includes(type)&&detail.captureId?'PAID':null;
  if(messageType){const order=await one(db,'SELECT * FROM ktts_orders WHERE id=$1 AND environment=$2',[id,environment]);await enqueueOrderMail(db,order,messageType,id+':'+messageType+(messageType==='PAYMENT_ADJUSTED'?':'+detail.paymentStatus+':'+detail.refundedCents:''),clock());}
 };
 async function moveStock(db,id,commit){
  const lines=(await db.query("SELECT * FROM ktts_order_lines WHERE order_id=$1 AND reservation_state='HELD' ORDER BY sku",[id])).rows;
  for(const line of lines){
   const changed=await db.query(`UPDATE ktts_stock SET reserved=reserved-$1,on_hand=CASE WHEN mode='ready_stock' AND $2 THEN on_hand-$1 ELSE on_hand END,updated_at=$3 WHERE sku=$4 AND environment=$5 AND reserved >= $1 RETURNING sku`,[line.quantity,commit,clock(),line.sku,environment]);
   if(changed.rows.length!==1)throw Error('Inventory reservation could not be reconciled.');
  }
  await db.query("UPDATE ktts_order_lines SET reservation_state=$2 WHERE order_id=$1 AND reservation_state='HELD'",[id,commit?'COMMITTED':'RELEASED']);
 }
 async function finishReservation(db,order,status){
  await moveStock(db,order.id,false);
  await db.query('UPDATE ktts_orders SET status=$2 WHERE id=$1',[order.id,status]);
  await audit(db,order.id,status);
 }
 async function expireReservations(limit=100){
  if(!Number.isInteger(limit)||limit<1||limit>1000)fail('Invalid cleanup limit.',400);
  return transaction(async db=>{
   const rows=(await db.query("SELECT * FROM ktts_orders WHERE environment=$1 AND status='RESERVED' AND expires_at<=$2 AND payment_lease_until<=$2 ORDER BY id LIMIT $3 FOR UPDATE SKIP LOCKED",[environment,clock(),limit])).rows;
   for(const row of rows)await finishReservation(db,row,'EXPIRED');
   return rows.length;
  });
 }
 async function setStock(sku,{mode,onHand}){
  const variant=getBagLine(sku);
  if(!variant?.size||variant.key!==sku||!['ready_stock','made_to_order'].includes(mode)||(mode==='ready_stock'&&(!Number.isSafeInteger(onHand)||onHand<0||onHand>1000000))||(mode==='made_to_order'&&onHand!==null))fail('Choose a confirmed candle variant, stock mode and quantity.',400);
  return transaction(async db=>{
   await db.query('INSERT INTO ktts_stock(environment,sku,mode,on_hand,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(environment,sku) DO NOTHING',[environment,sku,mode,onHand,clock()]);
   const existing=(await db.query('SELECT * FROM ktts_stock WHERE sku=$1 AND environment=$2 FOR UPDATE',[sku,environment])).rows[0];
   if(existing.reserved>0&&(existing.mode!==mode||mode==='ready_stock'&&onHand<existing.reserved))fail('Existing checkout reservations must be resolved before this stock change.');
   return (await db.query('UPDATE ktts_stock SET mode=$2,on_hand=$3,updated_at=$4 WHERE sku=$1 AND environment=$5 RETURNING *',[sku,mode,onHand,clock(),environment])).rows[0];
  });
 }
 async function reserve({sessionHash,nonce,items,customer,delivery}){
  if(!session(sessionHash)||!uuid(nonce))fail('Restart checkout on this site.',400);
  const snapshot=createOrderQuote(items,customer,delivery,clock());
  await expireReservations();
  return transaction(async db=>{
   const id=randomUUID(),now=clock();
   const inserted=await one(db,"INSERT INTO ktts_orders(id,environment,session_hash,nonce,fingerprint,quote_json,customer_json,total_cents,status,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'RESERVED',$9,$10) ON CONFLICT(environment,session_hash,nonce) DO NOTHING RETURNING *",[id,environment,sessionHash,nonce,snapshot.fingerprint,JSON.stringify(snapshot.quote),JSON.stringify(snapshot.customer),snapshot.quote.totalCents,now,snapshot.quote.expiresAt]);
   if(!inserted){
    const existing=await one(db,'SELECT * FROM ktts_orders WHERE environment=$1 AND session_hash=$2 AND nonce=$3',[environment,sessionHash,nonce]);
    if(!existing||existing.fingerprint!==snapshot.fingerprint)fail('The checkout details changed. Start a fresh checkout.');
    return existing;
   }
   // Every transaction locks variants in the same order to prevent overselling.
   const skus=snapshot.quote.lines.map(line=>line.sku).sort();
   const stocks=(await db.query('SELECT * FROM ktts_stock WHERE sku=ANY($1::text[]) AND environment=$2 ORDER BY sku FOR UPDATE',[skus,environment])).rows;
   const stockBySku=new Map(stocks.map(stock=>[stock.sku,stock]));
   for(const line of snapshot.quote.lines){
    const stock=stockBySku.get(line.sku);
    if(!stock)fail('Availability for this candle has not been confirmed.');
    if(stock.mode==='ready_stock'&&stock.on_hand-stock.reserved<line.quantity)fail('This candle no longer has enough stock.');
    await db.query('UPDATE ktts_stock SET reserved=reserved+$2,updated_at=$3 WHERE sku=$1 AND environment=$4',[line.sku,line.quantity,now,environment]);
    await db.query("INSERT INTO ktts_order_lines(order_id,environment,sku,quantity,reservation_state) VALUES($1,$2,$3,$4,'HELD')",[id,environment,line.sku,line.quantity]);
   }
   await audit(db,id,'RESERVED',{totalCents:snapshot.quote.totalCents});
   return inserted;
  });
 }
 async function bindPayment(id,sessionHash,paypalId){
  if(!uuid(id)||!session(sessionHash)||!/^[A-Z0-9]{10,32}$/.test(paypalId||''))fail('Invalid checkout reference.',400);
  return transaction(async db=>{
   const order=await lock(db,id);
   if(!order||order.session_hash!==sessionHash)fail('This order is unavailable.',404);
   if(order.status!=='RESERVED'||order.expires_at<=clock())fail('This checkout reservation has expired.');
   if(order.paypal_id&&order.paypal_id!==paypalId)fail('This checkout already has a different payment.');
   if(!order.paypal_id){await db.query('UPDATE ktts_orders SET paypal_id=$2 WHERE id=$1',[id,paypalId]);await audit(db,id,'PAYMENT_CREATED',{paypalId});}
   return {...order,paypal_id:paypalId};
  });
 }
 async function capture(id,payload){
  if(!uuid(id))fail('Invalid order reference.',400);
  return transaction(async db=>{
   const order=await lock(db,id);if(!order)fail('This order is unavailable.',404);
   const captureId=confirmedOrderCapture(payload,order);
   if(order.capture_id){if(order.capture_id!==captureId)fail('This order has a different capture.');return order;}
   let status='PAID';
   if(order.status!=='RESERVED'||order.expires_at<=clock()){
    if(order.status==='RESERVED')await moveStock(db,id,false);
    status='PAYMENT_REVIEW';
   }else await moveStock(db,id,true);
   const result=await one(db,"UPDATE ktts_orders SET status=$2,capture_id=$3,paid_at=$4,payment_status='COMPLETED',payment_review_reason=$5 WHERE id=$1 RETURNING *",[id,status,captureId,clock(),status==='PAYMENT_REVIEW'?'Payment arrived after its stock reservation ended.':null]);
   await audit(db,id,status,{captureId,reason:status==='PAYMENT_REVIEW'?'Payment arrived after the stock reservation ended. Owner review required.':null});
   return result;
  });
 }
 async function cancel(id,sessionHash){
  if(!uuid(id)||!session(sessionHash))fail('Invalid checkout reference.',400);
  return transaction(async db=>{
   const order=await lock(db,id);if(!order||order.session_hash!==sessionHash)fail('This order is unavailable.',404);
   if(Number(order.payment_lease_until)>clock())fail('Payment is being checked. Please wait before canceling.');
   if(['CANCELED','EXPIRED'].includes(order.status))return order;
   if(order.status!=='RESERVED')fail('A confirmed payment cannot be canceled through this control.');
   await finishReservation(db,order,'CANCELED');return {...order,status:'CANCELED'};
  });
 }
 async function fulfill(id,{carrier,trackingNumber}){
  if(!uuid(id)||typeof carrier!=='string'||typeof trackingNumber!=='string'||![carrier,trackingNumber].every(s=>s.trim().length>0&&s.length<=100&&!/[\u0000-\u001f\u007f]/.test(s)))fail('Enter the shipment carrier and tracking number.',400);
  return transaction(async db=>{
   const order=await lock(db,id);if(!order)fail('This order is unavailable.',404);
   const shipment={carrier:carrier.trim(),trackingNumber:trackingNumber.trim()};
   if(order.status==='FULFILLED'&&order.fulfillment_json?.carrier===shipment.carrier&&order.fulfillment_json?.trackingNumber===shipment.trackingNumber)return order;
   if(order.status!=='PAID')fail('Only a paid order awaiting fulfillment can be marked shipped.');
   if(order.payment_status!=='COMPLETED')fail('Resolve the payment adjustment before shipping.');
   const result=await one(db,"UPDATE ktts_orders SET status='FULFILLED',fulfilled_at=$2,fulfillment_json=$3 WHERE id=$1 RETURNING *",[id,clock(),JSON.stringify(shipment)]);
   await audit(db,id,'FULFILLED',shipment);return result;
  });
 }
 const get=async(id,sessionHash)=>uuid(id)&&session(sessionHash)?one(pool,'SELECT * FROM ktts_orders WHERE id=$1 AND environment=$2 AND session_hash=$3',[id,environment,sessionHash]):null;
 const findByPayment=async id=>/^[A-Z0-9]{10,32}$/.test(id||'')?one(pool,'SELECT * FROM ktts_orders WHERE paypal_id=$1 AND environment=$2',[id,environment]):null;
 const findByCapture=async id=>/^[A-Z0-9]{6,32}$/.test(id||'')?one(pool,'SELECT * FROM ktts_orders WHERE capture_id=$1 AND environment=$2',[id,environment]):null;
 const list=async()=> (await pool.query('SELECT id,status,total_cents,created_at,paid_at,fulfilled_at,payment_status,refunded_cents FROM ktts_orders WHERE environment=$1 ORDER BY created_at DESC LIMIT 100',[environment])).rows.map(record);
 const ownerOrder=id=>uuid(id)?one(pool,'SELECT * FROM ktts_orders WHERE id=$1 AND environment=$2',[id,environment]):null;
 const listStock=async()=> (await pool.query('SELECT sku,mode,on_hand,reserved,updated_at FROM ktts_stock WHERE environment=$1 ORDER BY sku',[environment])).rows;
 const findAttempt=async(sessionHash,nonce)=>session(sessionHash)&&uuid(nonce)?one(pool,'SELECT * FROM ktts_orders WHERE environment=$1 AND session_hash=$2 AND nonce=$3',[environment,sessionHash,nonce]):null;
 async function claimPayment(id,sessionHash,phase){
  if(!uuid(id)||!session(sessionHash)||!['create','capture'].includes(phase))fail('Invalid checkout reference.',400);
  return transaction(async db=>{
   const order=await lock(db,id);
   if(!order||order.session_hash!==sessionHash)fail('This order is unavailable.',404);
   if(order.capture_id)return {order,done:true};
   if(order.status!=='RESERVED'||order.expires_at<=clock())fail('Your reservation expired. Start a fresh checkout.');
   if(phase==='create'&&order.paypal_id)return {order,done:true};
   if(phase==='capture'&&!order.paypal_id)fail('Start payment first.');
   if(Number(order.payment_lease_until)>clock())fail('Payment is being checked. Please retry shortly.');
   const token=randomUUID();
   await db.query('UPDATE ktts_orders SET payment_lease_token=$2,payment_lease_until=$3,payment_lease_phase=$4 WHERE id=$1',[id,token,clock()+120000,phase]);
   return {order,token,done:false};
  });
 }
 const releasePayment=(id,token)=>pool.query('UPDATE ktts_orders SET payment_lease_token=NULL,payment_lease_until=0,payment_lease_phase=NULL WHERE id=$1 AND environment=$2 AND payment_lease_token=$3',[id,environment,token]);
 async function adjustPayment(id,{capture:remote,refund,paypalOrder,reversed=false}){
  if(!uuid(id))fail('Invalid order reference.',400);
  return transaction(async db=>{
   const order=await lock(db,id);if(!order)fail('This order is unavailable.',404);
   if(!remote||!/^[A-Z0-9]{6,32}$/.test(remote.id||'')||usdCents(remote.amount)!==order.total_cents||!['COMPLETED','PARTIALLY_REFUNDED','REFUNDED'].includes(remote.status))fail('The captured payment has not been verified.');
   if(order.capture_id?order.capture_id!==remote.id:captureIdentity(paypalOrder,order).id!==remote.id)fail('This capture does not match the order.');
   if(refund){
    if(!/^[A-Z0-9]{6,32}$/.test(refund.id||'')||refundCaptureId(refund)!==remote.id||!['PENDING','COMPLETED','FAILED','CANCELLED'].includes(refund.status))fail('The refund does not match this capture.');
    const cents=usdCents(refund.amount);if(cents<1||cents>order.total_cents)fail('Refund amount is unconfirmed.');
    const existing=await one(db,'SELECT * FROM ktts_order_refunds WHERE environment=$1 AND refund_id=$2',[environment,refund.id]);
    if(existing&&(existing.order_id!==id||existing.capture_id!==remote.id||existing.amount_cents!==cents))fail('This refund reference has conflicting details.');
    await db.query("INSERT INTO ktts_order_refunds(environment,refund_id,order_id,capture_id,amount_cents,status,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(environment,refund_id) DO UPDATE SET status=CASE WHEN ktts_order_refunds.status='COMPLETED' THEN 'COMPLETED' ELSE EXCLUDED.status END,updated_at=EXCLUDED.updated_at",[environment,refund.id,id,remote.id,cents,refund.status,clock()]);
    if(['COMPLETED','FAILED','CANCELLED'].includes(refund.status))await db.query("UPDATE ktts_refund_attempts SET state='DONE' WHERE environment=$1 AND order_id=$2 AND refund_id=$3",[environment,id,refund.id]);
   }
   const ledger=(await db.query("SELECT COALESCE(SUM(CASE WHEN status='COMPLETED' THEN amount_cents ELSE 0 END),0)::int AS refunded,COUNT(*) FILTER(WHERE status='PENDING')::int AS pending FROM ktts_order_refunds WHERE environment=$1 AND order_id=$2",[environment,id])).rows[0];
   const providerTotal=remote.seller_receivable_breakdown?.total_refunded_amount;
   let refunded=Math.max(order.refunded_cents||0,ledger.refunded,providerTotal?usdCents(providerTotal):0);if(remote.status==='REFUNDED')refunded=order.total_cents;
   if(refunded>order.total_cents)fail('Refund totals exceed this order. Owner review is required.');
   const paymentStatus=reversed||order.payment_status==='REVERSED'?'REVERSED':refunded===order.total_cents?'REFUNDED':refunded||remote.status==='PARTIALLY_REFUNDED'?'PARTIALLY_REFUNDED':ledger.pending?'REFUND_PENDING':'COMPLETED';
   const review=paymentStatus!=='COMPLETED';
   if(!order.capture_id){await moveStock(db,id,false);}
   let status=order.status==='FULFILLED'?'FULFILLED':review||!order.capture_id?'PAYMENT_REVIEW':order.status;
   if(!review&&order.status==='PAYMENT_REVIEW'&&order.payment_review_reason==='Refund requested; PayPal confirmation is pending.'){
    const committed=(await db.query("SELECT BOOL_AND(reservation_state='COMMITTED') AS all_committed FROM ktts_order_lines WHERE order_id=$1",[id])).rows[0].all_committed;if(committed)status='PAID';
   }
   const reason=review?'PayPal payment state: '+paymentStatus+'. Confirm the adjustment before fulfillment.':order.payment_review_reason;
   const result=await one(db,'UPDATE ktts_orders SET capture_id=$2,paid_at=COALESCE(paid_at,$3),status=$4,payment_status=$5,refunded_cents=$6,payment_review_reason=$7 WHERE id=$1 RETURNING *',[id,remote.id,clock(),status,paymentStatus,refunded,reason]);
   if(paymentStatus!==order.payment_status||refunded!==order.refunded_cents)await audit(db,id,'PAYMENT_ADJUSTED',{captureId:remote.id,refundId:refund?.id||null,paymentStatus,refundedCents:refunded});
   return result;
  });
 }
 async function requestRefund(id,nonce,amountCents){
  if(!uuid(id)||!uuid(nonce)||!Number.isSafeInteger(amountCents)||amountCents<1)fail('Enter a refund amount and confirm the request.',400);
  return transaction(async db=>{
   const order=await lock(db,id);if(!order?.capture_id||order.payment_status==='REVERSED')fail('This payment is unavailable for a refund.');
   const prior=await one(db,"SELECT * FROM ktts_refund_attempts WHERE environment=$1 AND order_id=$2 AND (nonce=$3 OR state IN ('OPEN','BOUND')) ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[environment,id,nonce]);
   if(prior){if(prior.amount_cents!==amountCents)fail('The pending refund amount differs. Resolve that attempt before starting another.');return {order,attempt:prior};}
   if(amountCents>order.total_cents-order.refunded_cents)fail('The refund exceeds the remaining paid amount.');
   const attempt=await one(db,"INSERT INTO ktts_refund_attempts(id,environment,order_id,nonce,amount_cents,state,created_at) VALUES($1,$2,$3,$4,$5,'OPEN',$6) RETURNING *",[randomUUID(),environment,id,nonce,amountCents,clock()]);
   if(order.status!=='FULFILLED')await db.query("UPDATE ktts_orders SET status='PAYMENT_REVIEW',payment_review_reason='Refund requested; PayPal confirmation is pending.' WHERE id=$1",[id]);
   return {order,attempt};
  });
 }
 async function claimRefund(id){
  const token=randomUUID(),attempt=await one(pool,"UPDATE ktts_refund_attempts SET lease_token=$3,lease_until=$4 WHERE id=$1 AND environment=$2 AND lease_until<=$5 RETURNING *",[id,environment,token,clock()+110000,clock()]);
  if(!attempt)fail('This refund is being checked. Retry shortly.');return {attempt,token};
 }
 const bindRefund=(id,token,refundId)=>pool.query("UPDATE ktts_refund_attempts SET refund_id=$3,state='BOUND' WHERE id=$1 AND environment=$2 AND lease_token=$4 AND (refund_id IS NULL OR refund_id=$3)",[id,environment,refundId,token]);
 const finishRefund=(id,token)=>pool.query("UPDATE ktts_refund_attempts SET state='DONE' WHERE id=$1 AND environment=$2 AND lease_token=$3",[id,environment,token]);
 const releaseRefund=(id,token)=>pool.query('UPDATE ktts_refund_attempts SET lease_token=NULL,lease_until=0 WHERE id=$1 AND environment=$2 AND lease_token=$3',[id,environment,token]);
 const refundsFor=id=>pool.query('SELECT id,amount_cents,refund_id,state,created_at FROM ktts_refund_attempts WHERE order_id=$1 AND environment=$2 ORDER BY created_at DESC',[id,environment]).then(result=>result.rows.map(record));
 return {reserve,bindPayment,capture,cancel,expireReservations,setStock,fulfill,get,findByPayment,findByCapture,list,ownerOrder,listStock,findAttempt,claimPayment,releasePayment,adjustPayment,requestRefund,claimRefund,bindRefund,finishRefund,releaseRefund,refundsFor};
}
export async function connectOrders(connectionString,{environment}={}){
 if(!connectionString)throw Error('Configure durable order storage privately.');
 const {Pool}=await import('pg');
 const pool=new Pool({connectionString:databaseConnection(connectionString),max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true});
 pool.on('error',()=>console.error('Order database connection interrupted.'));
 return {...createPostgresOrders(applicationPool(pool),{environment}),close:()=>pool.end()};
}
