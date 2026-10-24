const unavailable=()=>Object.assign(Error('PayPal is temporarily unavailable. Check your saved payment before trying again.'),{status:502});
export function createPaypalClient({mode,clientId,secret,request=fetch}){
 if(!['sandbox','live'].includes(mode)||!clientId||!secret)throw Error('Configure PayPal privately.');
 const base=mode==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';
 let cached,until=0,pending;
 async function token(){
  if(cached&&until>Date.now()+60000)return cached;
  if(!pending)pending=(async()=>{
   const response=await request(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(clientId+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw unavailable();const data=await response.json();
   if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_in))throw unavailable();
   cached=data.access_token;until=Date.now()+data.expires_in*1000;return cached;
  })().finally(()=>pending=undefined);
  return pending;
 }
 return async(path,{method='GET',body,id}={})=>{
  if(typeof path!=='string'||!/^\/v[12]\/[a-z]/.test(path)||path.includes('..')||path.includes('#'))throw Error('Invalid internal PayPal path.');
  const response=await request(base+path,{method,headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json',Prefer:'return=representation',...(id?{'PayPal-Request-Id':id}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw unavailable();return response.status===204?null:response.json();
 };
}
