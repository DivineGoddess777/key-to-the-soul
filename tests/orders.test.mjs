import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {products} from '../storefront-state.js';
import {orderItems,orderCustomer,addressFingerprint,createOrderQuote,confirmedOrderCapture} from '../server/order-core.mjs';
import {createPostgresOrders} from '../server/orders-postgres.mjs';
import {applicationPool} from '../server/postgres-schema.mjs';

const sku=products[0].id+'::mini',otherSku=products[1].id+'::mini',session='a'.repeat(64);
const customer={name:'Sandbox Order Test',email:'order-test@example.invalid',address:{line1:'TEST ADDRESS — NOT FOR DELIVERY',city:'Test',region:'TEST',postalCode:'00000',country:'US'}};
let now=1700000000000;
const delivery=(items={[sku]:1},options={})=>({reviewed:true,shippingCents:500,taxCents:100,addressHash:addressFingerprint(orderCustomer(customer)),itemsHash:orderItems(items).itemsHash,expiresAt:now+600000,reference:'TEST-QUOTE-NOT-A-SHIPPING-RATE',policyVersion:'test-only',processingTime:'Test fixture only',...options});
const input=(options={})=>({sessionHash:session,nonce:randomUUID(),items:{[sku]:1},customer,delivery:delivery(),...options});
const paid=(order,id='CAPTURETEST123')=>({id:order.paypal_id,status:'COMPLETED',purchase_units:[{custom_id:order.id,payments:{captures:[{id,status:'COMPLETED',final_capture:true,amount:{currency_code:'USD',value:(order.total_cents/100).toFixed(2)}}]}}]});
async function database(){
 const db=new PGlite();await db.exec(await readFile(new URL('../server/orders-schema.sql',import.meta.url),'utf8'));
 // PGlite is one connection. Serialize transactions here; real PostgreSQL
 // concurrency is checked separately against an isolated temporary QA schema.
 let queue=Promise.resolve();
 const pool={query:(sql,args)=>db.query(sql,args),connect:async()=>{
  const previous=queue;let release;queue=new Promise(resolve=>release=resolve);await previous;
  return {query:(sql,args)=>db.query(sql,args),release};
 }};
 return {db,pool,store:createPostgresOrders(applicationPool(pool),{environment:'sandbox',clock:()=>now})};
}

test('order quotes use catalog prices and require a current trusted delivery quote',()=>{
 now=1700000000000;
 const snapshot=createOrderQuote({[sku]:2},customer,delivery({[sku]:2}),now);
 assert.equal(snapshot.quote.subtotalCents,2400);assert.equal(snapshot.quote.totalCents,3000);
 assert.equal(snapshot.customer.email,customer.email);assert.equal(snapshot.quote.lines[0].unitCents,1200);
 for(const invalid of [null,delivery(undefined,{reviewed:false}),delivery(undefined,{addressHash:'tampered'}),delivery(undefined,{itemsHash:'wrong'}),delivery(undefined,{shippingCents:-1}),delivery(undefined,{taxCents:1.5}),delivery(undefined,{expiresAt:now})])assert.throws(()=>createOrderQuote({[sku]:1},customer,invalid,now));
 assert.throws(()=>orderItems({[products[0].id]:1}));
 assert.throws(()=>orderCustomer({...customer,email:'invalid'}));
});

test('inventory is held once, insufficient stock rolls back, and sessions cannot access another order',async()=>{
 now=1700000000000;const {db,store}=await database();
 try{
  await store.setStock(sku,{mode:'ready_stock',onHand:1});
  const attempt=input(),first=await store.reserve(attempt),retry=await store.reserve(attempt);
  assert.equal(first.id,retry.id);assert.equal((await db.query('SELECT reserved FROM ktts_stock')).rows[0].reserved,1);
  await assert.rejects(store.reserve(input()),/enough stock/);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ktts_orders')).rows[0].n,1);
  assert.equal(await store.get(first.id,'b'.repeat(64)),null);
  await assert.rejects(store.bindPayment(first.id,'b'.repeat(64),'PAYPALORDER123'),/unavailable/);
  await assert.rejects(store.setStock(sku,{mode:'ready_stock',onHand:0}),/reservations/);
  await assert.rejects(store.setStock(sku,{mode:'made_to_order',onHand:null}),/reservations/);
  await assert.rejects(store.reserve({...attempt,customer:{...customer,name:'Changed customer'}}),/details changed/);
 }finally{await db.close();}
});

test('all-or-nothing reservations release on cancel or expiry and never touch live inventory',async()=>{
 now=1700000000000;const {db,store,pool}=await database();
 try{
  const live=createPostgresOrders(pool,{environment:'live',clock:()=>now});
  await live.setStock(sku,{mode:'ready_stock',onHand:20});
  await store.setStock(sku,{mode:'ready_stock',onHand:2});
  await assert.rejects(store.reserve(input({items:{[sku]:1,[otherSku]:1},delivery:delivery({[sku]:1,[otherSku]:1})})),/Availability/);
  assert.equal((await db.query("SELECT reserved FROM ktts_stock WHERE environment='sandbox'")).rows[0].reserved,0);
  const canceled=await store.reserve(input());await store.cancel(canceled.id,session);await store.cancel(canceled.id,session);
  const expiring=await store.reserve(input());now+=600001;assert.equal(await store.expireReservations(),1);
  assert.equal((await store.get(expiring.id,session)).status,'EXPIRED');
  const stocks=(await db.query('SELECT * FROM ktts_stock ORDER BY environment')).rows;
  assert.ok(stocks.every(s=>s.reserved===0));assert.equal(stocks.find(s=>s.environment==='live').on_hand,20);assert.equal(stocks.find(s=>s.environment==='sandbox').on_hand,2);
 }finally{await db.close();}
});

test('verified payment commits stock exactly once, snapshots stay fixed, and unpaid orders cannot ship',async()=>{
 now=1700000000000;const {db,store}=await database();
 try{
  await store.setStock(sku,{mode:'ready_stock',onHand:2});
  const reserved=await store.reserve(input());await assert.rejects(store.fulfill(reserved.id,{carrier:'TEST',trackingNumber:'TEST123'}),/Only a paid/);
  const order=await store.bindPayment(reserved.id,session,'PAYPALORDER123');
  assert.throws(()=>confirmedOrderCapture({...paid(order),id:'WRONGORDER123'},order));
  const wrong=paid(order);wrong.purchase_units[0].payments.captures[0].amount.value='0.01';
  await assert.rejects(store.capture(order.id,wrong),/amount or status/);
  const [first,repeat]=await Promise.all([store.capture(order.id,paid(order)),store.capture(order.id,paid(order))]);
  assert.equal(first.status,'PAID');assert.equal(repeat.capture_id,first.capture_id);
  const stock=(await db.query('SELECT * FROM ktts_stock')).rows[0];assert.equal(stock.on_hand,1);assert.equal(stock.reserved,0);
  await assert.rejects(store.cancel(order.id,session),/confirmed payment/);
  const shipped=await store.fulfill(order.id,{carrier:'TEST CARRIER',trackingNumber:'TEST-DO-NOT-SHIP'});
  assert.equal(shipped.status,'FULFILLED');assert.equal(shipped.quote_json.totalCents,1800);assert.equal(shipped.customer_json.address.line1,customer.address.line1);
  await store.fulfill(order.id,{carrier:'TEST CARRIER',trackingNumber:'TEST-DO-NOT-SHIP'});
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM ktts_order_events WHERE event_type='PAID'")).rows[0].n,1);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM ktts_order_events WHERE event_type='FULFILLED'")).rows[0].n,1);
 }finally{await db.close();}
});

test('a late payment goes to owner review without taking stock reserved by another checkout',async()=>{
 now=1700000000000;const {db,store}=await database();
 try{
  await store.setStock(sku,{mode:'ready_stock',onHand:1});
  const first=await store.reserve(input()),bound=await store.bindPayment(first.id,session,'PAYPALORDER123');
  now+=600001;
  const second=await store.reserve(input()); // Expires old holds before reserving.
  assert.equal((await store.get(first.id,session)).status,'EXPIRED');
  const late=await store.capture(first.id,paid(bound));assert.equal(late.status,'PAYMENT_REVIEW');
  await assert.rejects(store.fulfill(first.id,{carrier:'TEST',trackingNumber:'TEST'}),/Only a paid/);
  const stock=(await db.query('SELECT * FROM ktts_stock')).rows[0];assert.equal(stock.on_hand,1);assert.equal(stock.reserved,1);
  assert.equal((await store.get(second.id,session)).status,'RESERVED');
 }finally{await db.close();}
});

test('made-to-order availability must be explicitly configured and does not invent stock quantities',async()=>{
 now=1700000000000;const {db,store}=await database();
 try{
  await assert.rejects(store.reserve(input()),/Availability/);
  await store.setStock(sku,{mode:'made_to_order',onHand:null});
  const reserved=await store.reserve(input()),bound=await store.bindPayment(reserved.id,session,'PAYPALORDER123');
  await store.capture(bound.id,paid(bound));
  const stock=(await db.query('SELECT * FROM ktts_stock')).rows[0];assert.equal(stock.on_hand,null);assert.equal(stock.reserved,0);
 }finally{await db.close();}
});
