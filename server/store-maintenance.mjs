import {timingSafeEqual} from 'node:crypto';
const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export function createStoreMaintenance({secret,getSubscriptions,getMail,getOrders,subscriptionEnabled=false,emailEnabled=false}){
 return async request=>{
  if(request.method!=='GET')return json(405,{error:'Use GET.'});
  const provided=request.headers.get('authorization')||'',expected='Bearer '+secret;
  if(!/^[a-f0-9]{64}$/.test(secret||'')||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return json(401,{error:'Not authorized.'});
  const started=Date.now();let membershipChecked=0,membershipFailed=0,sent=0,mailFailed=0,reservationsExpired=0,reservationCleanupFailed=0;
  try{
   if(emailEnabled){const mail=await getMail();try{const result=await mail.dispatch();sent=result.sent;mailFailed=result.failed;}finally{mail.close();}}
   if(subscriptionEnabled){const {store,reconciler}=await getSubscriptions();const due=await store.due(5);
    for(const row of due){if(Date.now()-started>170000)break;try{await reconciler.sync(row.id,row.user_id);membershipChecked++;}catch{membershipFailed++;}}
   }
   if(getOrders){try{reservationsExpired=await (await getOrders()).expireReservations(100);}catch{reservationCleanupFailed=1;}}
   return json(200,{membershipChecked,membershipFailed,sent,mailFailed,reservationsExpired,reservationCleanupFailed});
  }catch{return json(503,{error:'Store maintenance will retry. No new charge was initiated.'});}
 };
}
