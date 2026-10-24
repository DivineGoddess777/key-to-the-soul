import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {applicationPool} from '../server/postgres-schema.mjs';
import {createPostgresMemberStore} from '../server/membership-postgres.mjs';
import {createRecoveryStore,sealAccountMail,openAccountMail,renderAccountMail,dispatchAccountMail,recoveryEmail} from '../server/account-recovery.mjs';
import {createRecoveryApi} from '../server/recovery-api.mjs';
import {createVercelApp} from '../server/vercel-app.mjs';
import {createSubscriptionsApi} from '../server/subscriptions-api.mjs';
const secret='a'.repeat(64),origin='https://store.example',password='synthetic initial password only',nextPassword='synthetic changed password only';
async function setup(){
 const db=new PGlite();await db.exec(await readFile(new URL('../server/members-schema.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../server/recovery-schema.sql',import.meta.url),'utf8'));
 let now=1700000000000,last=Promise.resolve();const query=(sql,args)=>db.query(sql,args);
 const pool=applicationPool({query,async connect(){let release;const turn=new Promise(resolve=>release=resolve),previous=last;last=turn;await previous;return {query,release};},end:()=>db.close()});
 const members=createPostgresMemberStore(pool,()=>now),store=createRecoveryStore(pool,{secret,environment:'sandbox',clock:()=>now});
 const user=await members.signup('synthetic_recovery',password);
 const mail=async kind=>(await db.query('SELECT * FROM ktts_account_mail ORDER BY created_at,id')).rows.filter(row=>row.encrypted_payload&&openAccountMail(row.encrypted_payload,secret,'sandbox').kind===kind).at(-1);
 const token=async kind=>openAccountMail((await mail(kind)).encrypted_payload,secret,'sandbox').token;
 return {db,pool,members,store,user,mail,token,advance:ms=>now+=ms,close:()=>db.close()};
}
test('recovery mail encrypts tokens at rest, authenticates environment and escapes account text',()=>{
 assert.equal(recoveryEmail(' Reader@Example.COM '),'reader@example.com');assert.throws(()=>recoveryEmail('reader@example.com\r\nBcc:x@y.com'));
 const token='1'.repeat(64),payload={kind:'RESET',token,username:'<script>synthetic</script>'},sealed=sealAccountMail(payload,secret,'sandbox');
 assert.ok(!sealed.includes(token));assert.deepEqual(openAccountMail(sealed,secret,'sandbox'),payload);assert.throws(()=>openAccountMail(sealed,secret,'live'));assert.throws(()=>openAccountMail(sealed,'b'.repeat(64),'sandbox'));assert.throws(()=>openAccountMail((sealed[0]==='a'?'b':'a')+sealed.slice(1),secret,'sandbox'));
 const message=renderAccountMail({id:'synthetic',recipient:'test@example.invalid',environment:'sandbox',encrypted_payload:sealed},{origin,secret});assert.match(message.subject,/^\[Sandbox test\]/);assert.ok(message.html.includes('&lt;script&gt;'));assert.ok(!message.html.includes('<script>'));assert.ok(message.text.includes('/account.html#reset='+token));assert.equal(message.to.address,'test@example.invalid');assert.throws(()=>renderAccountMail({environment:'sandbox',encrypted_payload:sealed},{origin:'https://evil.example/path',secret}));
});
test('only email confirmation binds an address; links are single-use and cannot reset a password',async()=>{
 const t=await setup();try{
  await t.store.requestVerification(t.user,'reader@example.invalid');assert.deepEqual(await t.store.status(t.user.id),{email:null,verified:false});
  const token=await t.token('VERIFY');assert.ok(!JSON.stringify((await t.db.query('SELECT * FROM ktts_account_challenges')).rows).includes(token));
  await assert.rejects(t.store.reset(token,nextPassword),/expired|already used/);await t.store.verify(token);
  assert.deepEqual(await t.store.status(t.user.id),{email:'reader@example.invalid',verified:true});await assert.rejects(t.store.verify(token),/expired|already used/);
  assert.equal((await t.members.login(t.user.username,password)).member_until,0);
 }finally{await t.close();}
});
test('password reset is atomic, preserves membership and revokes sessions plus stale login work',async()=>{
 const t=await setup();try{
  await t.db.query('UPDATE ktts_users SET paid_member_until=$1,member_until=$2 WHERE id=$3',[1800000000000,1750000000000,t.user.id]);
  await t.store.requestVerification(t.user,'reader@example.invalid');await t.store.verify(await t.token('VERIFY'));
  const session=await t.members.session(t.user);await t.store.requestReset('reader@example.invalid');const token=await t.token('RESET');
  await assert.rejects(t.store.verify(token),/expired|already used/);
  const alternative='another sufficiently long test password',results=await Promise.allSettled([t.store.reset(token,nextPassword),t.store.reset(token,alternative)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(await t.members.login(t.user.username,results[0].status==='fulfilled'?nextPassword:alternative));
  assert.equal(await t.members.current(session),null);await assert.rejects(t.members.login(t.user.username,password),/does not match/);await assert.rejects(t.members.session(t.user),/password changed/);
  const user=(await t.db.query('SELECT * FROM ktts_users WHERE id=$1',[t.user.id])).rows[0];assert.equal(Number(user.member_until),1750000000000);assert.equal(Number(user.paid_member_until),1800000000000);
  const changed=(await t.db.query("SELECT * FROM ktts_account_mail WHERE challenge_hash IS NULL")).rows;assert.equal(changed.length,1);assert.equal(openAccountMail(changed[0].encrypted_payload,secret,'sandbox').kind,'PASSWORD_CHANGED');
 }finally{await t.close();}
});
test('expired and superseded links do not send; unverified and unknown emails cannot recover accounts',async()=>{
 const t=await setup();try{
  await t.store.requestReset('missing@example.invalid');assert.equal((await t.db.query('SELECT * FROM ktts_account_mail')).rows.length,0);
  await t.store.requestVerification(t.user,'reader@example.invalid');await t.store.requestReset('reader@example.invalid');assert.equal((await t.db.query("SELECT * FROM ktts_account_challenges WHERE purpose='RESET'")).rows.length,0);
  const old=await t.token('VERIFY');t.advance(1);await t.store.requestVerification(t.user,'new@example.invalid');const latest=await t.token('VERIFY');await assert.rejects(t.store.verify(old),/expired/);
  const messages=[];const result=await dispatchAccountMail({store:t.store,mailer:{send:async value=>messages.push(value)},origin,secret});assert.equal(result.sent,1);assert.equal(messages[0].to.address,'new@example.invalid');assert.equal((await t.db.query("SELECT * FROM ktts_account_mail WHERE state='EXPIRED'")).rows.length,1);
  t.advance(31*60000);await assert.rejects(t.store.verify(latest),/expired/);
 }finally{await t.close();}
});
test('verified email uniqueness, per-account limits, mail retry leases and redaction hold',async()=>{
 const t=await setup();try{
  await t.store.requestVerification(t.user,'reader@example.invalid');await t.store.verify(await t.token('VERIFY'));
  const other=await t.members.signup('synthetic_other',password);await t.store.requestVerification(other,'reader@example.invalid');assert.equal((await t.db.query('SELECT * FROM ktts_account_challenges WHERE user_id=$1',[other.id])).rows.length,0);
  await t.store.requestReset('reader@example.invalid');const reset=await t.token('RESET');
  const claims=await Promise.all([t.store.claimMail(),t.store.claimMail()]);assert.equal(claims.filter(Boolean).length,1);const job=claims.find(Boolean);await t.store.retryMail(job.id,job.lease_token,job.attempts);
  let calls=0;assert.equal((await dispatchAccountMail({store:t.store,mailer:{send:async()=>calls++},origin,secret})).sent,0);t.advance(120001);
  assert.equal((await dispatchAccountMail({store:t.store,mailer:{send:async()=>{throw Error('PRIVATE AUTHENTICATION MUST NOT LEAK');}},origin,secret})).failed,1);
  assert.ok(!JSON.stringify((await t.db.query('SELECT * FROM ktts_account_mail')).rows).includes('PRIVATE AUTHENTICATION'));t.advance(300001);
  assert.equal((await dispatchAccountMail({store:t.store,mailer:{send:async()=>calls++},origin,secret})).sent,1);assert.equal(calls,1);
  await t.store.requestReset('reader@example.invalid');await t.store.requestReset('reader@example.invalid');await t.store.requestReset('reader@example.invalid');assert.equal((await t.db.query("SELECT attempts FROM ktts_auth_attempts WHERE attempts=4")).rows.length,1);await assert.rejects(t.store.reset(reset,nextPassword),/expired/);
 }finally{await t.close();}
});
test('account endpoints stay closed, reject cross-origin/body abuse, require password recheck and return neutral reset responses',async()=>{
 let opened=0;const closed=createRecoveryApi({getStore:async()=>{opened++;}});assert.equal((await closed(new Request(origin),'config')).status,200);assert.equal((await closed(new Request(origin),'status')).status,503);assert.equal(opened,0);
 const calls=[],store={consumeAttempt:async()=>true,requestReset:async email=>calls.push(email),requestVerification:async()=>{throw Error('must not open');}};
 const api=createRecoveryApi({enabled:true,origin,authenticate:async()=>({id:1,username:'synthetic'}),reauthenticate:async()=>{throw Object.assign(Error('The username or password does not match.'),{expose:true});},getStore:async()=>store});
 const post=(action,data,headers={})=>api(new Request(origin,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(data)}),action);
 assert.equal((await post('request-reset',{email:'a@example.invalid'},{Origin:'https://evil.example'})).status,403);assert.equal(calls.length,0);
 assert.equal((await post('request-reset',{email:'a@example.invalid',extra:'a'.repeat(5000)})).status,400);
 assert.equal((await post('request-verification',{email:'a@example.invalid',password:'wrong password'})).status,400);
 const one=await post('request-reset',{email:'a@example.invalid'}),two=await post('request-reset',{email:'b@example.invalid'});assert.deepEqual(await one.json(),await two.json());
 const app=createVercelApp({env:{KTTS_ORIGIN:origin,KTTS_ACCOUNT_RECOVERY:'1'},connect:async()=>{opened++;throw Error('not expected');}});assert.equal((await (await app(new Request(origin+'/api/index?kind=account&action=config'))).json()).enabled,false);assert.equal(opened,0);
});
test('Vercel account verification and reset preserve request bodies, verify the store password and expire the signed-in session',async()=>{
 const t=await setup();try{
  const session=await t.members.session(t.user),cookie='ktts_member='+session;
  const env={KTTS_ORIGIN:origin,VERCEL_ENV:'preview',DATABASE_URL:'synthetic-only',KTTS_ACCOUNT_RECOVERY:'1',KTTS_STORE_EMAIL:'1',KTTS_SMTP_USERNAME:'keianna@saiyancorp.io',KTTS_SMTP_PASSWORD:'synthetic app password only',KTTS_RECEIPT_SECRET:secret};
  const app=createVercelApp({env,connect:async()=>t.members,connectRecovery:async()=>t.store});
  const call=(action,data,auth=cookie)=>app(new Request(origin+'/api/index?kind=account&action='+action,{headers:{Origin:origin,Cookie:auth,'Content-Type':'application/json'},...(data?{method:'POST',body:JSON.stringify(data)}:{})}));
  assert.equal((await (await call('config')).json()).enabled,true);
  assert.equal((await call('request-verification',{email:'reader@example.invalid',password:'wrong password only'})).status,400);
  assert.equal((await call('request-verification',{email:'reader@example.invalid',password})).status,200);
  const token=await t.token('VERIFY');assert.equal((await call('verify',{token},'')).status,200);assert.equal((await (await call('status')).json()).verified,true);
  assert.equal((await call('request-reset',{email:'reader@example.invalid'},'')).status,200);
  const reset=await t.token('RESET');assert.equal((await call('reset',{token:reset,password:nextPassword,confirmPassword:'mismatched password only'},'')).status,400);
  const done=await call('reset',{token:reset,password:nextPassword,confirmPassword:nextPassword},'');assert.equal(done.status,200);assert.equal(done.headers.get('set-cookie'),null);assert.equal((await call('status')).status,401);assert.ok(await t.members.login(t.user.username,nextPassword));
 }finally{await t.close();}
});
test('live paid enrollment requires verified recovery before a PayPal agreement can be created',async()=>{
 let payments=0;const api=createSubscriptionsApi({origin,mode:'live',enabled:true,authenticate:async()=>({id:1,username:'synthetic'}),getStore:async()=>({}),getGateway:async()=>{payments++;throw Error('must not initiate');}});
 const response=await api(new Request(origin,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),'join');assert.equal(response.status,409);assert.match((await response.json()).error,/recovery email/);assert.equal(payments,0);
});
