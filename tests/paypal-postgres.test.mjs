import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createPostgresSandboxOrders} from '../server/paypal-orders-postgres.mjs';
import {createMemberStore} from '../membership.js';
import {createVercelApp} from '../server/vercel-app.mjs';
import {products} from '../storefront-state.js';
const origin='https://preview.example',paymentId='TESTORDER123456789';
async function database(clock=Date.now){
 const db=new PGlite();await db.exec(await readFile(new URL('../server/members-schema.sql',import.meta.url),'utf8'));
 const pool={query:(sql,args)=>db.query(sql,args),end:()=>db.close()};
 return {db,pool,store:createPostgresSandboxOrders(pool,clock)};
}
test('Postgres sandbox claims are exclusive, expire safely, and cannot overwrite newer work',async()=>{
 let now=1700000000000;const {db,store,pool}=await database(()=>now),other=createPostgresSandboxOrders(pool,()=>now);
 const record={local_id:'test-local',session_hash:'session',cart_hash:'cart',total_cents:1200,items_json:'[]',created_at:now};
 try{
  await Promise.all([store.reserve(record),other.reserve({...record,total_cents:1})]);
  const row=(await db.query('SELECT * FROM ktts_sandbox_orders')).rows[0];assert.equal(row.total_cents,1200);
  const claims=await Promise.all([store.claim(record.local_id,'create','first'),other.claim(record.local_id,'create','second')]);
  assert.equal(claims.filter(Boolean).length,1);
  now+=90001;assert.equal(await other.claim(record.local_id,'create','replacement'),true);
  assert.equal(await store.created(record.local_id,paymentId,'first'),false);
  assert.equal(await other.created(record.local_id,paymentId,'replacement'),true);
  assert.equal(await store.getByPayment(paymentId,'other-session'),null);
  assert.equal((await store.getByPayment(paymentId,'session')).status,'CREATED');
  assert.equal(await store.claim(record.local_id,'capture','capture'),true);
  assert.equal(await store.completed(record.local_id,'CAPTURE123','capture'),true);
  assert.equal(await other.claim(record.local_id,'capture','again'),false);
  const limits=await Promise.all(Array.from({length:25},(_,i)=>(i%2?store:other).consumeAttempt('test-ip')));
  assert.equal(limits.filter(Boolean).length,20);
 }finally{await store.close();}
});
test('Vercel PayPal preview survives concurrent clicks and reconciles a lost capture response',async()=>{
 const {store,db}=await database(),members=createMemberStore(':memory:');
 let allowCreate,createStarted;const startSignal=new Promise(resolve=>createStarted=resolve),gate=new Promise(resolve=>allowCreate=resolve);
 let creates=0,captures=0,paid=false;const calls=[];
 const capture=()=>({id:paymentId,status:'COMPLETED',purchase_units:[{payments:{captures:[{id:'TESTCAPTURE123',status:'COMPLETED',amount:{currency_code:'USD',value:'12.00'}}]}}]});
 const request=async(url,options)=>{
  assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));calls.push({url,method:options.method,id:options.headers['PayPal-Request-Id']});
  if(url.endsWith('/oauth2/token'))return {ok:true,json:async()=>({access_token:'test-only',expires_in:3600})};
  if(options.method==='GET')return {ok:true,json:async()=>paid?capture():{id:paymentId,status:'APPROVED'}};
  if(url.endsWith('/capture')){captures++;paid=true;throw Error('simulated lost response');}
  creates++;createStarted();await gate;
  assert.equal(JSON.parse(options.body).purchase_units[0].amount.value,'12.00');
  return {ok:true,json:async()=>({id:paymentId})};
 };
 try{
  const user=await members.signup('preview_test','test only long password');members.grant(user.username,1);
  const memberCookie='ktts_member='+members.session(user);
  const env={VERCEL_ENV:'preview',KTTS_ORIGIN:origin,DATABASE_URL:'test-only',KTTS_PAYPAL_SANDBOX:'1',PAYPAL_SANDBOX_CLIENT_ID:'test-client',PAYPAL_SANDBOX_CLIENT_SECRET:'test-secret'};
  const settings={env,connect:async()=>members,connectOrders:async()=>store,paypalRequest:request};
  const firstApp=createVercelApp(settings),secondApp=createVercelApp(settings);
  const call=(app,action,body,cookie=memberCookie)=>app(new Request(origin+'/api/index?kind=paypal&action='+action,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','x-forwarded-for':'192.0.2.2'},...(body?{body:JSON.stringify(body)}:{})}));
  const config=await call(firstApp,'config');assert.equal((await config.json()).enabled,true);assert.match(config.headers.get('set-cookie'),/Secure/);
  const cookie=memberCookie+'; '+config.headers.get('set-cookie').split(';')[0];
  const body={items:{[products[0].id+'::mini']:1},nonce:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',totalCents:1};
  const pending=call(firstApp,'orders',body,cookie);
  await startSignal;
  const duplicate=await call(secondApp,'orders',body,cookie);assert.equal(duplicate.status,409);
  allowCreate();assert.equal((await pending).status,200);assert.equal(creates,1);
  assert.equal((await call(secondApp,'orders',body,cookie)).status,200);assert.equal(creates,1);
  assert.equal((await call(firstApp,'orders/'+paymentId+'/capture',{},memberCookie+'; ktts_sandbox='+'b'.repeat(64))).status,404);
  const failed=await call(firstApp,'orders/'+paymentId+'/capture',{},cookie);assert.equal(failed.status,400);
  assert.equal(captures,1);
  const retry=await call(secondApp,'orders/'+paymentId+'/capture',{},cookie);assert.equal(retry.status,200);assert.equal((await retry.json()).test,true);
  assert.equal(captures,1);assert.equal((await db.query('SELECT status FROM ktts_sandbox_orders')).rows[0].status,'COMPLETED');
  assert.ok(calls.filter(call=>call.method==='POST'&&!call.url.endsWith('/oauth2/token')).every(call=>call.id&&call.id.length<=38));
  const live=createVercelApp({...settings,env:{...env,VERCEL_ENV:'production'}});
  const liveConfig=await call(live,'config');assert.equal((await liveConfig.json()).enabled,false);
  assert.equal((await call(live,'orders',body,cookie)).status,503);
 }finally{allowCreate?.();members.close();await store.close();}
});
