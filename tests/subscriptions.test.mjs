import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {applicationPool} from '../server/postgres-schema.mjs';
import {createSubscriptionsStore} from '../server/subscriptions-postgres.mjs';
import {createPersonalReadingsStore} from '../server/personal-readings-postgres.mjs';
import {createSubscriptionsApi,subscriptionConfig} from '../server/subscriptions-api.mjs';
import {createPaypalSubscriptions} from '../server/paypal-subscriptions.mjs';
import {createSubscriptionReconciler} from '../server/subscription-reconcile.mjs';
import {membershipTerms,monthlyBoundary,paidPeriod,validateMonthlyPlan,subscriptionApproval,billingAnchor} from '../server/subscription-core.mjs';
const origin='https://store.example',plan='P-TESTMONTHLY1111',providerId='I-TESTSUB111111',day=86400000;
const monthlyPlan=()=>({id:plan,status:'ACTIVE',billing_cycles:[{tenure_type:'REGULAR',sequence:1,total_cycles:0,frequency:{interval_unit:'MONTH',interval_count:1},pricing_scheme:{fixed_price:{currency_code:'USD',value:'11.11'}}}],payment_preferences:{auto_bill_outstanding:false,payment_failure_threshold:1}});
test('monthly periods preserve the anchor day across short months and plans cannot drift from $11.11',()=>{
 const anchor=Date.parse('2028-01-31T15:00:00Z');assert.equal(new Date(monthlyBoundary(anchor,1)).toISOString(),'2028-02-29T15:00:00.000Z');assert.equal(new Date(monthlyBoundary(anchor,2)).toISOString(),'2028-03-31T15:00:00.000Z');
 assert.equal(paidPeriod(anchor,Date.parse('2028-03-01T10:00:00Z')).periodStart,monthlyBoundary(anchor,1));
 validateMonthlyPlan(monthlyPlan(),plan);const wrong=monthlyPlan();wrong.billing_cycles[0].pricing_scheme.fixed_price.value='11.12';assert.throws(()=>validateMonthlyPlan(wrong,plan));
 const link={id:providerId,links:[{rel:'approve',href:'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-TESTAPPROVAL111'}]};assert.match(subscriptionApproval(link,'sandbox'),/sandbox/);assert.throws(()=>subscriptionApproval(link,'live'));
});
test('billing configuration cannot enable live charges with sandbox credentials or an unreviewed launch',()=>{
 const env={VERCEL_ENV:'preview',DATABASE_URL:'test',KTTS_SUBSCRIPTIONS_SANDBOX:'1',PAYPAL_SANDBOX_CLIENT_ID:'test',PAYPAL_SANDBOX_CLIENT_SECRET:'test',PAYPAL_SANDBOX_TAROT_PLAN_ID:plan,PAYPAL_SANDBOX_WEBHOOK_ID:'test'};
 assert.equal(subscriptionConfig(env).enabled,true);assert.equal(subscriptionConfig({...env,KTTS_PRODUCTION:'1'}).enabled,false);assert.equal(subscriptionConfig({...env,VERCEL_ENV:'production',KTTS_LIVE_SUBSCRIPTIONS:'1'}).enabled,false);
});
test('PayPal scheduled renewal hour, not signup hour, defines the next paid month',async()=>{
 const f=await fixture();try{
  const local=await f.join(),scheduled=Date.parse('2026-11-18T00:00:00Z');
  // The fixture starts at 04:50 UTC; PayPal may renew earlier on the same date.
  f.setRemote({status:'ACTIVE',billing_info:{next_billing_time:new Date(scheduled).toISOString()}});
  f.setPayments([f.sale()]);await f.reconciler.sync(local.id,1);assert.equal((await f.readings.summary(1)).credits,1);
  assert.equal(Number((await f.db.query('SELECT paid_member_until FROM ktts_users WHERE id=1')).rows[0].paid_member_until),scheduled);
  const firstAnchor=billingAnchor(f.getRemote());f.setNow(scheduled+1000);
  f.setRemote({billing_info:{next_billing_time:'2026-12-18T00:00:00Z'}});
  const renewal={...f.sale(1),time:new Date(scheduled).toISOString()};f.setPayments([f.sale(),renewal]);
  await f.reconciler.sync(local.id,1);await f.reconciler.sync(local.id,1);assert.equal((await f.readings.summary(1)).credits,2);
  f.setRemote({status:'CANCELLED',billing_info:{}});await f.reconciler.sync(local.id,1);assert.equal((await f.store.get(local.id,1)).billing_anchor,firstAnchor);assert.equal((await f.readings.summary(1)).credits,2);
  assert.equal(new Date(billingAnchor({start_time:'2028-01-31T14:23:38Z',billing_info:{next_billing_time:'2028-02-29T10:00:00Z'}})).toISOString(),'2028-01-31T10:00:00.000Z');
 }finally{await f.db.close();}
});
test('calibrating a provider schedule preserves an already funded period and credits the following renewal once',async()=>{
 const f=await fixture();try{
  const local=await f.join();f.setRemote({status:'ACTIVE'});f.setPayments([f.sale()]);await f.reconciler.sync(local.id,1);
  const original=await f.readings.payment(f.sale().id),next=Date.parse('2026-11-18T00:00:00Z');
  f.setRemote({billing_info:{next_billing_time:new Date(next).toISOString()}});await f.reconciler.sync(local.id,1);
  assert.equal((await f.readings.summary(1)).credits,1);assert.equal(Number((await f.readings.payment(f.sale().id)).period_end),Number(original.period_end));
  f.setNow(next+1000);f.setRemote({billing_info:{next_billing_time:'2026-12-18T00:00:00Z'}});f.setPayments([f.sale(),{...f.sale(1),time:new Date(next).toISOString()}]);
  await f.reconciler.sync(local.id,1);await f.reconciler.sync(local.id,1);assert.equal((await f.readings.summary(1)).credits,2);
 }finally{await f.db.close();}
});
test('PayPal subscriptions use fixed plan, bound local ID, safe redirects and 204 cancellation',async()=>{
 const calls=[],local={id:randomUUID(),plan_id:plan};
 const gateway=createPaypalSubscriptions({mode:'sandbox',clientId:'test',secret:'test',origin,plan,request:async(url,options)=>{
  calls.push({url,options});if(url.endsWith('/token'))return Response.json({access_token:'test',expires_in:3600});if(url.includes('/plans/'))return Response.json(monthlyPlan());if(url.endsWith('/cancel'))return new Response(null,{status:204});if(url.includes('/transactions?'))return Response.json({total_items:0,total_pages:0});
  return Response.json({id:providerId,plan_id:plan,custom_id:local.id,status:'APPROVAL_PENDING',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-TESTAPPROVAL111'}]});
 }});
 await gateway.create(local);const created=calls.find(c=>c.url.endsWith('/v1/billing/subscriptions'));const body=JSON.parse(created.options.body);
 assert.equal(created.options.headers['PayPal-Request-Id'],local.id);assert.equal(body.custom_id,local.id);assert.equal(body.plan_id,plan);assert.equal(body.application_context.shipping_preference,'NO_SHIPPING');assert.match(body.application_context.return_url,new RegExp('^https://store.example/'));
 assert.equal(await gateway.cancel(providerId),null);assert.ok(calls.every(c=>c.url.startsWith('https://api-m.sandbox.paypal.com/')));
 assert.deepEqual(await gateway.transactions(providerId,Date.now()-60000,Date.now()),[]);
});
async function fixture(){
 let now=Date.parse('2026-10-18T05:00:00Z');const anchor=now-600000,db=new PGlite();
 for(const file of ['members-schema.sql','personal-readings-schema.sql','subscriptions-schema.sql'])await db.exec(await readFile(new URL('../server/'+file,import.meta.url),'utf8'));
 await db.query("INSERT INTO ktts_users(id,username,salt,password_hash,created_at) VALUES(1,'subscription_qa','test','test',0),(2,'other_qa','test','test',0)");
 let queue=Promise.resolve();const pool=applicationPool({query:(sql,args)=>db.query(sql,args),connect:async()=>{const previous=queue;let release;queue=new Promise(r=>release=r);await previous;return {query:(sql,args)=>db.query(sql,args),release};}});
 const clock=()=>now,store=createSubscriptionsStore(pool,{environment:'sandbox',clock}),readings=createPersonalReadingsStore(pool,{environment:'sandbox',clock});
 let remote,transactions=[],creates=0,cancels=0;
 const gateway={verifyPlan:async()=>monthlyPlan(),create:async local=>{creates++;remote={id:providerId,plan_id:plan,custom_id:local.id,status:'APPROVAL_PENDING',start_time:new Date(anchor).toISOString(),create_time:new Date(anchor).toISOString(),status_update_time:new Date(now).toISOString(),links:[{rel:'approve',href:'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-TESTAPPROVAL111'}]};return structuredClone(remote);},read:async()=>structuredClone(remote),transactions:async(id,start,end)=>transactions.filter(t=>Date.parse(t.time)>=start&&Date.parse(t.time)<=end).map(t=>structuredClone(t)),cancel:async()=>{cancels++;remote.status='CANCELLED';remote.status_update_time=new Date(++now).toISOString();},readSale:async()=>({billing_agreement_id:providerId,create_time:new Date(anchor+1000).toISOString()})};
 const reconciler=createSubscriptionReconciler({store,readings,gateway,clock});let user={id:1};
 const api=createSubscriptionsApi({origin,mode:'sandbox',enabled:true,plan,authenticate:async()=>user,getStore:async()=>store,getGateway:async()=>gateway,getReconciler:async()=>reconciler,clock});
 const call=(action,data,from=origin)=>api(new Request(origin+'/api/subscriptions/'+action,{method:data?'POST':'GET',headers:{Origin:from,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),action);
 const sale=(index=0,status='COMPLETED')=>({id:'SALEPAYMENT'+String(index).padStart(6,'0'),status,time:new Date(monthlyBoundary(anchor,index)+1000).toISOString(),amount_with_breakdown:{gross_amount:{currency_code:'USD',value:'11.11'}}});
 const join=async()=>{const result=await call('join',{nonce:randomUUID(),consent:true,termsVersion:membershipTerms.version});assert.equal(result.status,200);return (await result.json()).subscription;};
 return {db,store,readings,reconciler,gateway,call,join,sale,anchor,setUser:value=>user=value,setNow:value=>now=value,getRemote:()=>remote,setRemote:values=>Object.assign(remote,values),setPayments:values=>transactions=values,getCreates:()=>creates,getCancels:()=>cancels};
}
test('pending and approved agreements process lifecycle callbacks without unavailable transaction history',async()=>{
 const f=await fixture();try{
  const local=await f.join();let historyCalls=0;f.gateway.transactions=async()=>{historyCalls++;throw Error('PayPal pending history returns 404');};
  assert.deepEqual(await f.reconciler.event({event_type:'BILLING.SUBSCRIPTION.CREATED',resource:{id:providerId}}),{reconciled:true});
  f.setRemote({status:'APPROVED'});await f.reconciler.sync(local.id,1);
  assert.equal(historyCalls,0);assert.equal((await f.readings.summary(1)).credits,0);
  await assert.rejects(f.reconciler.event({event_type:'PAYMENT.SALE.COMPLETED',resource:{id:f.sale().id,billing_agreement_id:providerId,create_time:f.sale().time}}),/not activated/);
  f.setRemote({status:'ACTIVE'});await assert.rejects(f.reconciler.sync(local.id,1),/404/);assert.equal(historyCalls,1);
  assert.equal((await f.readings.summary(1)).credits,0);
 }finally{await f.db.close();}
});
test('approval grants nothing; verified renewal earns once; cancellation retains the paid period and bank',async()=>{
 const f=await fixture();try{
  const local=await f.join();await f.reconciler.sync(local.id,1);assert.equal((await f.readings.summary(1)).credits,0);
  f.setRemote({status:'ACTIVE'});f.setPayments([f.sale()]);await f.reconciler.sync(local.id,1);await f.reconciler.sync(local.id,1);assert.equal((await f.readings.summary(1)).credits,1);
  f.setNow(monthlyBoundary(f.anchor,1)+10000);f.setPayments([f.sale(),f.sale(1)]);await f.reconciler.sync(local.id,1);assert.equal((await f.readings.summary(1)).credits,2);
  const paidUntil=Number((await f.db.query('SELECT paid_member_until FROM ktts_users WHERE id=1')).rows[0].paid_member_until);assert.equal(paidUntil,monthlyBoundary(f.anchor,2));
  const canceled=await f.call('cancel',{id:local.id,confirm:true});assert.equal(canceled.status,200);assert.equal((await canceled.json()).subscription.status,'CANCELLED');assert.equal(f.getCancels(),1);
  await f.call('cancel',{id:local.id,confirm:true});assert.equal(f.getCancels(),1);assert.equal((await f.readings.summary(1)).credits,2);assert.equal(Number((await f.db.query('SELECT paid_member_until FROM ktts_users WHERE id=1')).rows[0].paid_member_until),paidUntil);
 }finally{await f.db.close();}
});
test('member binding, consent, CSRF, duplicate clicks and leases protect recurring billing',async()=>{
 const f=await fixture();try{
  f.setUser(null);assert.equal((await f.call('join',{nonce:randomUUID(),consent:true,termsVersion:membershipTerms.version})).status,401);f.setUser({id:1});assert.equal((await f.call('join',{nonce:randomUUID()})).status,400);
  assert.equal((await f.call('join',{},'https://evil.example')).status,403);
  const local=await f.join();await f.join();assert.equal(f.getCreates(),1);
  const claims=await Promise.allSettled([f.store.claim(local.id,1),f.store.claim(local.id,1)]);assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);await f.store.release(local.id,claims.find(r=>r.status==='fulfilled').value.token);
  f.setUser({id:2});assert.equal((await f.call('sync',{id:local.id})).status,404);assert.equal((await (await f.call('me')).json()).subscription,null);
  const raw=await f.store.get(local.id,1);assert.equal(raw.status,'APPROVAL_PENDING');assert.equal(f.getCreates(),1);
 }finally{await f.db.close();}
});
test('mismatched plans, foreign account metadata and wrong payment amounts never grant access',async()=>{
 const f=await fixture();try{
  const local=await f.join();f.setRemote({custom_id:randomUUID()});await assert.rejects(f.reconciler.sync(local.id,1),/do not match/);f.setRemote({custom_id:local.id,status:'ACTIVE'});
  const bad=f.sale();bad.amount_with_breakdown.gross_amount.value='1.11';f.setPayments([bad]);await assert.rejects(f.reconciler.sync(local.id,1),/amount/);assert.equal((await f.readings.summary(1)).credits,0);
  assert.equal(Number((await f.db.query('SELECT paid_member_until FROM ktts_users WHERE id=1')).rows[0].paid_member_until),0);
 }finally{await f.db.close();}
});
test('full refunds remove the funded unused credit, preserve saved work and never resurrect on a duplicate payment',async()=>{
 const f=await fixture();try{
  const local=await f.join();f.setRemote({status:'ACTIVE'});f.setPayments([f.sale()]);await f.reconciler.sync(local.id,1);
  f.setPayments([f.sale(0,'REFUNDED')]);await f.reconciler.sync(local.id,1);assert.equal((await f.readings.summary(1)).credits,0);
  f.setPayments([f.sale()]);await f.reconciler.sync(local.id,1);assert.equal((await f.readings.summary(1)).credits,0);assert.equal(Number((await f.db.query('SELECT paid_member_until FROM ktts_users WHERE id=1')).rows[0].paid_member_until),0);
  // A different paid month is unaffected by the previous month's refund.
  f.setNow(monthlyBoundary(f.anchor,1)+10000);f.setPayments([f.sale(0,'REFUNDED'),f.sale(1)]);await f.reconciler.sync(local.id,1);
  const request=await f.readings.request(1,{nonce:randomUUID(),email:'qa@example.invalid',question:'SYNTHETIC REFUND TEST'});await f.readings.deliver(request.id,{responseText:'SYNTHETIC SAVED READING — NOT A KEIANNA READING.'});
  f.setPayments([f.sale(0,'REFUNDED'),f.sale(1,'REFUNDED')]);await f.reconciler.sync(local.id,1);const summary=await f.readings.summary(1);assert.equal(summary.requests[0].status,'READY');assert.ok(summary.requests[0].response_text);assert.equal(summary.requests[0].payment_review,true);
 }finally{await f.db.close();}
});
test('a reversed payment arriving before completion creates no spendable credit; unfinished funded work is held',async()=>{
 const f=await fixture();try{
  const local=await f.join();f.setRemote({status:'ACTIVE'});f.setPayments([f.sale()]);
  await f.reconciler.event({event_type:'PAYMENT.SALE.REVERSED',resource:{id:f.sale().id,billing_agreement_id:providerId,create_time:f.sale().time}});
  assert.equal((await f.readings.summary(1)).credits,0);await f.reconciler.sync(local.id,1);assert.equal((await f.readings.summary(1)).credits,0);
  f.setNow(monthlyBoundary(f.anchor,1)+10000);f.setPayments([f.sale(1)]);await f.reconciler.sync(local.id,1);const request=await f.readings.request(1,{nonce:randomUUID(),email:'qa@example.invalid',question:'SYNTHETIC HELD REQUEST'});
  f.setPayments([f.sale(1,'REFUNDED')]);await f.reconciler.sync(local.id,1);await assert.rejects(f.readings.start(request.id));await assert.rejects(f.readings.deliver(request.id,{responseText:'This must not be delivered.'}),/payment review/);
 }finally{await f.db.close();}
});
