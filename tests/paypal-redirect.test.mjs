import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const source=(await fs.readFile(new URL('../paypal-sandbox.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('init().catch','globalThis.ready=init().catch');
async function page({query='',pending,enabled=true,failCapture=false}={}){
 const nodes=new Map(),storage=new Map(pending?[['ktts-paypal-sandbox-pending',JSON.stringify(pending)]]:[]),calls=[];
 const node=()=>({hidden:true,disabled:false,textContent:'',children:[],events:{},style:{},append(child){this.children.push(child);},replaceChildren(){this.children=[];},addEventListener(type,fn){this.events[type]=fn;}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 let fail=failCapture;
 const context={URL,URLSearchParams,crypto:{randomUUID},restoreRitualBag:()=>({items:{'release-1010::mini':1}}),bagLines:()=>[{qty:1,product:{name:'Let That Shit Go'},size:{short:'Mini',weight:'4 oz',priceCents:1200}}],money:cents=>'$'+(cents/100),sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{querySelector:get,createElement:node,head:node()},location:{search:query,pathname:'/paypal-sandbox.html',assign:()=>{}},history:{replaceState:()=>{}},fetch:async(path,options)=>{
  if(path==='/api/paypal/config')return {json:async()=>({enabled,message:'Sandbox only',clientId:'test-client'})};
  calls.push(path);
  if(fail){fail=false;return {ok:false,json:async()=>({error:'Please retry the same test.'})};}
  return {ok:true,json:async()=>({status:'COMPLETED',test:true,totalCents:1200,currency:'USD',paypalId:'TESTORDER123456789',captureId:'TESTCAPTURE123',message:'Sandbox complete'})};
 }};
 vm.runInNewContext(source,context);await context.ready;
 return {get,storage,calls};
}
test('PayPal return captures only the order started in this tab and renders verified receipt',async()=>{
 const p=await page({query:'?paypal=approved&token=TESTORDER123456789',pending:{id:'TESTORDER123456789'}});
 assert.deepEqual(p.calls,['/api/paypal/orders/TESTORDER123456789/capture']);
 assert.equal(p.get('#sandbox-receipt').hidden,false);assert.match(p.get('#sandbox-receipt').children.map(x=>x.textContent).join(' '),/TESTCAPTURE123/);assert.equal(p.storage.size,0);
 const mismatch=await page({query:'?paypal=approved&token=OTHERORDER12345678',pending:{id:'TESTORDER123456789'}});assert.equal(mismatch.calls.length,0);assert.equal(mismatch.get('#sandbox-receipt').hidden,true);
});
test('interrupted capture stays unconfirmed and retry checks the same payment',async()=>{
 const p=await page({query:'?paypal=approved&token=TESTORDER123456789',pending:{id:'TESTORDER123456789'},failCapture:true});
 assert.equal(p.get('#sandbox-receipt').hidden,true);assert.equal(p.get('#capture-retry').hidden,false);assert.equal(p.storage.size,1);assert.equal(p.get('#paypal-redirect').hidden,true);
 await p.get('#capture-retry').events.click();assert.equal(p.get('#sandbox-receipt').hidden,false);assert.equal(p.calls.length,2);assert.equal(p.calls[0],p.calls[1]);
 const reload=await page({pending:{id:'TESTORDER123456789',approved:true}});assert.equal(reload.calls[0],'/api/paypal/orders/TESTORDER123456789/capture');assert.equal(reload.get('#sandbox-receipt').hidden,false);
});
test('cancel clears the pending attempt, and disabled production cannot capture a return',async()=>{
 const canceled=await page({query:'?paypal=canceled',pending:{id:'TESTORDER123456789'}});assert.equal(canceled.calls.length,0);assert.equal(canceled.storage.size,0);assert.match(canceled.get('#sandbox-status').textContent,/canceled/);
 const production=await page({enabled:false,query:'?paypal=approved&token=TESTORDER123456789',pending:{id:'TESTORDER123456789'}});assert.equal(production.calls.length,0);assert.equal(production.get('#paypal-redirect').hidden,true);
});
