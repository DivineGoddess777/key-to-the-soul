import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {products} from '../storefront-state.js';
import {createPostgresOrders} from '../server/orders-postgres.mjs';
import {createCheckoutApi} from '../server/checkout-api.mjs';
import {createDeliveryQuoter,shippingCents,storeTerms} from '../server/store-policy.mjs';
import {createPaypalCommerce,paypalApproval} from '../server/paypal-commerce.mjs';
import {commerceConfig} from '../server/commerce-config.mjs';
const origin='https://store.example',sku=products[0].id+'::mini';
const customer={name:'Synthetic Checkout',email:'qa@example.invalid',address:{line1:'TEST ONLY DO NOT SHIP',city:'Test',region:'NY',postalCode:'10001',country:'US'}};
test('confirmed contiguous-US shipping is free at $60 and up; unconfigured calculated rates and tax fail closed',async()=>{
 assert.equal(shippingCents(1200),895);assert.equal(shippingCents(5999),895);assert.equal(shippingCents(6000),0);assert.equal(shippingCents(6001),0);
 await assert.rejects(createDeliveryQuoter()({[sku]:1},customer),/Delivery/);
 await assert.rejects(createDeliveryQuoter({countries:['US']})({[sku]:1},customer),/Tax setup/);
 await assert.rejects(createDeliveryQuoter({countries:['US']})({[sku]:1},{...customer,address:{...customer.address,region:'AK'}}),/calculated shipping/);
 const quote=await createDeliveryQuoter({countries:['US'],taxQuote:async()=>({reviewed:true,taxCents:123,reference:'TEST ONLY'})})({[sku]:1},customer);
 assert.equal(quote.shippingCents,895);assert.equal(quote.taxCents,123);
});
test('commerce stays closed without reviewed fulfillment and explicit environment-specific launch flags',()=>{
 const env={VERCEL_ENV:'preview',DATABASE_URL:'test',PAYPAL_SANDBOX_CLIENT_ID:'test',PAYPAL_SANDBOX_CLIENT_SECRET:'test',KTTS_COMMERCE_SANDBOX:'1'};
 assert.equal(commerceConfig(env).enabled,false);
 const policy={reviewed:true,shippingRegions:['NY'],confirmedNoTaxRegions:['NY'],shipFromState:'NY',shipFromPostalCode:'10001',taxDecisionReference:'SYNTHETIC TEST ONLY'};
 assert.equal(commerceConfig({...env,KTTS_FULFILLMENT_JSON:JSON.stringify(policy)}).enabled,true);
 assert.equal(commerceConfig({...env,KTTS_FULFILLMENT_JSON:JSON.stringify({...policy,confirmedNoTaxRegions:[]})}).enabled,false);
 assert.equal(commerceConfig({...env,VERCEL_ENV:'production',KTTS_PRODUCTION:'1',KTTS_LIVE_CHECKOUT:'1',KTTS_FULFILLMENT_JSON:JSON.stringify(policy)}).enabled,false);
});
test('PayPal gateway fixes the delivery address, totals, return origin and request id; rejects other approval hosts',async()=>{
 const requests=[];const gateway=createPaypalCommerce({mode:'sandbox',clientId:'test',secret:'test',origin,request:async(url,options)=>{
  requests.push({url,options});return Response.json(url.endsWith('/token')?{access_token:'test',expires_in:300}:{id:'TESTPAYPALORDER1',links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=TESTPAYPALORDER1'}]});
 }});
 const id=randomUUID();await gateway.create({id,quote_json:{totalCents:2095,subtotalCents:1200,shippingCents:895,taxCents:0,lines:[{name:'Test candle',size:'Mini',weight:'4 oz',sku,quantity:1,unitCents:1200}]},customer_json:customer});
 const request=requests[1],body=JSON.parse(request.options.body),unit=body.purchase_units[0];
 assert.equal(unit.amount.value,'20.95');assert.equal(unit.shipping.address.postal_code,'10001');assert.equal(unit.custom_id,id);assert.equal(request.options.headers['PayPal-Request-Id'],'create-'+id);
 assert.equal(body.payment_source.paypal.experience_context.shipping_preference,'SET_PROVIDED_ADDRESS');assert.ok(body.payment_source.paypal.experience_context.return_url.startsWith(origin+'/checkout.html?order='));
 for(const href of ['https://www.paypal.com/checkout','https://evil.example/','https://www.sandbox.paypal.com.evil.example/'])assert.throws(()=>paypalApproval({links:[{rel:'approve',href}]},'sandbox'));
});
async function fixture(){
 const db=new PGlite();await db.exec(await readFile(new URL('../server/orders-schema.sql',import.meta.url),'utf8'));
 let queue=Promise.resolve();const pool={query:(sql,args)=>db.query(sql,args),connect:async()=>{const previous=queue;let release;queue=new Promise(r=>release=r);await previous;return {query:(sql,args)=>db.query(sql,args),release};}};
 const store=createPostgresOrders(pool,{environment:'sandbox'});await store.setStock(sku,{mode:'ready_stock',onHand:4});
 let created=0,captured=0,remote,timeout=false;
 const paid=order=>({id:order.paypal_id,status:'COMPLETED',purchase_units:[{custom_id:order.id,payments:{captures:[{id:'TESTCAPTURE123',status:'COMPLETED',amount:{currency_code:'USD',value:(order.total_cents/100).toFixed(2)}}]}}]});
 const gateway={create:async order=>{created++;remote={id:'TESTPAYPALORDER1',status:'CREATED',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=TESTPAYPALORDER1'}]};return remote;},read:async()=>remote,capture:async order=>{captured++;remote=paid(order);if(timeout)throw Error('network timeout after capture');return remote;}};
 const handler=createCheckoutApi({origin,mode:'sandbox',enabled:true,terms:storeTerms,countries:['US'],getStore:async()=>store,getGateway:async()=>gateway,quoteDelivery:createDeliveryQuoter({countries:['US'],taxQuote:async()=>({reviewed:true,taxCents:0,reference:'SYNTHETIC TEST ONLY'})})});
 const call=(action,data,cookie,from=origin)=>handler(new Request(origin+'/api/checkout/'+action,{method:data?'POST':'GET',headers:{Origin:from,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})}),action.split('?')[0]);
 const cookie=(await call('config')).headers.get('set-cookie').split(';')[0];
 const quote=await (await call('quote',{items:{[sku]:1},customer},cookie)).json();
 const input={items:{[sku]:1},customer,nonce:randomUUID(),quoteFingerprint:quote.fingerprint};
 return {db,store,call,cookie,input,counts:()=>({created,captured}),setTimeout:()=>timeout=true,approve:()=>{remote={...remote,status:'APPROVED',links:[]};}};
}
test('guest checkout reserves one snapshot, blocks cross-origin and cross-session access, and recovers a capture timeout',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('reserve',f.input,f.cookie,'https://elsewhere.example')).status,403);
  assert.equal((await f.call('reserve',{...f.input,quoteFingerprint:'tampered'},f.cookie)).status,409);
  const first=await (await f.call('reserve',f.input,f.cookie)).json();assert.equal(first.order.quote.totalCents,2095);
  const retry=await (await f.call('reserve',f.input,f.cookie)).json();assert.equal(retry.order.id,first.order.id);
  assert.equal((await f.call('order?id='+first.order.id)).status,401);
  const otherCookie=(await f.call('config')).headers.get('set-cookie').split(';')[0];assert.equal((await f.call('order?id='+first.order.id,undefined,otherCookie)).status,404);
  const pay=await (await f.call('pay',{id:first.order.id},f.cookie)).json();assert.match(pay.approvalUrl,/sandbox.paypal.com/);
  await f.call('pay',{id:first.order.id},f.cookie);assert.equal(f.counts().created,1);
  f.approve();assert.equal((await (await f.call('pay',{id:first.order.id},f.cookie)).json()).requiresCapture,true);
  assert.equal((await f.call('capture',{id:first.order.id,paypalId:'WRONG'},f.cookie)).status,409);
  f.setTimeout();const captured=await (await f.call('capture',{id:first.order.id,paypalId:pay.order.paypalId},f.cookie)).json();assert.equal(captured.order.status,'PAID');
  await f.call('capture',{id:first.order.id,paypalId:pay.order.paypalId},f.cookie);assert.equal(f.counts().captured,1);
  const stock=(await f.db.query('SELECT on_hand,reserved FROM ktts_stock')).rows[0];assert.equal(stock.on_hand,3);assert.equal(stock.reserved,0);
  assert.equal((await f.call('cancel',{id:first.order.id},f.cookie)).status,409);
 }finally{await f.db.close();}
});
test('durable payment lease prevents concurrent attempts, cancellation and expiry cleanup during capture',async()=>{
 const f=await fixture();try{
  const first=await (await f.call('reserve',f.input,f.cookie)).json();const hash=(await f.db.query('SELECT session_hash FROM ktts_orders')).rows[0].session_hash;
  await f.store.bindPayment(first.order.id,hash,'TESTPAYPALORDER1');
  const lease=await f.store.claimPayment(first.order.id,hash,'capture');
  await assert.rejects(f.store.claimPayment(first.order.id,hash,'capture'),/being checked/);await assert.rejects(f.store.cancel(first.order.id,hash),/being checked/);
  await f.db.query('UPDATE ktts_orders SET expires_at=$1',[Date.now()-1]);assert.equal(await f.store.expireReservations(),0);
  await f.store.releasePayment(first.order.id,lease.token);assert.equal(await f.store.expireReservations(),1);
 }finally{await f.db.close();}
});
