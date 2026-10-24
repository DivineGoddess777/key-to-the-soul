import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createPersonalReadingsStore} from '../server/personal-readings-postgres.mjs';
import {createPersonalReadingsApi} from '../server/personal-readings-api.mjs';
import {createPostgresMemberStore} from '../server/membership-postgres.mjs';
import {applicationPool} from '../server/postgres-schema.mjs';
const day=86400000,now=1700000000000,origin='https://store.example';
async function fixture(){
 const db=new PGlite();await db.exec(await readFile(new URL('../server/members-schema.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../server/personal-readings-schema.sql',import.meta.url),'utf8'));
 await db.query("INSERT INTO ktts_users(id,username,salt,password_hash,created_at) VALUES(1,'synthetic_reader','test','test',0),(2,'other_reader','test','test',0)");
 let queue=Promise.resolve();const pool=applicationPool({query:(sql,args)=>db.query(sql,args),connect:async()=>{const previous=queue;let release;queue=new Promise(r=>release=r);await previous;return {query:(sql,args)=>db.query(sql,args),release};}});
 return {db,pool,store:createPersonalReadingsStore(pool,{environment:'sandbox',clock:()=>now})};
}
const payment=(index=0,extra={})=>({userId:1,paymentId:'TESTPAYMENT'+String(index).padStart(5,'0'),subscriptionId:'I-TESTSUB12345',periodStart:now-index*30*day,periodEnd:now-index*30*day+30*day,amountCents:1111,currency:'USD',...extra});
const request=extra=>({nonce:randomUUID(),email:'qa@example.invalid',question:'SYNTHETIC TEST ONLY — a new chapter',...extra});
test('verified monthly payments earn one credit, duplicate notifications earn none, bank is capped at 15',async()=>{
 const f=await fixture();try{
  assert.equal((await f.store.applyPaidMonth(payment())).balance,1);
  assert.equal((await f.store.applyPaidMonth(payment())).duplicate,true);
  await assert.rejects(f.store.applyPaidMonth(payment(0,{amountCents:1500})),/not been verified/);
  await assert.rejects(f.store.applyPaidMonth(payment(0,{userId:2})),/different membership/);
  for(let index=1;index<18;index++)await f.store.applyPaidMonth(payment(index));
  assert.equal((await f.store.summary(1)).credits,15);assert.equal((await f.store.summary(2)).credits,0);
  assert.equal((await f.db.query('SELECT SUM(credited)::int AS total FROM ktts_tarot_months')).rows[0].total,15);
  const members=createPostgresMemberStore(f.pool,()=>now),user=(await f.db.query('SELECT * FROM ktts_users WHERE id=1')).rows[0];assert.equal(members.publicUser(user).memberUntil,now+30*day);assert.equal(members.publicUser(user).active,true);
  const invitation=await members.invite({days:1});assert.equal((await members.redeem(user,invitation)).memberUntil,now+31*day);
  assert.equal((await members.revoke('synthetic_reader')).active,false);assert.equal((await f.store.summary(1)).credits,15);
 }finally{await f.db.close();}
});
test('concurrent requests cannot spend the last credit twice; retries keep one private request',async()=>{
 const f=await fixture();try{
  await f.store.applyPaidMonth(payment());
  const input=request(),same=await Promise.all([f.store.request(1,input),f.store.request(1,input)]);assert.equal(same[0].id,same[1].id);assert.equal((await f.store.summary(1)).credits,0);
  await assert.rejects(f.store.request(1,{...input,question:'Changed'}),/request changed/);
  assert.equal((await f.store.summary(2)).requests.length,0);
  await f.store.applyPaidMonth(payment(1));
  const last=await Promise.allSettled([f.store.request(1,request()),f.store.request(1,request())]);assert.equal(last.filter(result=>result.status==='fulfilled').length,1);assert.equal(last.filter(result=>result.status==='rejected').length,1);
 }finally{await f.db.close();}
});
test('personal credits remain separate from deck access and delivered readings are immutable',async()=>{
 const f=await fixture();try{
  await f.store.applyPaidMonth(payment());const reading=await f.store.request(1,request());await f.store.start(reading.id);
  const body={responseText:'SYNTHETIC RESPONSE — NOT A REAL KEIANNA READING. This is a private workflow test.'};
  assert.equal((await f.store.deliver(reading.id,body)).status,'READY');assert.equal((await f.store.deliver(reading.id,body)).status,'READY');
  await assert.rejects(f.store.deliver(reading.id,{responseText:'Changed response'}),/already been delivered/);
  const summary=await f.store.summary(1);assert.equal(summary.requests[0].response_text,body.responseText);assert.equal(summary.credits,0);
  assert.equal(Number((await f.db.query('SELECT paid_member_until FROM ktts_users WHERE id=1')).rows[0].paid_member_until),now+30*day);
  // Banked credits can be used after deck access ends. They have no invented expiry.
  await f.store.applyPaidMonth(payment(1));await f.db.query('UPDATE ktts_users SET paid_member_until=0 WHERE id=1');assert.equal((await f.store.request(1,request())).status,'REQUESTED');
 }finally{await f.db.close();}
});
test('personal-reading API protects questions, denies member access to owner actions, and never grants credits',async()=>{
 const f=await fixture();let user=null;try{
  const api=createPersonalReadingsApi({origin,environment:'sandbox',enabled:true,authenticate:async()=>user,getStore:async()=>f.store,clock:()=>now});
  const call=(action,data,from=origin)=>api(new Request(origin+'/api/personal-readings/'+action,{method:data?'POST':'GET',headers:{Origin:from,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),action);
  assert.equal((await call('me')).status,401);user={id:1};assert.equal((await call('queue')).status,403);assert.equal((await call('grant',{})).status,404);assert.equal((await call('request',request(),'https://elsewhere.example')).status,403);
  await f.store.applyPaidMonth(payment());const created=await (await call('request',request())).json();assert.equal(created.request.user_id,undefined);assert.equal(created.request.nonce,undefined);
  user={id:2};assert.equal((await (await call('me')).json()).requests.length,0);
  user={id:2,store_owner_until:now+1000};assert.equal((await (await call('queue')).json()).requests.length,1);
  assert.equal((await call('deliver',{id:created.request.id,responseText:'SYNTHETIC PRIVATE READING TEST'})).status,200);
  user={id:1};assert.equal((await (await call('me')).json()).requests[0].status,'READY');
 }finally{await f.db.close();}
});
