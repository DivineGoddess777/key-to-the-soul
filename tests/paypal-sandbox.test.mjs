import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {quoteSandboxCart,validateSandboxCapture,createPaypalSandbox,sandboxApprovalUrl} from '../paypal-sandbox.mjs';import {products} from '../storefront-state.js';
const id=products[0].id,items={[id+'::mini']:2,[id+'::signature']:1};
test('redirect checkout accepts only the exact HTTPS sandbox approval destination',()=>{
 const order=href=>({links:[{rel:'payer-action',href}]});
 assert.equal(sandboxApprovalUrl(order('https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER123456789')),'https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER123456789');
 for(const href of ['https://www.sandbox.paypal.com:8443/checkoutnow','https://www.paypal.com/checkoutnow','http://www.sandbox.paypal.com/checkoutnow','https://www.sandbox.paypal.com.evil.test/checkoutnow','https://evil.test/checkoutnow','https://user:pass@www.sandbox.paypal.com/checkoutnow','https://www.sandbox.paypal.com/signin'])assert.throws(()=>sandboxApprovalUrl(order(href)));
 assert.throws(()=>sandboxApprovalUrl({}));
});
test('PayPal test quotes use server prices and reject missing sizes or invalid quantities',()=>{
 const quote=quoteSandboxCart(items);assert.equal(quote.totalCents,5000);assert.equal(quote.value,'50.00');assert.equal(quote.quantity,3);
 assert.throws(()=>quoteSandboxCart({[id+'::unselected']:1}));assert.throws(()=>quoteSandboxCart({[id+'::mini']:-1}));assert.throws(()=>quoteSandboxCart({'invented::mini':1}));
 assert.equal(quote.lines[0].unit_amount.value,'12.00');
});
test('completed capture must match the expected amount and currency',()=>{
 const capture={status:'COMPLETED',purchase_units:[{payments:{captures:[{id:'CAPTURE',status:'COMPLETED',amount:{currency_code:'USD',value:'50.00'}}]}}]};
 assert.equal(validateSandboxCapture(capture,{total_cents:5000}),'CAPTURE');
 assert.throws(()=>validateSandboxCapture(capture,{total_cents:1}));capture.purchase_units[0].payments.captures[0].status='PENDING';assert.throws(()=>validateSandboxCapture(capture,{total_cents:5000}));
});
test('sandbox order creation is idempotent, bound to its session, and never calls the live API',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ktts-paypal-test-'));let captures=0,creates=0;
 const request=async(url,options)=>{
  assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));
  if(url.endsWith('/oauth2/token'))return {ok:true,json:async()=>({access_token:'test-access-token',expires_in:3600})};
  if(options.method==='GET')return {ok:true,json:async()=>({status:'APPROVED',links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER123456789'}]})};
  if(url.endsWith('/capture')){captures++;return {ok:true,json:async()=>({status:'COMPLETED',purchase_units:[{payments:{captures:[{id:'TESTCAPTURE',status:'COMPLETED',amount:{currency_code:'USD',value:'50.00'}}]}}]})};}
  creates++;const body=JSON.parse(options.body);assert.equal(body.purchase_units[0].amount.value,'50.00');assert.equal(body.payment_source.paypal.experience_context.shipping_preference,'NO_SHIPPING');
  assert.equal(body.payment_source.paypal.experience_context.return_url,'http://127.0.0.1:5191/paypal-sandbox.html?paypal=approved');
  assert.equal(body.payment_source.paypal.experience_context.cancel_url,'http://127.0.0.1:5191/paypal-sandbox.html?paypal=canceled');
  return {ok:true,json:async()=>({id:'TESTORDER123456789',links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER123456789'}]})};
 };
 const sandbox=createPaypalSandbox({root,origin:'http://127.0.0.1:5191',clientId:'test-client',secret:'test-secret',enabled:true,request});
 const server=http.createServer((req,res)=>sandbox.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const config=async()=>{const r=await fetch(base+'/api/paypal/config');return r.headers.get('set-cookie').split(';')[0];};
 const post=(route,body,cookie)=>fetch(base+route,{method:'POST',headers:{Origin:'http://127.0.0.1:5191','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 try{
  const cookie=await config(),nonce='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const first=await post('/api/paypal/orders',{items,nonce,totalCents:1,flow:'redirect',return_url:'https://evil.test'},cookie);assert.equal(first.status,200);
  assert.equal((await first.json()).approvalUrl,'https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER123456789');
  const repeated=await post('/api/paypal/orders',{items,nonce,flow:'redirect'},cookie);assert.equal((await repeated.json()).id,'TESTORDER123456789');assert.equal(creates,1);
  const changed=await post('/api/paypal/orders',{items:{[id+'::mini']:1},nonce},cookie);assert.equal(changed.status,409);
  const other=await config();const stolen=await post('/api/paypal/orders/TESTORDER123456789/capture',{},other);assert.equal(stolen.status,404);assert.equal(captures,0);
  const paid=await post('/api/paypal/orders/TESTORDER123456789/capture',{},cookie);const receipt=await paid.json();assert.equal(receipt.test,true);assert.equal(receipt.totalCents,5000);assert.equal(receipt.currency,'USD');assert.equal(receipt.captureId,'TESTCAPTURE');assert.equal(receipt.paypalId,'TESTORDER123456789');
  const repeatedCapture=await post('/api/paypal/orders/TESTORDER123456789/capture',{},cookie);assert.deepEqual(await repeatedCapture.json(),receipt);assert.equal(captures,1);
 }finally{
  await new Promise(resolve=>server.close(resolve));sandbox.close();
  for(const suffix of ['','-wal','-shm'])await fs.unlink(path.join(root,'.data','paypal-sandbox.sqlite'+suffix)).catch(error=>{if(error.code!=='ENOENT')throw error;});
  await fs.rmdir(path.join(root,'.data'));await fs.rmdir(root);
 }
});
