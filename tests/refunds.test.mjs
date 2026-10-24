import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {products} from '../storefront-state.js';
import {orderItems,orderCustomer,addressFingerprint} from '../server/order-core.mjs';
import {createPostgresOrders} from '../server/orders-postgres.mjs';
import {applicationPool} from '../server/postgres-schema.mjs';
import {refundOrder} from '../server/paypal-refunds.mjs';
import {createOrderPaymentReconciler} from '../server/paypal-webhooks.mjs';
const customer={name:'Synthetic Refund QA',email:'qa@example.invalid',address:{line1:'TEST ONLY DO NOT SHIP',city:'Test',region:'PA',postalCode:'16335',country:'US'}};
async function fixture({captured=true}={}){
 const db=new PGlite();await db.exec(await readFile(new URL('../server/orders-schema.sql',import.meta.url),'utf8'));let queue=Promise.resolve();
 const pool=applicationPool({query:(sql,args)=>db.query(sql,args),connect:async()=>{const previous=queue;let release;queue=new Promise(r=>release=r);await previous;return {query:(sql,args)=>db.query(sql,args),release};}});
 const store=createPostgresOrders(pool,{environment:'sandbox'}),sku=products[0].id+'::mini',items={[sku]:1};await store.setStock(sku,{mode:'ready_stock',onHand:2});
 const delivery={reviewed:true,shippingCents:0,taxCents:0,addressHash:addressFingerprint(orderCustomer(customer)),itemsHash:orderItems(items).itemsHash,expiresAt:Date.now()+600000,reference:'SYNTHETIC REFUND QUOTE',policyVersion:'qa-only',processingTime:'Not a real order'};
 let order=await store.reserve({sessionHash:'a'.repeat(64),nonce:randomUUID(),items,customer,delivery});order=await store.bindPayment(order.id,order.session_hash,'TESTREFUNDORDER1');
 const capture={id:'TESTCAPTURE111',status:'COMPLETED',amount:{currency_code:'USD',value:'12.00'},supplementary_data:{related_ids:{order_id:order.paypal_id}}};
 const payload=()=>({id:order.paypal_id,status:'COMPLETED',purchase_units:[{custom_id:order.id,payments:{captures:[capture]}}]});
 if(captured)order=await store.capture(order.id,payload());
 const refunds=new Map();let sent=0,timeout=false,partial=0;
 const gateway={read:async()=>payload(),readCapture:async()=>structuredClone(capture),readRefund:async id=>structuredClone([...refunds.values()].find(r=>r.id===id)),refund:async(record,attempt)=>{
  if(!refunds.has(attempt.id)){sent++;partial+=attempt.amount_cents;capture.status=partial===1200?'REFUNDED':'PARTIALLY_REFUNDED';capture.seller_receivable_breakdown={total_refunded_amount:{currency_code:'USD',value:(partial/100).toFixed(2)}};refunds.set(attempt.id,{id:'REFUNDTEST'+String(sent).padStart(6,'0'),status:'COMPLETED',amount:{currency_code:'USD',value:(attempt.amount_cents/100).toFixed(2)},links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/'+capture.id}]});}
  if(timeout){timeout=false;throw Error('Synthetic timeout after PayPal refunded.');}return structuredClone(refunds.get(attempt.id));
 }};
 return {db,store,order,gateway,capture,payload,sku,getSent:()=>sent,setTimeout:()=>timeout=true};
}
test('a lost refund response reuses the same attempt and never refunds twice; unrelated stock is not restored',async()=>{
 const f=await fixture();try{
  const nonce=randomUUID(),input={store:f.store,gateway:f.gateway,id:f.order.id,nonce,amountCents:500};f.setTimeout();await assert.rejects(refundOrder(input),/timeout/);
  await assert.rejects(f.store.fulfill(f.order.id,{carrier:'TEST ONLY',trackingNumber:'NO-SHIPMENT'}));
  const recovered=await refundOrder(input);assert.equal(recovered.refund.amountCents,500);assert.equal(recovered.order.payment_status,'PARTIALLY_REFUNDED');assert.equal(recovered.order.refunded_cents,500);
  await refundOrder(input);assert.equal(f.getSent(),1);assert.equal((await f.store.listStock())[0].on_hand,1);
  await assert.rejects(refundOrder({...input,nonce:randomUUID(),amountCents:800}),/remaining/);
  const full=await refundOrder({...input,nonce:randomUUID(),amountCents:700});assert.equal(full.order.payment_status,'REFUNDED');assert.equal(full.order.refunded_cents,1200);assert.equal(f.getSent(),2);
  await f.store.capture(f.order.id,{...f.payload(),purchase_units:[{custom_id:f.order.id,payments:{captures:[{...f.capture,status:'COMPLETED'}]}}]});assert.equal((await f.store.ownerOrder(f.order.id)).payment_status,'REFUNDED');
 }finally{await f.db.close();}
});
test('a refund arriving before the completion callback releases held stock without creating a paid shipment',async()=>{
 const f=await fixture({captured:false});try{
  f.capture.status='REFUNDED';const reconcile=createOrderPaymentReconciler({orders:f.store,readPayPalOrder:f.gateway.read,readCapture:f.gateway.readCapture,readRefund:f.gateway.readRefund});
  const order=await reconcile({event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:f.capture.id,supplementary_data:{related_ids:{order_id:f.order.paypal_id}}}});
  assert.equal(order.payment_status,'REFUNDED');assert.equal(order.status,'PAYMENT_REVIEW');assert.equal((await f.store.listStock())[0].on_hand,2);assert.equal((await f.store.listStock())[0].reserved,0);
  await assert.rejects(f.store.fulfill(f.order.id,{carrier:'TEST ONLY',trackingNumber:'NO-SHIPMENT'}));
 }finally{await f.db.close();}
});
test('signed reversal reconciliation survives a stale completion and rejects a foreign refund capture',async()=>{
 const f=await fixture();try{
  const reconcile=createOrderPaymentReconciler({orders:f.store,readPayPalOrder:f.gateway.read,readCapture:f.gateway.readCapture,readRefund:f.gateway.readRefund});
  await reconcile({event_type:'PAYMENT.CAPTURE.REVERSED',resource:{id:f.capture.id}});assert.equal((await f.store.ownerOrder(f.order.id)).payment_status,'REVERSED');
  await reconcile({event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:f.capture.id,supplementary_data:{related_ids:{order_id:f.order.paypal_id}}}});assert.equal((await f.store.ownerOrder(f.order.id)).payment_status,'REVERSED');
  await assert.rejects(f.store.adjustPayment(f.order.id,{capture:f.capture,refund:{id:'BADREFUND111',status:'COMPLETED',amount:{currency_code:'USD',value:'12.00'},links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/OTHERCAPTURE111'}]}}),/does not match/);
 }finally{await f.db.close();}
});
