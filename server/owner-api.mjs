import {refundOrder} from './paypal-refunds.mjs';
const json=(status,payload)=>Response.json(payload,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const safeOrder=order=>{
 if(!order)return null;
 const {session_hash,nonce,fingerprint,payment_lease_token,payment_lease_until,payment_lease_phase,...safe}=order;return safe;
};
async function body(request){
 if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>16384)throw Error('Invalid request.');
 let bytes=0;const chunks=[];
 if(!request.body)throw Error('Missing request.');
 for await(const chunk of request.body){bytes+=chunk.byteLength;if(bytes>16384)throw Error('Request too large.');chunks.push(Buffer.from(chunk));}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid request.');return data;
}
export function createOwnerApi({origin,authenticate,getStore,getGateway,clock=Date.now,environment}){
 if(!['sandbox','live'].includes(environment))throw Error('Configure the owner desk environment.');
 return async(request,action)=>{
  if(!['me','orders','order','stock','ship','expire','refund','refunds'].includes(action))return json(404,{error:'Not found.'});
  const method=request.method,mutating=['ship','expire','refund'].includes(action)||action==='stock'&&method==='POST';
  if(mutating?method!=='POST':method!=='GET')return json(405,{error:'Use the order desk controls.'});
  try{
   const user=await authenticate(request),authorized=Boolean(user&&Number(user.store_owner_until)>clock());
   if(action==='me')return json(200,{authorized,username:user?.username||null,ownerUntil:authorized?Number(user.store_owner_until):null,environment});
   if(!authorized)return json(user?403:401,{error:'Store owner access is required.'});
   if(mutating&&request.headers.get('origin')!==origin)return json(403,{error:'Use the owner desk on this site.'});
   let data;if(mutating)try{data=await body(request);}catch{return json(400,{error:'Check the order desk form.'});}
   const store=await getStore();
   if(action==='orders')return json(200,{orders:(await store.list()).map(safeOrder)});
   if(action==='refunds'){
    const id=new URL(request.url).searchParams.get('id');if(!uuid(id))return json(400,{error:'Invalid order reference.'});
    if(!await store.ownerOrder(id))return json(404,{error:'Order not found.'});return json(200,{refunds:await store.refundsFor(id)});
   }
   if(action==='refund'){
    if(data.confirm!==true)return json(400,{error:'Confirm the refund amount before sending it to PayPal.'});
    if(typeof getGateway!=='function')return json(503,{error:'Refund payments are not configured.'});
    const result=await refundOrder({store,gateway:await getGateway(),id:data.id,nonce:data.nonce,amountCents:data.amountCents,clock});return json(200,{...result,order:safeOrder(result.order)});
   }
   if(action==='order'){
    const id=new URL(request.url).searchParams.get('id');if(!uuid(id))return json(400,{error:'Invalid order reference.'});
    const order=await store.ownerOrder(id);return order?json(200,{order:safeOrder(order)}):json(404,{error:'Order not found.'});
   }
   if(action==='stock'&&method==='GET')return json(200,{stock:await store.listStock()});
   if(action==='stock')return json(200,{stock:await store.setStock(data.sku,{mode:data.mode,onHand:data.onHand})});
   if(action==='ship')return json(200,{order:safeOrder(await store.fulfill(data.id,{carrier:data.carrier,trackingNumber:data.trackingNumber}))});
   if(action==='expire')return json(200,{expired:await store.expireReservations()});
  }catch(error){return json(error.status||503,{error:error.status?error.message:'The owner desk is temporarily unavailable. No payment was initiated.'});}
 };
}
