import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {applicationPool} from '../server/postgres-schema.mjs';
import {createPostgresOrders} from '../server/orders-postgres.mjs';
import {createVercelApp} from '../server/vercel-app.mjs';
import {createStoreMaintenance} from '../server/store-maintenance.mjs';
const secret='c'.repeat(64),origin='https://fixture.example';
test('scheduled cleanup releases abandoned holds without another checkout and preserves payment leases, fresh holds and the other environment',async()=>{
 const db=new PGlite(),now=1800000000000,sku='release-1010::mini';
 try{
  await db.exec(await readFile(new URL('../server/orders-schema.sql',import.meta.url),'utf8'));
  for(const [environment,stock,reserved] of [['sandbox',3,3],['live',5,1]])await db.query('INSERT INTO ktts_stock(environment,sku,mode,on_hand,reserved,updated_at) VALUES($1,$2,$3,$4,$5,$6)',[environment,sku,'ready_stock',stock,reserved,now]);
  const ids={};
  for(const [name,environment,expires,lease] of [['abandoned','sandbox',now-1,0],['capturing','sandbox',now-1,now+60000],['fresh','sandbox',now+60000,0],['other','live',now-1,0]]){
   const id=randomUUID();ids[name]=id;
   await db.query("INSERT INTO ktts_orders(id,environment,session_hash,nonce,fingerprint,quote_json,customer_json,total_cents,status,created_at,expires_at,payment_lease_until) VALUES($1,$2,$3,$4,$5,'{}','{}',1200,'RESERVED',$6,$7,$8)",[id,environment,'a'.repeat(64),randomUUID(),'synthetic-fixture',now-1000,expires,lease]);
   await db.query("INSERT INTO ktts_order_lines(order_id,environment,sku,quantity,reservation_state) VALUES($1,$2,$3,1,'HELD')",[id,environment,sku]);
  }
  const pool=applicationPool({query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})});
  let opened=0;
  const app=createVercelApp({env:{KTTS_ORIGIN:origin,VERCEL_ENV:'preview',DATABASE_URL:'synthetic-not-a-connection',CRON_SECRET:secret},connectCommerce:async(_,{environment})=>{opened++;assert.equal(environment,'sandbox');return createPostgresOrders(pool,{environment,clock:()=>now});}});
  const url=origin+'/api/index?kind=maintenance';
  assert.equal((await app(new Request(url))).status,401);assert.equal(opened,0);
  const first=await app(new Request(url,{headers:{Authorization:'Bearer '+secret}}));assert.equal(first.status,200);
  const result=await first.json();assert.equal(result.reservationsExpired,1);assert.equal(result.reservationCleanupFailed,0);assert.equal(result.sent,0);
  const states=Object.fromEntries((await db.query('SELECT id,status FROM ktts_orders')).rows.map(row=>[row.id,row.status]));
  assert.equal(states[ids.abandoned],'EXPIRED');for(const name of ['capturing','fresh','other'])assert.equal(states[ids[name]],'RESERVED');
  const stocks=Object.fromEntries((await db.query('SELECT environment,reserved,on_hand FROM ktts_stock')).rows.map(row=>[row.environment,row]));
  assert.equal(stocks.sandbox.reserved,2);assert.equal(stocks.sandbox.on_hand,3);assert.equal(stocks.live.reserved,1);
  const retry=await app(new Request(url,{headers:{Authorization:'Bearer '+secret}}));assert.equal((await retry.json()).reservationsExpired,0);
  assert.equal(Number((await db.query('SELECT COUNT(*) AS count FROM ktts_order_events')).rows[0].count),1);
 }finally{await db.close();}
});
test('cleanup failure is reported without leaking errors or blocking successful queued mail',async()=>{
 let sent=0,closed=false;
 const app=createStoreMaintenance({secret,emailEnabled:true,getMail:async()=>({dispatch:async()=>{sent++;return {sent:1,failed:0};},close:()=>{closed=true;}}),getOrders:async()=>({expireReservations:async()=>{throw Error('PRIVATE DATABASE DETAILS');}})});
 const response=await app(new Request(origin+'/api/store-maintenance',{headers:{Authorization:'Bearer '+secret}}));
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.sent,1);assert.equal(result.reservationCleanupFailed,1);assert.equal(sent,1);assert.equal(closed,true);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
