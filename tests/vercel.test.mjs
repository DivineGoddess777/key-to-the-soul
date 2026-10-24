import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createMemberStore} from '../membership.js';
import {createVercelApp,modelDestination,deploymentOrigin} from '../server/vercel-app.mjs';
import {publicFiles,buildVercel} from '../scripts/build-vercel.mjs';
const origin='https://store.example';
test('subscription endpoints stay closed without explicit environment-specific billing configuration',async()=>{
 let opened=0;const app=createVercelApp({env:{KTTS_ORIGIN:origin,VERCEL_ENV:'production'},connectSubscriptions:async()=>{opened++;throw Error('Must stay closed');}});
 const config=await app(new Request(origin+'/api/index?kind=subscriptions&action=config'));assert.equal(config.status,200);assert.equal((await config.json()).enabled,false);
 assert.equal((await app(new Request(origin+'/api/index?kind=subscriptions&action=join',{method:'POST'}))).status,503);assert.equal(opened,0);
 assert.equal((await app(new Request(origin+'/api/index?kind=maintenance'))).status,401);
});
test('changing previews trust only Vercel deployment metadata and production requires an explicit origin',()=>{
 const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:'key-to-the-soul-example-saiyan-corp.vercel.app'};
 assert.equal(deploymentOrigin(env),'https://'+env.VERCEL_URL);
 assert.equal(deploymentOrigin({...env,KTTS_ORIGIN:origin}),origin);
 for(const value of ['evil.example','a.vercel.app.evil.example','user@a.vercel.app','a.vercel.app/path','https://a.vercel.app'])assert.throws(()=>deploymentOrigin({...env,VERCEL_URL:value}));
 assert.throws(()=>deploymentOrigin({...env,VERCEL:'0'}));
 assert.throws(()=>deploymentOrigin({...env,VERCEL_ENV:'production'}));
});
const call=(app,query,{method='GET',body,cookie,from=origin}={})=>app(new Request(origin+'/api/index?'+query,{method,headers:{Origin:from,'Content-Type':'application/json','x-forwarded-for':'192.0.2.1',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
test('Vercel rejects unconfigured membership and keeps checkout closed',async()=>{
 const app=createVercelApp({env:{}});
 assert.equal((await call(app,'kind=member&action=me')).status,503);
 assert.equal((await call(app,'kind=asset&file=tarot-deck.js')).status,503);
 assert.equal((await call(app,'kind=paypal',{method:'POST',body:{}})).status,503);
 assert.equal((await call(app,'kind=member&action=grant')).status,404);
});
test('production never enables sandbox checkout even if preview credentials are present',async()=>{
 let databaseCalls=0,paymentCalls=0;
 const app=createVercelApp({env:{VERCEL_ENV:'production',KTTS_ORIGIN:origin,DATABASE_URL:'test-only',KTTS_PAYPAL_SANDBOX:'1',PAYPAL_SANDBOX_CLIENT_ID:'test-client',PAYPAL_SANDBOX_CLIENT_SECRET:'test-secret'},connect:async()=>{databaseCalls++;throw Error('Not expected');},paypalRequest:async()=>{paymentCalls++;throw Error('Not expected');}});
 const config=await call(app,'kind=paypal&action=config');
 assert.equal(config.status,200);assert.equal((await config.json()).enabled,false);
 assert.equal((await call(app,'kind=paypal&action=orders',{method:'POST',body:{}})).status,503);
 assert.equal(databaseCalls,0);assert.equal(paymentCalls,0);
});
test('new customer checkout and webhook routes remain closed without complete launch configuration',async()=>{
 let opened=0;
 const app=createVercelApp({env:{KTTS_ORIGIN:origin,VERCEL_ENV:'production',KTTS_PRODUCTION:'1',PAYPAL_SANDBOX_CLIENT_ID:'test',PAYPAL_SANDBOX_CLIENT_SECRET:'test',KTTS_COMMERCE_SANDBOX:'1'},connectCommerce:async()=>{opened++;throw Error('Unexpected');}});
 const response=await call(app,'kind=checkout&action=config');assert.equal(response.status,200);assert.equal((await response.json()).enabled,false);
 assert.equal((await call(app,'kind=checkout&action=reserve',{method:'POST',body:{}})).status,503);
 assert.equal((await call(app,'kind=webhook',{method:'POST',body:{}})).status,503);assert.equal(opened,0);
});
test('personal-reading route stays closed before launch and preserves the signed-in POST body',async()=>{
 const local=createMemberStore(':memory:');let storageOpened=0;
 const closed=createVercelApp({env:{KTTS_ORIGIN:origin},connectReadings:async()=>{storageOpened++;throw Error('Not expected');}});
 assert.equal((await (await call(closed,'kind=personal&action=config')).json()).enabled,false);
 assert.equal((await call(closed,'kind=personal&action=me')).status,503);assert.equal(storageOpened,0);
 const app=createVercelApp({env:{KTTS_ORIGIN:origin,DATABASE_URL:'test-only',KTTS_PERSONAL_READINGS_READY:'1'},connect:async()=>local,connectReadings:async()=>({request:async(userId,data)=>{assert.ok(userId);assert.equal(data.question,'SYNTHETIC REQUEST');return {id:'test-request',user_id:userId,nonce:data.nonce,status:'REQUESTED'};}})});
 try{
  assert.equal((await call(app,'kind=personal&action=me')).status,401);
  const signed=await call(app,'kind=member&action=signup',{method:'POST',body:{username:'personal_route_test',password:'synthetic route password only'}});const cookie=signed.headers.get('set-cookie').split(';')[0];
  const response=await call(app,'kind=personal&action=request',{method:'POST',cookie,body:{nonce:'synthetic',email:'qa@example.invalid',question:'SYNTHETIC REQUEST'}});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.request.user_id,undefined);assert.equal(result.request.nonce,undefined);
 }finally{local.close();}
});
test('configured serverless callback verifies PayPal before reconciling, without requiring a browser member cookie',async()=>{
 const event={id:'WH-TEST-1017',event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'CAPTURETEST123',supplementary_data:{related_ids:{order_id:'PAYPALORDER123'}}}};
 let verified=false,reconciled=0,finished=0;
 const env={KTTS_ORIGIN:origin,VERCEL_ENV:'preview',DATABASE_URL:'test',PAYPAL_SANDBOX_CLIENT_ID:'test',PAYPAL_SANDBOX_CLIENT_SECRET:'test',PAYPAL_SANDBOX_WEBHOOK_ID:'WH123'};
 const app=createVercelApp({env,connect:async()=>{throw Error('Membership must not be used');},connectCommerce:async()=>({findByPayment:async()=>({id:'test-order'}),capture:async()=>{assert.equal(verified,true);reconciled++;}}),connectEvents:async()=>({claim:async()=>{assert.equal(verified,true);return 'claimed';},finish:async()=>{finished++;return true;},release:async()=>{}}),paypalRequest:async(url)=>{
  if(url.endsWith('/token'))return Response.json({access_token:'test',expires_in:300});
  if(url.endsWith('/verify-webhook-signature')){verified=true;return Response.json({verification_status:'SUCCESS'});}
  assert.equal(url,'https://api-m.sandbox.paypal.com/v2/checkout/orders/PAYPALORDER123');return Response.json({id:'PAYPALORDER123',purchase_units:[{payments:{captures:[{id:'CAPTURETEST123'}]}}]});
 }});
 const response=await app(new Request(origin+'/api/index?kind=webhook',{method:'POST',headers:{'Content-Type':'application/json','paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.paypal.com/v1/notifications/certs/TEST','paypal-transmission-id':'test-transmission','paypal-transmission-sig':'test-signature-long','paypal-transmission-time':new Date().toISOString()},body:JSON.stringify(event)}));
 assert.equal(response.status,200);assert.equal(reconciled,1);assert.equal(finished,1);
});
test('Vercel awaits asynchronous accounts and protects readings and model delivery',async()=>{
 const local=createMemberStore(':memory:');
 const store=Object.fromEntries(Object.entries(local).map(([key,value])=>[key,key==='publicUser'?value:async(...args)=>value(...args)]));
 const env={KTTS_ORIGIN:origin,DATABASE_URL:'test-only',KTTS_MODEL_BASE_URL:'https://assets.example/models/'};
 const manifest={files:[{path:'models/reading-qwen3/config.json'}]};
 const app=createVercelApp({env,connect:async()=>store,loadAsset:async()=>Buffer.from('export const sample=1;'),loadManifest:async()=>manifest});
 try{
  assert.equal((await call(app,'kind=asset&file=tarot-deck.js')).status,403);
  assert.equal((await call(app,'kind=member&action=signup',{method:'POST',from:'https://elsewhere.example',body:{username:'test',password:'long test only password'}})).status,403);
  const signed=await call(app,'kind=member&action=signup',{method:'POST',body:{username:'test',password:'long test only password'}});
  assert.equal(signed.status,200);
  const cookie=signed.headers.get('set-cookie').split(';')[0];assert.match(signed.headers.get('set-cookie'),/Secure/);
  assert.equal((await call(app,'kind=asset&file=tarot-deck.js',{cookie})).status,403);
  local.grant('test',1);
  assert.equal((await call(app,'kind=member&action=me',{cookie})).status,200);
  const asset=await call(app,'kind=asset&file=tarot-deck.js',{cookie});assert.equal(asset.status,200);assert.match(asset.headers.get('cache-control'),/no-store/);
  const model=await call(app,'kind=model&file=reading-qwen3/config.json',{cookie});
  assert.equal(model.status,307);assert.equal(model.headers.get('location'),'https://assets.example/models/reading-qwen3/config.json');assert.equal(await model.text(),'');
  assert.equal((await call(app,'kind=model&file=../private',{cookie})).status,404);
  const code=local.invite({days:1});const redeemed=await call(app,'kind=member&action=redeem',{method:'POST',cookie,body:{code}});
  assert.equal(redeemed.status,200);assert.equal((await redeemed.json()).user.active,true);
  await call(app,'kind=member&action=logout',{method:'POST',cookie,body:{}});
  assert.equal((await call(app,'kind=asset&file=tarot-deck.js',{cookie})).status,403);
 }finally{local.close();}
});
test('model destinations allow only pinned files and a configured HTTPS asset origin',()=>{
 const manifest={files:[{path:'models/voice/onnx/model_q8.onnx'}]};
 assert.equal(modelDestination('voice/onnx/model_q8.onnx','https://cdn.example/models',manifest),'https://cdn.example/models/voice/onnx/model_q8.onnx');
 assert.equal(modelDestination('../.env','https://cdn.example/',manifest),null);
 assert.throws(()=>modelDestination('voice/onnx/model_q8.onnx','http://cdn.example/',manifest));
 assert.throws(()=>modelDestination('voice/onnx/model_q8.onnx','https://secret:secret@cdn.example/',manifest));
});
test('Vercel static output excludes credentials, databases, model weights and protected source',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ktts-build-'));
 try{
  for(const name of publicFiles)await fs.writeFile(path.join(root,name),'public fixture');
  for(const dir of ['images','logos','vendor'])await fs.mkdir(path.join(root,dir));
  for(const name of ['.env.local','membership.js','tarot-deck.js','tarot-state.js','paypal-sandbox.mjs'])await fs.writeFile(path.join(root,name),'private fixture');
  await fs.mkdir(path.join(root,'.data'));await fs.writeFile(path.join(root,'.data','members.sqlite'),'private database');
  const out=await buildVercel(root),names=await fs.readdir(out);
  for(const file of ['.env.local','.data','membership.js','tarot-deck.js','tarot-state.js','models','paypal-sandbox.mjs'])assert.equal(names.includes(file),false);
  assert.ok(names.includes('tarot.html'));assert.ok(names.includes('index.html'));
 }finally{
  const target=path.resolve(root);
  if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('ktts-build-'))throw Error('Invalid test cleanup target');
  await fs.rm(target,{recursive:true,force:true});
 }
});

test('streamed member requests preserve Unicode passwords across byte boundaries',async()=>{
 const store=createMemberStore(':memory:');
 const app=createVercelApp({env:{KTTS_ORIGIN:origin,DATABASE_URL:'test-only'},connect:async()=>store});
 const password='a moonlit 🌙 password with length',payload=Buffer.from(JSON.stringify({username:'unicode_test',password}));
 const split=payload.indexOf(Buffer.from('🌙'))+2;
 const body=new ReadableStream({start(controller){controller.enqueue(payload.subarray(0,split));controller.enqueue(payload.subarray(split));controller.close();}});
 try{
  const response=await app(new Request(origin+'/api/index?kind=member&action=signup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body,duplex:'half'}));
  assert.equal(response.status,200);
  assert.equal((await store.login('unicode_test',password)).username,'unicode_test');
 }finally{store.close();}
});

// Vercel's published schema currently mixes a draft-04 label with newer
// numeric exclusiveMinimum keywords. Validate its constraints with modern Ajv.
test('deployment configuration satisfies the published Vercel schema', async()=>{
 const {default:Ajv}=await import('ajv');
 const schema=JSON.parse(await fs.readFile(new URL('./fixtures/vercel-schema.json',import.meta.url),'utf8'));
 delete schema.$schema;
 const validate=new Ajv({strict:false,validateSchema:false,allErrors:true}).compile(schema);
 const config=JSON.parse(await fs.readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(validate(config),true,JSON.stringify(validate.errors));
 const invalid=structuredClone(config);invalid.functions['api/index.mjs'].includeFiles=['tarot-deck.js'];
 assert.equal(validate(invalid),false,'the array format rejected by Vercel must stay invalid');
});
