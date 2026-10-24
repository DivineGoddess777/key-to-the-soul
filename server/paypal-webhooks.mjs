import {applicationPool,databaseConnection} from './postgres-schema.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {refundCaptureId} from './payment-adjustments.mjs';
const response=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const canonical=(value,depth=0)=>{
 if(depth>32)throw Error('Event too deeply nested.');
 if(Array.isArray(value))return value.map(v=>canonical(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key],depth+1)]));
 return value;
};
async function eventBody(request){
 if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>262144)throw Error('Invalid event body.');
 const chunks=[];let bytes=0;
 if(!request.body)throw Error('Missing event body.');
 for await(const chunk of request.body){bytes+=chunk.byteLength;if(bytes>262144)throw Error('Event too large.');chunks.push(Buffer.from(chunk));}
 const event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 if(!event||Array.isArray(event)||!/^[A-Za-z0-9-]{6,100}$/.test(event.id||'')||!/^[A-Z][A-Z0-9_.]{2,100}$/.test(event.event_type||'')||!event.resource||typeof event.resource!=='object'||Array.isArray(event.resource))throw Error('Invalid event.');
 return event;
}
function verificationBody(headers,event,webhookId){
 const fields={auth_algo:headers.get('paypal-auth-algo'),cert_url:headers.get('paypal-cert-url'),transmission_id:headers.get('paypal-transmission-id'),transmission_sig:headers.get('paypal-transmission-sig'),transmission_time:headers.get('paypal-transmission-time')};
 if(!/^[A-Za-z0-9]{1,100}$/.test(fields.auth_algo||'')||!/^\S{1,50}$/.test(fields.transmission_id||'')||!/^\S{10,500}$/.test(fields.transmission_sig||'')||!fields.transmission_time||fields.transmission_time.length>100||!Number.isFinite(Date.parse(fields.transmission_time)))throw Error('Missing signature headers.');
 const url=new URL(fields.cert_url);
 if(url.protocol!=='https:'||url.username||url.password||!['api.paypal.com','api-m.paypal.com','api.sandbox.paypal.com','api-m.sandbox.paypal.com'].includes(url.hostname)||!url.pathname.startsWith('/v1/notifications/certs/')||url.search||url.hash||fields.cert_url.length>500)throw Error('Invalid certificate address.');
 // We never download a URL supplied in a webhook. PayPal verifies it through
 // its fixed API endpoint, with the owner's configured webhook identifier.
 return {...fields,webhook_id:webhookId,webhook_event:event};
}
export function createPaypalWebhookVerifier({mode,clientId,secret,request=fetch}){
 if(!['sandbox','live'].includes(mode)||!clientId||!secret)throw Error('Configure the chosen PayPal environment privately.');
 const base=mode==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';
 let cached,until=0,pending;
 async function token(){
  if(cached&&until>Date.now()+60000)return cached;
  if(!pending)pending=(async()=>{
   const result=await request(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(clientId+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
   if(!result.ok)throw Error('PayPal verification unavailable.');
   const data=await result.json();if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_in))throw Error('PayPal verification unavailable.');
   cached=data.access_token;until=Date.now()+data.expires_in*1000;return cached;
  })().finally(()=>pending=undefined);
  return pending;
 }
 return async body=>{
  const result=await request(base+'/v1/notifications/verify-webhook-signature',{method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!result.ok)throw Error('PayPal verification unavailable.');
  return (await result.json()).verification_status==='SUCCESS';
 };
}

export function createPaypalWebhookHandler({webhookId,verify,store,onVerifiedEvent}){
 if(!/^[A-Za-z0-9]{1,50}$/.test(webhookId||'')||typeof verify!=='function'||typeof onVerifiedEvent!=='function')throw Error('Configure the webhook before accepting events.');
 return async request=>{
  if(request.method!=='POST')return response(405,{error:'Use POST.'});
  let event,verification,digest;
  try{event=await eventBody(request);verification=verificationBody(request.headers,event,webhookId);digest=createHash('sha256').update(JSON.stringify(canonical(event))).digest('hex');}
  catch{return response(400,{error:'Invalid PayPal event.'});}
  try{if(!await verify(verification))return response(403,{error:'PayPal signature not verified.'});}
  catch{return response(503,{error:'Payment verification is temporarily unavailable.'});}
  const lease=randomUUID();let claimed=false;
  try{
   const claim=await store.claim(event,digest,lease);
   if(claim==='duplicate')return response(200,{received:true,duplicate:true});
   if(claim==='conflict')return response(409,{error:'Event identifier conflict.'});
   if(claim!=='claimed')return response(503,{error:'This payment event is being processed. Retry shortly.'});
   claimed=true;await onVerifiedEvent(event);
   if(!await store.finish(event.id,lease))throw Error('Payment event lease changed.');
   return response(200,{received:true});
  }catch{
   if(claimed)try{await store.release(event.id,lease);}catch{}
   return response(503,{error:'Payment reconciliation is incomplete. Retry this event.'});
  }
 };
}

export function createPostgresWebhookEvents(pool,{environment,clock=Date.now}={}){
 if(!['sandbox','live'].includes(environment))throw Error('Choose an explicit webhook environment.');
 const query=(sql,args)=>pool.query(sql,args);
 return {
  async claim(event,digest,lease){
   await query("INSERT INTO ktts_payment_events(environment,event_id,event_type,resource_id,event_hash,state,received_at) VALUES($1,$2,$3,$4,$5,'VERIFIED',$6) ON CONFLICT(environment,event_id) DO NOTHING",[environment,event.id,event.event_type,String(event.resource.id||'').slice(0,100),digest,clock()]);
   const row=(await query('SELECT event_hash,state FROM ktts_payment_events WHERE environment=$1 AND event_id=$2',[environment,event.id])).rows[0];
   if(row.event_hash!==digest)return 'conflict';
   if(row.state==='PROCESSED')return 'duplicate';
   const claim=await query("UPDATE ktts_payment_events SET lease_token=$3,lease_until=$4,attempts=attempts+1 WHERE environment=$1 AND event_id=$2 AND state<>'PROCESSED' AND lease_until<=$5 RETURNING event_id",[environment,event.id,lease,clock()+90000,clock()]);
   return claim.rows.length?'claimed':'busy';
  },
  async finish(id,lease){return Boolean((await query("UPDATE ktts_payment_events SET state='PROCESSED',processed_at=$4,lease_token=NULL,lease_until=0 WHERE environment=$1 AND event_id=$2 AND lease_token=$3 RETURNING event_id",[environment,id,lease,clock()])).rows.length);},
  release:(id,lease)=>query('UPDATE ktts_payment_events SET lease_token=NULL,lease_until=0 WHERE environment=$1 AND event_id=$2 AND lease_token=$3',[environment,id,lease])
 };
}
export async function connectWebhookEvents(connectionString,{environment}={}){
 if(!connectionString)throw Error('Configure webhook storage privately.');
 const {Pool}=await import('pg');
 const pool=new Pool({connectionString:databaseConnection(connectionString),max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true});
 pool.on('error',()=>console.error('Webhook storage connection interrupted.'));
 return {...createPostgresWebhookEvents(applicationPool(pool),{environment}),close:()=>pool.end()};
}

export function createOrderPaymentReconciler({orders,readPayPalOrder,readCapture,readRefund}){
 return async event=>{
  if(['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED'].includes(event.event_type)){
   let refund,capture;
   if(event.event_type==='PAYMENT.CAPTURE.REFUNDED'){
    if(!/^[A-Z0-9]{6,32}$/.test(event.resource.id||''))throw Error('Invalid refund reference.');
    refund=await readRefund(event.resource.id);const captureId=refundCaptureId(refund);if(!captureId)throw Error('Refund capture reference missing.');capture=await readCapture(captureId);
   }else{if(!/^[A-Z0-9]{6,32}$/.test(event.resource.id||''))throw Error('Invalid capture reference.');capture=await readCapture(event.resource.id);}
   let order=await orders.findByCapture(capture.id),paypalOrder;
   if(!order){const paypalId=capture.supplementary_data?.related_ids?.order_id;if(!/^[A-Z0-9]{10,32}$/.test(paypalId||''))return {ignored:true};order=await orders.findByPayment(paypalId);if(order)paypalOrder=await readPayPalOrder(paypalId);}
   if(!order)return {ignored:true};return orders.adjustPayment(order.id,{capture,refund,paypalOrder,reversed:event.event_type==='PAYMENT.CAPTURE.REVERSED'});
  }
  if(event.event_type!=='PAYMENT.CAPTURE.COMPLETED')return {ignored:true};
  const paypalId=event.resource?.supplementary_data?.related_ids?.order_id;
  if(!/^[A-Z0-9]{10,32}$/.test(paypalId||''))throw Error('Missing payment order reference.');
  const order=await orders.findByPayment(paypalId);
  if(!order)return {ignored:true};
  // A signed notification triggers a fresh fixed-endpoint PayPal order read.
  // Never mark an order paid from browser data or the notification alone.
  const payload=await readPayPalOrder(paypalId);
  const captures=payload?.purchase_units?.flatMap(unit=>unit.payments?.captures||[])||[];
  if(captures.length!==1||captures[0].id!==event.resource.id)throw Error('Capture reference mismatch.');
  if(['REFUNDED','PARTIALLY_REFUNDED'].includes(captures[0].status))return orders.adjustPayment(order.id,{capture:await readCapture(captures[0].id),paypalOrder:payload});
  return orders.capture(order.id,payload);
 };
}
