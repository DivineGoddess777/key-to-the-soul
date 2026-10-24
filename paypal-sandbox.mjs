import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {getBagLine} from './ritual-bag.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function sandboxApprovalUrl(order){
 const href=order?.links?.find(link=>['payer-action','approve'].includes(link.rel))?.href;
 try{const url=new URL(href);if(url.origin==='https://www.sandbox.paypal.com'&&!url.username&&!url.password&&url.pathname==='/checkoutnow')return url.href;}catch{}
 throw Error('PayPal did not return a safe sandbox approval address. Please retry.');
}
const receipt=record=>({status:'COMPLETED',test:true,localId:record.local_id,paypalId:record.paypal_id,captureId:record.capture_id,totalCents:Number(record.total_cents),currency:'USD',message:'Sandbox test complete. No real charge, store order, or shipment was created.'});
export function quoteSandboxCart(items){
 if(!items||Array.isArray(items)||typeof items!=='object'||Object.keys(items).length<1||Object.keys(items).length>50)throw Error('Choose at least one candle and its size.');
 let totalCents=0,quantity=0;const lines=[];
 for(const [key,qty] of Object.entries(items)){
  const line=getBagLine(key);
  if(!line?.size||!Number.isInteger(qty)||qty<1||qty>9)throw Error('Every candle needs a confirmed size and a quantity from 1 to 9.');
  quantity+=qty;totalCents+=line.size.priceCents*qty;
  if(quantity>100)throw Error('This test checkout supports up to 100 candles.');
  lines.push({name:(line.product.name+(line.product.number?' '+line.product.number:'')+' · '+line.size.short+' '+line.size.weight).slice(0,127),quantity:String(qty),sku:line.key,category:'PHYSICAL_GOODS',unit_amount:{currency_code:'USD',value:(line.size.priceCents/100).toFixed(2)}});
 }
 return {totalCents,quantity,lines,value:(totalCents/100).toFixed(2)};
}
export function validateSandboxCapture(payload,record){
 const captures=payload?.purchase_units?.flatMap(unit=>unit.payments?.captures||[])||[];
 if(payload?.status!=='COMPLETED'||captures.length!==1||captures[0].status!=='COMPLETED'||!/^[A-Z0-9]{6,32}$/.test(captures[0].id||'')||captures[0].amount?.currency_code!=='USD'||captures[0].amount.value!==(record.total_cents/100).toFixed(2))throw Error('PayPal has not confirmed the expected completed test payment.');
 return captures[0].id;
}
export function createSqliteSandboxOrders(root,clock=Date.now){
 const dir=path.join(root,'.data');fs.mkdirSync(dir,{recursive:true});
 const db=new DatabaseSync(path.join(dir,'paypal-sandbox.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
 db.exec("CREATE TABLE IF NOT EXISTS sandbox_orders(local_id TEXT PRIMARY KEY,session_hash TEXT NOT NULL,cart_hash TEXT NOT NULL,total_cents INTEGER NOT NULL,items_json TEXT NOT NULL,paypal_id TEXT UNIQUE,status TEXT NOT NULL,capture_id TEXT,created_at INTEGER NOT NULL,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0)");
 const columns=db.prepare('PRAGMA table_info(sandbox_orders)').all().map(row=>row.name);
 if(!columns.includes('lease_token'))db.exec('ALTER TABLE sandbox_orders ADD COLUMN lease_token TEXT');
 if(!columns.includes('lease_until'))db.exec('ALTER TABLE sandbox_orders ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0');
 return {
  reserve(record){db.prepare('INSERT OR IGNORE INTO sandbox_orders(local_id,session_hash,cart_hash,total_cents,items_json,status,created_at) VALUES(?,?,?,?,?,?,?)').run(record.local_id,record.session_hash,record.cart_hash,record.total_cents,record.items_json,'CREATING',record.created_at);return db.prepare('SELECT * FROM sandbox_orders WHERE local_id=?').get(record.local_id);},
  getByPayment:(id,sessionHash)=>db.prepare('SELECT * FROM sandbox_orders WHERE paypal_id=? AND session_hash=?').get(id,sessionHash),
  claim(id,kind,token){const condition=kind==='create'?'paypal_id IS NULL':"paypal_id IS NOT NULL AND status<>'COMPLETED'";return db.prepare('UPDATE sandbox_orders SET lease_token=?,lease_until=? WHERE local_id=? AND lease_until<=? AND '+condition).run(token,clock()+90000,id,clock()).changes===1;},
  created:(id,paypalId,lease)=>db.prepare("UPDATE sandbox_orders SET paypal_id=?,status='CREATED',lease_token=NULL,lease_until=0 WHERE local_id=? AND lease_token=?").run(paypalId,id,lease).changes===1,
  completed:(id,captureId,lease)=>db.prepare("UPDATE sandbox_orders SET status='COMPLETED',capture_id=?,lease_token=NULL,lease_until=0 WHERE local_id=? AND lease_token=?").run(captureId,id,lease).changes===1,
  release:(id,lease)=>db.prepare('UPDATE sandbox_orders SET lease_token=NULL,lease_until=0 WHERE local_id=? AND lease_token=?').run(id,lease),
  close:()=>db.close()
 };
}
export function createPaypalSandbox({root,origin,production=false,clientId=process.env.PAYPAL_SANDBOX_CLIENT_ID,secret=process.env.PAYPAL_SANDBOX_CLIENT_SECRET,enabled=process.env.KTTS_PAYPAL_SANDBOX==='1',request=fetch,store:providedStore,secure=false,clock=Date.now,clientKey=req=>req.socket.remoteAddress||'local'}){
 const available=Boolean(enabled&&!production&&clientId&&secret);
 const store=providedStore||createSqliteSandboxOrders(root,clock);
 let token,tokenUntil=0;const attempts=new Map();
 async function accessToken(){
  if(token&&tokenUntil>Date.now()+60000)return token;
  const response=await request('https://api-m.sandbox.paypal.com/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(clientId+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('PayPal sandbox credentials could not be verified.');
  const data=await response.json();token=data.access_token;tokenUntil=Date.now()+Math.max(0,data.expires_in-60)*1000;return token;
 }
 async function paypal(url,body,idempotency,method='POST'){
  try{
  const response=await request('https://api-m.sandbox.paypal.com'+url,{method,headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json',...(idempotency?{'PayPal-Request-Id':idempotency}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw Error('PayPal sandbox could not complete that test. No store order has been placed.');return data;
  }catch{throw Error('PayPal sandbox could not finish that test. You can retry the same test safely.');}
 }
 const cookie=req=>String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('ktts_sandbox='))?.slice(13);
 function send(res,status,payload,session){const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(session)headers['Set-Cookie']='ktts_sandbox='+session+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200'+(secure?'; Secure':'');res.writeHead(status,headers).end(JSON.stringify(payload));}
 async function handle(req,res){
  const route=new URL(req.url,origin).pathname;if(!route.startsWith('/api/paypal/'))return false;
  if(route==='/api/paypal/config'&&req.method==='GET'){
   let session=cookie(req);if(!/^[a-f0-9]{64}$/.test(session||''))session=randomBytes(32).toString('hex');
   send(res,200,{enabled:available,mode:'sandbox',clientId:available?clientId:null,message:available?'Sandbox only. No real store order or shipment is created.':'PayPal sandbox needs the owner’s developer-app credentials and the sandbox flag. Live checkout is closed.'},session);return true;
  }
  if(!available){send(res,503,{error:'PayPal sandbox is not connected. Live ordering remains closed.'});return true;}
  if(req.method!=='POST'){send(res,405,{error:'Use the sandbox checkout controls.'});return true;}
  if(req.headers.origin!==origin){send(res,403,{error:'Use the sandbox page on this site.'});return true;}
  const session=cookie(req);if(!/^[a-f0-9]{64}$/.test(session||'')){send(res,401,{error:'Open the sandbox page again.'});return true;}
  const ip=clientKey(req),now=clock();
  if(store.consumeAttempt){
   if(!await store.consumeAttempt(ip)){send(res,429,{error:'Please pause before trying another test.'});return true;}
  }else{
   for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);
   const limit=attempts.get(ip)||{count:0,until:now+60000};limit.count++;attempts.set(ip,limit);
   if(limit.count>20){send(res,429,{error:'Please pause before trying another test.'});return true;}
   if(attempts.size>2000)attempts.delete(attempts.keys().next().value);
  }
  let body,raw='';
  try{
   if(!(req.headers['content-type']||'').startsWith('application/json')||Number(req.headers['content-length']||0)>16384)throw Error();
   const chunks=[];let bytes=0;for await(const chunk of req){const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>16384)throw Error('Request too large');chunks.push(buffer);}raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
   body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=='object')throw Error();
  }catch{send(res,400,{error:'Please check the sandbox cart.'});return true;}
  let claimId,lease;
  try{
   if(route==='/api/paypal/orders'){
    if(typeof body.nonce!=='string'||!/^[a-f0-9-]{36}$/i.test(body.nonce))throw Error('Restart this checkout test.');
    const quote=quoteSandboxCart(body.items),sessionHash=hash(session),localId=hash(session+body.nonce).slice(0,32),cartHash=hash(JSON.stringify(quote));
    const record=await store.reserve({local_id:localId,session_hash:sessionHash,cart_hash:cartHash,total_cents:quote.totalCents,items_json:JSON.stringify(quote.lines),created_at:clock()});
    if(record&&record.cart_hash!==cartHash){send(res,409,{error:'The cart changed. Start a fresh checkout test.'});return true;}
    if(record?.paypal_id){
     if(record.status==='COMPLETED')throw Object.assign(Error('This test is already complete. Start a new test from your bag.'),{status:409});
     const approvalUrl=body.flow==='redirect'?sandboxApprovalUrl(await paypal('/v2/checkout/orders/'+record.paypal_id,undefined,undefined,'GET')):undefined;
     send(res,200,{id:record.paypal_id,test:true,approvalUrl});return true;
    }
    if(clock()-Number(record.created_at)>=6*60*60*1000)throw Object.assign(Error('This test attempt has expired. Start a fresh sandbox checkout.'),{status:409});
    claimId=localId;lease=randomUUID();
    if(!await store.claim(claimId,'create',lease))throw Object.assign(Error('This test is already being prepared. Please retry in a moment.'),{status:409});
    const order=await paypal('/v2/checkout/orders',{intent:'CAPTURE',purchase_units:[{reference_id:localId,custom_id:localId,amount:{currency_code:'USD',value:quote.value,breakdown:{item_total:{currency_code:'USD',value:quote.value}}},items:quote.lines}],payment_source:{paypal:{experience_context:{brand_name:'Key to the Soul · TEST',user_action:'PAY_NOW',shipping_preference:'NO_SHIPPING',return_url:origin+'/paypal-sandbox.html?paypal=approved',cancel_url:origin+'/paypal-sandbox.html?paypal=canceled'}}}},localId);
    if(!/^[A-Z0-9]{10,32}$/.test(order.id||''))throw Error('PayPal did not return a valid test order.');
    if(!await store.created(localId,order.id,lease))throw Object.assign(Error('The test is still being reconciled. Please retry.'),{status:409});
    send(res,200,{id:order.id,test:true,...(body.flow==='redirect'?{approvalUrl:sandboxApprovalUrl(order)}:{})});
   }else{
    const match=/^\/api\/paypal\/orders\/([A-Z0-9]{10,32})\/capture$/.exec(route);
    if(!match){send(res,404,{error:'That sandbox action is unavailable.'});return true;}
    const record=await store.getByPayment(match[1],hash(session));
    if(!record){send(res,404,{error:'That test order is unavailable in this checkout session.'});return true;}
    if(record.status==='COMPLETED'){send(res,200,receipt(record));return true;}
    claimId=record.local_id;lease=randomUUID();
    if(!await store.claim(claimId,'capture',lease))throw Object.assign(Error('This test payment is already being checked. Please retry in a moment.'),{status:409});
    const latest=await paypal('/v2/checkout/orders/'+match[1],undefined,undefined,'GET');
    const capture=latest.status==='COMPLETED'?latest:await paypal('/v2/checkout/orders/'+match[1]+'/capture',{},record.local_id+'-cap');

    const captureId=validateSandboxCapture(capture,record);
    if(!await store.completed(record.local_id,captureId,lease))throw Object.assign(Error('The test is still being reconciled. Please retry.'),{status:409});
    send(res,200,receipt({...record,capture_id:captureId}));
   }
  }catch(error){if(claimId&&lease)try{await store.release(claimId,lease);}catch{}send(res,error.status||400,{error:error.message});}
  return true;
 }
 return {handle,close:()=>store.close()};
}
