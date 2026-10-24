import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {applicationPool} from '../server/postgres-schema.mjs';
import {issueReceiptToken,verifyReceiptToken} from '../server/receipt-token.mjs';
import {renderStoreMail,createWorkspaceMailer,storeMailConfig} from '../server/store-mail.mjs';
import {createMailOutbox,dispatchStoreMail} from '../server/mail-outbox.mjs';
import {createCheckoutApi} from '../server/checkout-api.mjs';
import {createStoreMaintenance} from '../server/store-maintenance.mjs';
import {pennsylvaniaCandleTax} from '../server/candle-tax.mjs';
const secret='a'.repeat(64),id=randomUUID(),origin='https://store.example';
test('private receipt links are read-only, scoped to the environment, expire and resist tampering',async()=>{
 const now=1700000000000,token=issueReceiptToken(id,'sandbox',secret,now);assert.equal(verifyReceiptToken(token,'sandbox',secret,now),id);assert.equal(verifyReceiptToken(token,'live',secret,now),null);assert.equal(verifyReceiptToken(token,'sandbox','b'.repeat(64),now),null);assert.equal(verifyReceiptToken(token+'x','sandbox',secret,now),null);assert.equal(verifyReceiptToken(token,'sandbox',secret,now+31*86400000),null);
 let opened=0;const api=createCheckoutApi({origin,mode:'sandbox',enabled:false,receiptSecret:secret,clock:()=>now,getStore:async()=>{opened++;return {ownerOrder:async()=>({id,capture_id:'TESTCAPTURE111',status:'PAID',quote_json:{},customer_json:{name:'Synthetic receipt'}})};}});
 const call=token=>api(new Request(origin+'/api/checkout/receipt?token='+encodeURIComponent(token)),'receipt');assert.equal((await call('bad')).status,404);assert.equal(opened,0);assert.equal((await call(token)).status,200);assert.equal((await api(new Request(origin+'/api/checkout/pay',{method:'POST'}),'pay')).status,503);
});
test('Workspace delivery uses TLS, verified aliases, safe HTML and one recipient; defaults send nothing',async()=>{
 const job={environment:'sandbox',event_key:'test-receipt',message_type:'PAID',recipient:'qa@example.invalid',payload_json:{id,status:'PAID',paymentStatus:'COMPLETED',quote:{lines:[{name:'<script>bad</script>',quantity:1,size:'Mini',weight:'4 oz',unitCents:1200}],subtotalCents:1200,shippingCents:895,taxCents:126,totalCents:2221,processingTime:'SYNTHETIC TEST ONLY'}}};
 const message=renderStoreMail(job,{origin,secret});assert.ok(message.html.includes('&lt;script&gt;'));assert.ok(!message.html.includes('<script>'));assert.equal(message.to.address,job.recipient);assert.equal(message.from.address,'support@keytothesoul.com');assert.equal(renderStoreMail(job,{origin,secret}).messageId,message.messageId);
 assert.match(message.subject,/^\[Sandbox test\]/);assert.match(message.text,/SANDBOX TEST/);assert.match(message.html,/SANDBOX TEST/);const live=renderStoreMail({...job,environment:'live'},{origin,secret});assert.ok(!live.subject.includes('Sandbox test'));assert.ok(!live.text.includes('SANDBOX TEST'));assert.ok(!live.html.includes('SANDBOX TEST'));
 assert.equal(storeMailConfig({}).enabled,false);let settings,sent;
 const mailer=await createWorkspaceMailer({KTTS_STORE_EMAIL:'1',KTTS_SMTP_USERNAME:'keianna@saiyancorp.io',KTTS_SMTP_PASSWORD:'synthetic app password only',KTTS_RECEIPT_SECRET:secret},{transportFactory:options=>{settings=options;return {sendMail:async value=>{sent=value;return {accepted:['qa@example.invalid'],rejected:[]};},close:()=>{},verify:async()=>true};}});
 await mailer.send(message);assert.equal(settings.host,'smtp.gmail.com');assert.equal(settings.port,465);assert.equal(settings.secure,true);assert.equal(settings.disableFileAccess,true);assert.equal(settings.disableUrlAccess,true);assert.equal(sent.messageId,message.messageId);
});
test('email outbox leases prevent concurrent sends and failed delivery remains retryable without credential leakage',async()=>{
 const db=new PGlite();await db.exec(await readFile(new URL('../server/orders-schema.sql',import.meta.url),'utf8'));let now=1700000000000;
 const pool=applicationPool({query:(sql,args)=>db.query(sql,args)}),outbox=createMailOutbox(pool,{environment:'sandbox',clock:()=>now});
 const payload={id,status:'PAID',quote:{lines:[],subtotalCents:1200,shippingCents:895,taxCents:0,totalCents:2095,processingTime:'TEST ONLY'}};
 try{
  await db.query("INSERT INTO ktts_mail_outbox(environment,event_key,message_type,recipient,payload_json,created_at,next_attempt_at) VALUES('sandbox','test-receipt','PAID','qa@example.invalid',$1,0,0)",[JSON.stringify(payload)]);
  const claims=await Promise.all([outbox.claim(),outbox.claim()]);assert.equal(claims.filter(Boolean).length,1);await outbox.retry(claims.find(Boolean).id,claims.find(Boolean).lease_token,1);now+=120001;
  let calls=0;const result=await dispatchStoreMail({outbox,mailer:{send:async()=>{calls++;throw Error('PRIVATE SMTP CREDENTIAL MUST NOT BE STORED');}},origin,secret});assert.equal(result.failed,1);assert.equal(calls,1);
  const row=(await db.query('SELECT last_error,sent_at FROM ktts_mail_outbox')).rows[0];assert.ok(!row.last_error.includes('CREDENTIAL'));assert.equal(row.sent_at,null);now+=600001;
  const done=await dispatchStoreMail({outbox,mailer:{send:async()=>{}},origin,secret});assert.equal(done.sent,1);assert.equal((await outbox.status()).pending,0);
 }finally{await db.close();}
});
test('maintenance requires the private bearer before storage or payment access',async()=>{
 let opened=0;const app=createStoreMaintenance({secret,getSubscriptions:async()=>{opened++;throw Error('not expected');},getMail:async()=>{opened++;throw Error('not expected');}});
 assert.equal((await app(new Request(origin+'/api/store-maintenance'))).status,401);assert.equal(opened,0);assert.equal((await app(new Request(origin+'/api/store-maintenance',{headers:{Authorization:'Bearer '+secret}}))).status,200);assert.equal(opened,0);
});
test('PA candle tax includes shipping and applies the declared destination county rate',()=>{
 const input={cart:{subtotalCents:1200},shippingCents:895,customer:{address:{county:'OTHER_PENNSYLVANIA'}}};assert.equal(pennsylvaniaCandleTax(input).taxCents,126);assert.equal(pennsylvaniaCandleTax({...input,customer:{address:{county:'ALLEGHENY'}}}).taxCents,147);assert.equal(pennsylvaniaCandleTax({...input,customer:{address:{county:'PHILADELPHIA'}}}).taxCents,168);assert.throws(()=>pennsylvaniaCandleTax({...input,customer:{address:{}}}),/county/);
});
