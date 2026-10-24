import {randomUUID} from 'node:crypto';
import {applicationPool,databaseConnection} from './postgres-schema.mjs';
import {membershipTerms,subscriptionUUID,planId,subscriptionId,validateSubscription,billingAnchor} from './subscription-core.mjs';
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const uid=id=>/^[1-9][0-9]{0,15}$/.test(String(id));
const record=row=>row?Object.fromEntries(Object.entries(row).map(([key,value])=>[key,(key.endsWith('_at')||['reconciled_through','billing_anchor','lease_until'].includes(key))&&value!==null?Number(value):value])):null;
export function createSubscriptionsStore(pool,{environment,clock=Date.now}={}){
 if(!['sandbox','live'].includes(environment))throw Error('Configure the subscription environment.');
 const one=async(db,sql,args)=>record((await db.query(sql,args)).rows[0]);
 async function transaction(action){const db=await pool.connect();try{await db.query('BEGIN');const result=await action(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
 const get=(id,userId)=>subscriptionUUID(id)&&uid(userId)?one(pool,'SELECT * FROM ktts_subscriptions WHERE id=$1 AND environment=$2 AND user_id=$3',[id,environment,userId]):null;
 const findByPayPal=id=>subscriptionId(id)?one(pool,'SELECT * FROM ktts_subscriptions WHERE paypal_id=$1 AND environment=$2',[id,environment]):null;
 const current=userId=>uid(userId)?one(pool,"SELECT * FROM ktts_subscriptions WHERE user_id=$1 AND environment=$2 ORDER BY CASE WHEN status IN ('CANCELLED','EXPIRED') THEN 1 ELSE 0 END,created_at DESC,id DESC LIMIT 1",[userId,environment]):null;
 async function begin(userId,nonce,plan){
  if(!uid(userId)||!subscriptionUUID(nonce)||!planId(plan))fail('Restart your membership checkout.',400);
  return transaction(async db=>{
   const user=await one(db,'SELECT id FROM ktts_users WHERE id=$1 FOR UPDATE',[userId]);if(!user)fail('Sign in to join.',401);
   const prior=await one(db,"SELECT * FROM ktts_subscriptions WHERE environment=$1 AND user_id=$2 AND (nonce=$3 OR status NOT IN ('CANCELLED','EXPIRED')) ORDER BY created_at DESC LIMIT 1",[environment,userId,nonce]);if(prior)return prior;
   return one(db,"INSERT INTO ktts_subscriptions(id,environment,user_id,nonce,plan_id,terms_version,status,created_at) VALUES($1,$2,$3,$4,$5,$6,'CREATING',$7) RETURNING *",[randomUUID(),environment,userId,nonce,plan,membershipTerms.version,clock()]);
  });
 }
 async function claim(id,userId){
  if(!subscriptionUUID(id)||!uid(userId))fail('Invalid membership reference.',400);
  const token=randomUUID(),row=await one(pool,'UPDATE ktts_subscriptions SET lease_token=$4,lease_until=$5 WHERE id=$1 AND environment=$2 AND user_id=$3 AND lease_until<=$6 RETURNING *',[id,environment,userId,token,clock()+110000,clock()]);
  if(!row)fail('Membership is being checked. Retry shortly.');return {row,token};
 }
 async function bind(id,userId,remote,token){
  return transaction(async db=>{
   const row=await one(db,'SELECT * FROM ktts_subscriptions WHERE id=$1 AND environment=$2 AND user_id=$3 FOR UPDATE',[id,environment,userId]);
   if(!row||row.lease_token!==token||row.paypal_id&&row.paypal_id!==remote.id)fail('Membership checkout changed. Refresh before continuing.');
   validateSubscription(remote,{...row,paypal_id:remote.id});
   return one(db,'UPDATE ktts_subscriptions SET paypal_id=$2,status=$3 WHERE id=$1 RETURNING *',[id,remote.id,remote.status]);
  });
 }
 async function updateRemote(id,userId,remote,token){
  return transaction(async db=>{
   const row=await one(db,'SELECT * FROM ktts_subscriptions WHERE id=$1 AND environment=$2 AND user_id=$3 FOR UPDATE',[id,environment,userId]);
   if(!row||row.lease_token!==token)fail('Membership verification changed. Refresh before continuing.');validateSubscription(remote,row);
   const updated=Date.parse(remote.status_update_time||remote.update_time||remote.create_time),anchor=billingAnchor(remote,row),next=Date.parse(remote.billing_info?.next_billing_time);
   if(!Number.isFinite(updated))fail('The membership update date is unavailable.');
   if(updated<row.provider_updated_at)return row;
   const failed=remote.billing_info?.failed_payments_count||0;if(!Number.isInteger(failed)||failed<0||failed>1000)fail('The billing state is unavailable.');
   return one(db,"UPDATE ktts_subscriptions SET status=$2,provider_updated_at=$3,last_verified_at=$4,billing_anchor=COALESCE($5,billing_anchor),next_billing_at=$6,failed_payments=$7,cancelled_at=CASE WHEN $2='CANCELLED' THEN COALESCE(cancelled_at,$4) ELSE cancelled_at END WHERE id=$1 RETURNING *",[id,remote.status,updated,clock(),Number.isSafeInteger(anchor)?anchor:null,Number.isFinite(next)?next:null,failed]);
  });
 }
 const advance=(id,token,through)=>pool.query('UPDATE ktts_subscriptions SET reconciled_through=GREATEST(reconciled_through,$3) WHERE id=$1 AND environment=$2 AND lease_token=$4',[id,environment,through,token]);
 const cancellationRequested=(id,userId,token)=>pool.query('UPDATE ktts_subscriptions SET cancellation_requested_at=COALESCE(cancellation_requested_at,$4) WHERE id=$1 AND environment=$2 AND user_id=$3 AND lease_token=$5',[id,environment,userId,clock(),token]);
 const release=(id,token)=>pool.query('UPDATE ktts_subscriptions SET lease_token=NULL,lease_until=0 WHERE id=$1 AND environment=$2 AND lease_token=$3',[id,environment,token]);
 const due=async(limit=5)=>(await pool.query("SELECT * FROM ktts_subscriptions WHERE environment=$1 AND paypal_id IS NOT NULL AND lease_until<=$2 AND last_verified_at<$3 AND (status NOT IN ('CANCELLED','EXPIRED') OR created_at>$4) ORDER BY last_verified_at LIMIT $5",[environment,clock(),clock()-6*3600000,clock()-180*86400000,limit])).rows.map(record);
 return {get,current,findByPayPal,begin,claim,bind,updateRemote,advance,cancellationRequested,release,due};
}
export async function connectSubscriptions(connectionString,{environment}={}){
 if(!connectionString)throw Error('Configure subscription storage privately.');const {Pool}=await import('pg');
 const pool=new Pool({connectionString:databaseConnection(connectionString),max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true});pool.on('error',()=>console.error('Subscription storage interrupted.'));
 return {...createSubscriptionsStore(applicationPool(pool),{environment}),close:()=>pool.end()};
}
