const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const safe=row=>{const {user_id,nonce,environment,funding_payment_id,...view}=row;return view;};
async function body(request){
 if(!request.body||!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>60000)throw Error('Invalid request.');
 let count=0;const parts=[];for await(const part of request.body){count+=part.byteLength;if(count>60000)throw Error('Request too large.');parts.push(Buffer.from(part));}
 const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Invalid form.');return result;
}
export function createPersonalReadingsApi({origin,environment,enabled=false,authenticate,getStore,clock=Date.now}){
 if(!['sandbox','live'].includes(environment))throw Error('Configure the personal reading environment.');
 return async(request,action)=>{
  if(!['config','me','request','queue','start','deliver'].includes(action))return json(404,{error:'Not found.'});
  const mutating=['request','start','deliver'].includes(action);
  if(request.method!==(mutating?'POST':'GET'))return json(405,{error:'Use the reading room controls.'});
  if(action==='config')return json(200,{enabled,environment,reader:'Keianna',priceCents:1111,interval:'month',creditsPerPaidMonth:1,maxUnusedReadings:15,unlimitedSelfGuided:true});
  if(!enabled)return json(503,{error:'Personal reading requests open with paid membership. Enrollment is not open yet.'});
  try{
   const user=await authenticate(request);if(!user)return json(401,{error:'Sign in to see your personal readings.'});
   const owner=['queue','start','deliver'].includes(action);
   if(owner&&!(Number(user.store_owner_until)>clock()))return json(403,{error:'Store owner access is required.'});
   if(mutating&&request.headers.get('origin')!==origin)return json(403,{error:'Use the personal reading form on this site.'});
   let data;if(mutating)try{data=await body(request);}catch{return json(400,{error:'Check the reading form.'});}
   const store=await getStore();
   if(action==='me')return json(200,await store.summary(user.id));
   if(action==='request')return json(200,{request:safe(await store.request(user.id,{nonce:data.nonce,email:data.email,question:data.question}))});
   if(action==='queue')return json(200,{requests:(await store.queue()).map(safe)});
   if(action==='start')return json(200,{request:safe(await store.start(data.id))});
   if(action==='deliver')return json(200,{request:safe(await store.deliver(data.id,{responseText:data.responseText}))});
  }catch(error){return json(error.status||503,{error:error.status?error.message:'The personal reading room is temporarily unavailable.'});}
 };
}
