import {randomUUID} from 'node:crypto';
import {applicationPool,databaseConnection} from './postgres-schema.mjs';
import {renderStoreMail} from './store-mail.mjs';
export async function enqueueOrderMail(db,order,type,eventKey,now){
 await db.query("INSERT INTO ktts_mail_outbox(environment,event_key,message_type,recipient,payload_json,created_at,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(environment,event_key) DO NOTHING",[order.environment,eventKey,type,order.customer_json.email,JSON.stringify({id:order.id,status:order.status,paymentStatus:order.payment_status,refundedCents:order.refunded_cents,quote:order.quote_json,fulfillment:order.fulfillment_json}),now]);
}
export function createMailOutbox(pool,{environment,clock=Date.now}={}){
 if(!['sandbox','live'].includes(environment))throw Error('Configure the email environment.');
 return {
  async claim(){
   const token=randomUUID();const row=(await pool.query("UPDATE ktts_mail_outbox SET lease_token=$3,lease_until=$4,attempts=attempts+1 WHERE id=(SELECT id FROM ktts_mail_outbox WHERE environment=$1 AND sent_at IS NULL AND attempts<8 AND next_attempt_at<=$2 AND lease_until<=$2 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",[environment,clock(),token,clock()+120000])).rows[0];return row||null;
  },
  finish:(id,token)=>pool.query('UPDATE ktts_mail_outbox SET sent_at=$4,lease_token=NULL,lease_until=0 WHERE id=$1 AND environment=$2 AND lease_token=$3',[id,environment,token,clock()]),
  retry:(id,token,attempts)=>pool.query("UPDATE ktts_mail_outbox SET lease_token=NULL,lease_until=0,next_attempt_at=$4,last_error='Email delivery failed; retry pending.' WHERE id=$1 AND environment=$2 AND lease_token=$3",[id,environment,token,clock()+Math.min(6*3600000,60000*2**Math.min(attempts,9))]),
  status:async()=> (await pool.query('SELECT COUNT(*) FILTER(WHERE sent_at IS NULL)::int AS pending,COUNT(*) FILTER(WHERE sent_at IS NULL AND attempts>=8)::int AS needs_review FROM ktts_mail_outbox WHERE environment=$1',[environment])).rows[0]
 };
}
export async function dispatchStoreMail({outbox,mailer,origin,secret,limit=3}){
 let sent=0,failed=0;
 for(let count=0;count<limit;count++){
  const job=await outbox.claim();if(!job)break;
  try{await mailer.send(renderStoreMail(job,{origin,secret}));await outbox.finish(job.id,job.lease_token);sent++;}
  catch{await outbox.retry(job.id,job.lease_token,job.attempts);failed++;}
 }
 return {sent,failed};
}
export async function connectMailOutbox(connectionString,{environment}={}){
 const {Pool}=await import('pg');const pool=new Pool({connectionString:databaseConnection(connectionString),max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true});pool.on('error',()=>console.error('Receipt outbox storage interrupted.'));
 return {...createMailOutbox(applicationPool(pool),{environment}),close:()=>pool.end()};
}
