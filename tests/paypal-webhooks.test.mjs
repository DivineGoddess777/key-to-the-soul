import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createPaypalWebhookHandler,createPaypalWebhookVerifier,createPostgresWebhookEvents,createOrderPaymentReconciler} from '../server/paypal-webhooks.mjs';
const event={id:'WH-TEST-EVENT123',event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'CAPTURETEST123',supplementary_data:{related_ids:{order_id:'PAYPALORDER123'}}}};
const headers={'content-type':'application/json','paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.sandbox.paypal.com/v1/notifications/certs/TEST-CERT','paypal-transmission-id':'TEST-TRANSMISSION123','paypal-transmission-sig':'test-signature-only-not-real','paypal-transmission-time':'2026-10-18T03:30:00Z'};
const request=(payload=event,extra={})=>new Request('https://store.example/api/paypal/webhook',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(payload)});
async function database(){
 const db=new PGlite();await db.exec(await readFile(new URL('../server/orders-schema.sql',import.meta.url),'utf8'));
 return {db,pool:{query:(sql,args)=>db.query(sql,args)}};
}

test('webhooks reject bad signatures and oversized or malformed events without persisting or reconciling',async()=>{
 const {db,pool}=await database();let processed=0,verifies=0;
 const handler=createPaypalWebhookHandler({webhookId:'TESTWEBHOOK123',verify:async()=>{verifies++;return false;},store:createPostgresWebhookEvents(pool,{environment:'sandbox'}),onVerifiedEvent:async()=>processed++});
 try{
  assert.equal((await handler(request())).status,403);
  assert.equal((await handler(request(event,{'paypal-cert-url':'http://127.0.0.1/private'}))).status,400);
  assert.equal((await handler(request(event,{'paypal-transmission-sig':''}))).status,400);
  assert.equal((await handler(request({...event,resource:{id:'x'.repeat(262145)}}))).status,400);
  assert.equal((await handler(new Request('https://store.example/api/paypal/webhook'))).status,405);
  assert.equal(verifies,1);assert.equal(processed,0);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ktts_payment_events')).rows[0].n,0);
 }finally{await db.close();}
});

test('verified duplicate events reconcile once, survive failures, and remain environment-isolated',async()=>{
 const {db,pool}=await database();let processed=0,fail=true;
 const settings={webhookId:'TESTWEBHOOK123',verify:async()=>true,store:createPostgresWebhookEvents(pool,{environment:'sandbox'}),onVerifiedEvent:async()=>{processed++;if(fail)throw Error('Retryable database failure');}};
 const handler=createPaypalWebhookHandler(settings);
 try{
  assert.equal((await handler(request())).status,503);
  fail=false;assert.equal((await handler(request())).status,200);
  assert.equal((await handler(request())).status,200);assert.equal(processed,2);
  const row=(await db.query('SELECT * FROM ktts_payment_events')).rows[0];assert.equal(row.state,'PROCESSED');assert.equal(row.attempts,2);
  // Reordered JSON is the same event; altered signed data with the same ID conflicts.
  assert.equal((await handler(request({resource:event.resource,event_type:event.event_type,id:event.id}))).status,200);
  assert.equal((await handler(request({...event,resource:{...event.resource,id:'OTHER123'}}))).status,409);
  const live=createPostgresWebhookEvents(pool,{environment:'live'});
  assert.equal(await live.claim(event,'different-env-hash','live-lease'),'claimed');
 }finally{await db.close();}
});

test('only one event worker holds a lease and crashed work can be retried',async()=>{
 const {db,pool}=await database();let now=1700000000000;
 const first=createPostgresWebhookEvents(pool,{environment:'sandbox',clock:()=>now}),second=createPostgresWebhookEvents(pool,{environment:'sandbox',clock:()=>now});
 try{
  const claims=await Promise.all([first.claim(event,'same-hash','first'),second.claim(event,'same-hash','second')]);assert.equal(claims.filter(c=>c==='claimed').length,1);
  now+=90001;assert.equal(await second.claim(event,'same-hash','replacement'),'claimed');
  assert.equal(await first.finish(event.id,'first'),false);assert.equal(await second.finish(event.id,'replacement'),true);
 }finally{await db.close();}
});

test('verification uses fixed PayPal endpoints, configured webhook ID, and only SUCCESS is trusted',async()=>{
 let calls=[],success=false;
 const verify=createPaypalWebhookVerifier({mode:'sandbox',clientId:'test-client',secret:'test-secret',request:async(url,options)=>{
  calls.push(url);assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));
  if(url.endsWith('/oauth2/token'))return {ok:true,json:async()=>({access_token:'test-token',expires_in:3600})};
  const payload=JSON.parse(options.body);assert.equal(payload.webhook_id,'TESTWEBHOOK123');assert.equal(payload.webhook_event.id,event.id);
  return {ok:true,json:async()=>({verification_status:success?'SUCCESS':'FAILURE'})};
 }});
 const store={claim:async()=> 'claimed',finish:async()=>true,release:async()=>{}};
 let processed=0;const handler=createPaypalWebhookHandler({webhookId:'TESTWEBHOOK123',verify,store,onVerifiedEvent:async()=>processed++});
 assert.equal((await handler(request())).status,403);success=true;
 assert.equal((await handler(request())).status,200);assert.equal(processed,1);assert.equal(calls.filter(url=>url.endsWith('/oauth2/token')).length,1);
});

test('capture reconciliation reads PayPal again and does not trust a mismatched notification capture',async()=>{
 let captures=0,reads=0;const orders={findByPayment:async id=>id==='PAYPALORDER123'?{id:'local-order'}:null,capture:async()=>{captures++;return {status:'PAID'};}};
 const reconcile=createOrderPaymentReconciler({orders,readPayPalOrder:async id=>{reads++;assert.equal(id,'PAYPALORDER123');return {purchase_units:[{payments:{captures:[{id:'CAPTURETEST123'}]}}]};}});
 assert.equal((await reconcile(event)).status,'PAID');
 await assert.rejects(reconcile({...event,resource:{...event.resource,id:'WRONG123'}}),/mismatch/);
 assert.equal(captures,1);assert.equal(reads,2);
 assert.deepEqual(await reconcile({...event,event_type:'UNSUPPORTED.EVENT'}),{ignored:true});
});
