import {applicationPool,databaseConnection} from './postgres-schema.mjs';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const normalize=row=>row?{...row,total_cents:Number(row.total_cents),created_at:Number(row.created_at)}:null;
export function createPostgresSandboxOrders(pool,clock=Date.now){
 const query=(sql,args)=>pool.query(sql,args);
 const one=async(sql,args)=>normalize((await query(sql,args)).rows[0]);
 async function reserve(record){
  await query('INSERT INTO ktts_sandbox_orders(local_id,session_hash,cart_hash,total_cents,items_json,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(local_id) DO NOTHING',[record.local_id,record.session_hash,record.cart_hash,record.total_cents,record.items_json,'CREATING',record.created_at]);
  return one('SELECT * FROM ktts_sandbox_orders WHERE local_id=$1',[record.local_id]);
 }
 const getByPayment=(id,sessionHash)=>one('SELECT * FROM ktts_sandbox_orders WHERE paypal_id=$1 AND session_hash=$2',[id,sessionHash]);
 async function claim(id,kind,token){
  const condition=kind==='create'?'paypal_id IS NULL':"paypal_id IS NOT NULL AND status<>'COMPLETED'";
  return Boolean(await one('UPDATE ktts_sandbox_orders SET lease_token=$1,lease_until=$2 WHERE local_id=$3 AND lease_until<=$4 AND '+condition+' RETURNING *',[token,clock()+90000,id,clock()]));
 }
 async function created(id,paypalId,lease){
  return Boolean(await one("UPDATE ktts_sandbox_orders SET paypal_id=$1,status='CREATED',lease_token=NULL,lease_until=0 WHERE local_id=$2 AND lease_token=$3 RETURNING *",[paypalId,id,lease]));
 }
 async function completed(id,captureId,lease){
  return Boolean(await one("UPDATE ktts_sandbox_orders SET status='COMPLETED',capture_id=$1,lease_token=NULL,lease_until=0 WHERE local_id=$2 AND lease_token=$3 RETURNING *",[captureId,id,lease]));
 }
 const release=(id,lease)=>query('UPDATE ktts_sandbox_orders SET lease_token=NULL,lease_until=0 WHERE local_id=$1 AND lease_token=$2',[id,lease]);
 async function consumeAttempt(key){
  const now=clock(),row=(await query(`INSERT INTO ktts_auth_attempts(bucket_key,attempts,until_ms) VALUES($1,1,$2)
   ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN ktts_auth_attempts.until_ms<=$3 THEN 1 ELSE ktts_auth_attempts.attempts+1 END,
   until_ms=CASE WHEN ktts_auth_attempts.until_ms<=$3 THEN $2 ELSE ktts_auth_attempts.until_ms END RETURNING attempts`,[hash('paypal:'+key),now+60000,now])).rows[0];
  return row.attempts<=20;
 }
 const safe=fn=>async(...args)=>{try{return await fn(...args);}catch{throw Object.assign(Error('The sandbox test store is temporarily unavailable.'),{status:503});}};
 return {reserve:safe(reserve),getByPayment:safe(getByPayment),claim:safe(claim),created:safe(created),completed:safe(completed),release:safe(release),consumeAttempt:safe(consumeAttempt),close:()=>pool.end()};
}
export async function connectSandboxOrders(connectionString=process.env.DATABASE_URL){
 if(!connectionString)throw Error('A durable database connection is required.');
 const {Pool}=await import('pg');
 const pool=new Pool({connectionString:databaseConnection(connectionString),max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
 pool.on('error',()=>console.error('The sandbox database connection was interrupted.'));
 return createPostgresSandboxOrders(applicationPool(pool));
}
