import {recoveryEmail} from './account-recovery.mjs';
const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const neutral='If this address is linked to an account, a password-reset email will arrive shortly. Check your inbox and spam folder.';
async function readBody(request){if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>4096||!request.body)throw Error();let size=0;const parts=[];for await(const part of request.body){size+=part.byteLength;if(size>4096)throw Error();parts.push(Buffer.from(part));}const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));if(!result||typeof result!=='object'||Array.isArray(result))throw Error();return result;}
export function createRecoveryApi({enabled=false,authenticate,reauthenticate,getStore,origin,clientKey=request=>request.headers.get('x-forwarded-for')||'unavailable'}){
 return async(request,action)=>{
  if(!['config','status','request-verification','verify','request-reset','reset'].includes(action))return json(404,{error:'Not found.'});
  if(request.method!==(['config','status'].includes(action)?'GET':'POST'))return json(405,{error:'Use the account form.'});
  if(action==='config')return json(200,{enabled});
  if(!enabled)return json(503,{error:'Email recovery is being prepared. Contact support@keytothesoul.com for account help.'});
  if(request.method==='POST'&&request.headers.get('origin')!==origin)return json(403,{error:'Use the account form on this site.'});
  const started=Date.now();
  try{
   let user;if(['status','request-verification'].includes(action)){user=await authenticate(request);if(!user)return json(401,{error:'Sign in to set up your recovery email.'});}
   let data;if(request.method==='POST')try{data=await readBody(request);}catch{return json(400,{error:'Check the account form.'});}
   const store=await getStore();
   if(action==='status')return json(200,await store.status(user.id));
   if(!await store.consumeAttempt('ip:'+clientKey(request)))return json(429,{error:'Please take a short pause before trying again.'});
   if(action==='request-verification'){
    if(typeof data.password!=='string'||data.password.length>128)return json(400,{error:'Enter your current password.'});
    const confirmed=await reauthenticate(user.username,data.password);await store.requestVerification(confirmed,recoveryEmail(data.email));
    return json(200,{message:'Check that inbox for a confirmation link. Your recovery address changes only after you confirm it.'});
   }
   if(action==='request-reset'){
    await store.requestReset(recoveryEmail(data.email));await new Promise(resolve=>setTimeout(resolve,Math.max(0,250-(Date.now()-started))));return json(200,{message:neutral});
   }
   if(action==='verify'){await store.verify(data.token);return json(200,{message:'Your recovery email is confirmed. You can return to your account.'});}
   if(data.password!==data.confirmPassword)return json(400,{error:'The new passwords do not match.'});
   await store.reset(data.token,data.password);return json(200,{message:'Your password has been changed and previous sessions have been signed out. Sign in with your new password.'});
  }catch(error){return json(error.expose?error.status||400:503,{error:error.expose?error.message:'Account service is temporarily unavailable. Please try again shortly.'});}
 };
}
