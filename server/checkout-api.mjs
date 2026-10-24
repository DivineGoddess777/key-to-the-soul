import {createHash,randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createOrderQuote,orderItems,orderCustomer} from './order-core.mjs';
import {paypalApproval} from './paypal-commerce.mjs';
import {verifyReceiptToken} from './receipt-token.mjs';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const view=order=>({id:order.id,status:order.status,paymentStatus:order.payment_status,refundedCents:order.refunded_cents||0,paymentReviewReason:order.payment_review_reason||null,quote:order.quote_json,customer:order.customer_json,paypalId:order.paypal_id,captureId:order.capture_id,expiresAt:Number(order.expires_at),fulfillment:order.fulfillment_json||null});
async function body(request){
 if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>16384||!request.body)fail('Check the checkout form.');
 let count=0;const chunks=[];
 for await(const chunk of request.body){count+=chunk.byteLength;if(count>16384)fail('This checkout is too large.');chunks.push(Buffer.from(chunk));}
 let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{fail('Check the checkout form.');}
 if(!data||typeof data!=='object'||Array.isArray(data))fail('Check the checkout form.');return data;
}
export function createCheckoutApi({origin,mode,enabled=false,secure=true,getStore,getGateway,quoteDelivery,countries=[],terms,receiptSecret,clock=Date.now}){
 if(!['sandbox','live'].includes(mode))throw Error('Choose the checkout environment.');
 const cookieName=secure?'__Host-ktts_checkout':'ktts_checkout';
 const json=(status,payload,cookie)=>Response.json(payload,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
 function session(request,create=false){
  const found=(request.headers.get('cookie')||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(cookieName+'='));
  let value=found.length===1?found[0].slice(cookieName.length+1):null,cookie;
  if(!/^[a-f0-9]{64}$/.test(value||'')){
   if(!create)fail('Open checkout again in this browser.',401);
   value=randomBytes(32).toString('hex');cookie=cookieName+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+(secure?'; Secure':'');
  }
  return {hash:createHash('sha256').update(value).digest('hex'),cookie};
 }
 async function reconcile(store,gateway,order,remote){
  const captures=remote.purchase_units?.flatMap(unit=>unit.payments?.captures||[])||[];
  if(captures.length===1&&['REFUNDED','PARTIALLY_REFUNDED'].includes(captures[0].status))return store.adjustPayment(order.id,{capture:await gateway.readCapture(captures[0].id),paypalOrder:remote});
  return store.capture(order.id,remote);
 }
 return async(request,action)=>{
  if(!['config','quote','reserve','order','receipt','pay','capture','cancel'].includes(action))return json(404,{error:'Not found.'});
  const method=['config','order','receipt'].includes(action)?'GET':'POST';
  if(request.method!==method)return json(405,{error:'Use the checkout controls.'});
  if(action==='config'){
   const s=enabled?session(request,true):{};
   return json(200,{enabled,mode,countries,terms,message:enabled?mode==='sandbox'?'Sandbox checkout: test accounts only. No real charge.':'Secure checkout with PayPal.':'Online ordering opens soon. Your ritual bag is saved for later.'},s.cookie);
  }
  if(action==='receipt'){
   const id=verifyReceiptToken(new URL(request.url).searchParams.get('token'),mode,receiptSecret,clock());if(!id)return json(404,{error:'This private receipt link is unavailable or has expired.'});
   try{const order=await (await getStore()).ownerOrder(id);return order?.capture_id?json(200,{order:view(order)}):json(404,{error:'Receipt not found.'});}
   catch{return json(503,{error:'Your receipt is temporarily unavailable. Contact support@keytothesoul.com.'});}
  }
  if(!enabled)return json(503,{error:'Online ordering is not open yet. No payment was initiated.'});
  try{
   if(method==='POST'&&request.headers.get('origin')!==origin)fail('Use checkout on this site.',403);
   const s=session(request),data=method==='POST'?await body(request):null,store=await getStore();
   if(action==='quote'||action==='reserve'){
    if(action==='reserve'&&!uuid(data.nonce))fail('Start a new checkout attempt.');
    if(action==='reserve'){
     const existing=await store.findAttempt(s.hash,data.nonce);
     if(existing){
      if(!isDeepStrictEqual(existing.quote_json.lines,orderItems(data.items).lines)||!isDeepStrictEqual(orderCustomer(data.customer),orderCustomer(existing.customer_json)))fail('Checkout details changed. Start again.',409);
      return json(200,{order:view(existing)});
     }
    }
    const delivery=await quoteDelivery(data.items,data.customer),snapshot=createOrderQuote(data.items,data.customer,delivery,clock());
    if(action==='quote')return json(200,{quote:snapshot.quote,customer:snapshot.customer,fingerprint:snapshot.fingerprint});
    if(data.quoteFingerprint!==snapshot.fingerprint)fail('Your total changed. Review checkout again.',409);
    const order=await store.reserve({sessionHash:s.hash,nonce:data.nonce,items:data.items,customer:data.customer,delivery});
    return json(200,{order:view(order)});
   }
   const id=method==='GET'?new URL(request.url).searchParams.get('id'):data.id;
   if(!uuid(id))fail('Invalid order reference.');
   let order=await store.get(id,s.hash);if(!order)fail('This order is unavailable in this browser.',404);
   if(action==='order'){
    if(order.paypal_id){
     const gateway=await getGateway(),remote=await gateway.read(order.paypal_id);
     if(remote.status==='COMPLETED')order=await reconcile(store,gateway,order,remote);
    }
    return json(200,{order:view(order)});
   }
   if(action==='cancel')return json(200,{order:view(await store.cancel(id,s.hash))});
   const gateway=await getGateway();
   // Recover a completed capture before attempting another charge, including a
   // return after a reservation expired. Late payments require owner review.
   if(order.capture_id)return json(200,{order:view(order)});
   if(order.paypal_id){
    const remote=await gateway.read(order.paypal_id);
    if(remote.status==='COMPLETED')return json(200,{order:view(await reconcile(store,gateway,order,remote))});
    if(action==='pay'){
     if(order.status!=='RESERVED'||Number(order.expires_at)<=clock())fail('Your checkout reservation expired. Start again.',409);
     if(remote.status==='APPROVED')return json(200,{order:view(order),requiresCapture:true});
     return json(200,{order:view(order),approvalUrl:paypalApproval(remote,mode)});
    }
   }
   if(action==='capture'&&data.paypalId!==order.paypal_id)fail('Payment reference does not match this order.',409);
   const lease=await store.claimPayment(id,s.hash,action==='pay'?'create':'capture');
   if(lease.done){
    order=lease.order;
    return action==='pay'&&!order.capture_id?json(200,{order:view(order),approvalUrl:paypalApproval(await gateway.read(order.paypal_id),mode)}):json(200,{order:view(order)});
   }
   try{
    if(action==='pay'){
     const remote=await gateway.create(lease.order);order=await store.bindPayment(id,s.hash,remote.id);
     return json(200,{order:view(order),approvalUrl:paypalApproval(remote,mode)});
    }
    let remote;
    try{remote=await gateway.capture(lease.order);}catch(error){
     // A network timeout can happen after PayPal accepts the capture.
     remote=await gateway.read(lease.order.paypal_id);if(remote.status!=='COMPLETED')throw error;
    }
    order=await reconcile(store,gateway,order,remote);return json(200,{order:view(order)});
   }finally{await store.releasePayment(id,lease.token);}
  }catch(error){return json(error.status||503,{error:error.status?error.message:'Checkout is temporarily unavailable. Check your order before trying again.'});}
 };
}
