import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerApi} from '../server/owner-api.mjs';
import {createVercelApp} from '../server/vercel-app.mjs';
const origin='https://store.example',id='11111111-1111-4111-8111-111111111111',now=1700000000000;
const request=(action,data,from=origin)=>new Request(origin+'/api/owner/'+action,{method:data?'POST':'GET',headers:{Origin:from,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});

test('owner API denies regular, expired and signed-out users before opening order storage',async()=>{
 let storage=0;
 for(const user of [null,{username:'normal',member_until:now+10000},{username:'expired',store_owner_until:now}]){
  const api=createOwnerApi({origin,environment:'sandbox',clock:()=>now,authenticate:async()=>user,getStore:async()=>{storage++;throw Error('Should not connect');}});
  const me=await api(request('me'),'me');assert.equal((await me.json()).authorized,false);
  const denied=await api(request('stock',{sku:'forged',store_owner_until:now+1000000}),'stock');assert.equal(denied.status,user?403:401);
 }
 assert.equal(storage,0);
});

test('owner mutations require same-origin POST and strip session secrets from order responses',async()=>{
 let changes=0;
 const store={setStock:async(...args)=>{changes++;return {sku:args[0]};},ownerOrder:async()=>({id,status:'PAID',session_hash:'secret',nonce:'private',fingerprint:'private',customer_json:{name:'Test Customer'}}),fulfill:async()=>({id,status:'FULFILLED',session_hash:'secret'})};
 const api=createOwnerApi({origin,environment:'live',clock:()=>now,authenticate:async()=>({username:'owner',store_owner_until:now+10000,member_until:0}),getStore:async()=>store});
 assert.equal((await api(request('stock',{sku:'test'},'https://attacker.example'),'stock')).status,403);assert.equal(changes,0);
 const saved=await api(request('stock',{sku:'test',mode:'ready_stock',onHand:3}),'stock');assert.equal(saved.status,200);assert.equal(changes,1);
 const orderRequest=new Request(origin+'/api/owner/order?id='+id),result=await (await api(orderRequest,'order')).json();
 assert.equal(result.order.customer_json.name,'Test Customer');for(const key of ['session_hash','nonce','fingerprint'])assert.equal(key in result.order,false);
 assert.equal((await api(request('ship'),'ship')).status,405);
 assert.equal((await api(request('unknown'),'unknown')).status,404);
});

test('Vercel owner POST preserves the request body while authenticating the member cookie',async()=>{
 let saved;
 const user={username:'owner',store_owner_until:Date.now()+60000};
 const app=createVercelApp({env:{KTTS_ORIGIN:origin,DATABASE_URL:'test-only',VERCEL_ENV:'preview'},connect:async()=>({current:async token=>token==='a'.repeat(64)?user:null,publicUser:()=>null}),connectCommerce:async(_,{environment})=>{assert.equal(environment,'sandbox');return {setStock:async(sku,details)=>{saved={sku,...details};return saved;}};}});
 const data={sku:'test::mini',mode:'ready_stock',onHand:2};
 const result=await app(new Request(origin+'/api/index?kind=owner&action=stock',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'ktts_member='+'a'.repeat(64)},body:JSON.stringify(data)}));
 assert.equal(result.status,200);assert.deepEqual(saved,data);
});
