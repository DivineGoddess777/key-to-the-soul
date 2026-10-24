import {applicationPool,databaseConnection} from './postgres-schema.mjs';
import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uid=value=>/^[1-9][0-9]{0,15}$/.test(String(value));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail('Check '+label+'.');return value.trim();};
const record=row=>row?Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['created_at','updated_at','started_at','completed_at','period_start','period_end'].includes(key)&&value!==null?Number(value):value])):null;
export function createPersonalReadingsStore(pool,{environment,clock=Date.now}={}){
 if(!['sandbox','live'].includes(environment))throw Error('Configure the reading environment.');
 async function transaction(action){const db=await pool.connect();try{await db.query('BEGIN');const result=await action(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
 async function wallet(db,userId){
  await db.query('INSERT INTO ktts_tarot_wallets(environment,user_id,updated_at) VALUES($1,$2,$3) ON CONFLICT(environment,user_id) DO NOTHING',[environment,userId,clock()]);
  return (await db.query('SELECT * FROM ktts_tarot_wallets WHERE environment=$1 AND user_id=$2 FOR UPDATE',[environment,userId])).rows[0];
 }
 // Internal only: call after a trusted PayPal transaction/plan reconciliation.
 // No HTTP action grants credit or accepts a browser's payment claim.
 async function applyPaidMonth({userId,paymentId,subscriptionId,periodStart,periodEnd,amountCents,currency,refunded=false,paymentTime=null}){
  if(!uid(userId)||!/^[A-Z0-9-]{6,64}$/.test(paymentId||'')||!/^I-[A-Z0-9]{6,40}$/.test(subscriptionId||'')||amountCents!==1111||currency!=='USD'||!Number.isSafeInteger(periodStart)||!Number.isSafeInteger(periodEnd)||periodStart>clock()+300000||periodEnd-periodStart<27*86400000||periodEnd-periodStart>32*86400000)fail('The monthly payment has not been verified.',409);
  return transaction(async db=>{
   const current=await wallet(db,userId),credited=current.balance<15&&!refunded?1:0;
   const inserted=(await db.query('INSERT INTO ktts_tarot_months(environment,payment_id,subscription_id,user_id,period_start,period_end,amount_cents,credited,created_at,refunded_cents,payment_time) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING payment_id',[environment,paymentId,subscriptionId,userId,periodStart,periodEnd,amountCents,credited,clock(),refunded?1111:0,paymentTime])).rows[0];
   if(!inserted){
    const existing=(await db.query('SELECT * FROM ktts_tarot_months WHERE environment=$1 AND (payment_id=$2 OR (subscription_id=$3 AND period_start=$4))',[environment,paymentId,subscriptionId,periodStart])).rows;
    if(existing.length!==1||String(existing[0].user_id)!==String(userId)||existing[0].payment_id!==paymentId||existing[0].subscription_id!==subscriptionId||Number(existing[0].period_start)!==periodStart||Number(existing[0].period_end)!==periodEnd)fail('This payment is already associated with different membership details.',409);
    return {balance:current.balance,credited:0,duplicate:true};
   }
   await db.query('UPDATE ktts_tarot_wallets SET balance=balance+$3,updated_at=$4 WHERE environment=$1 AND user_id=$2',[environment,userId,credited,clock()]);
   if(credited)await db.query("INSERT INTO ktts_reading_credits(environment,payment_id,user_id,state,created_at) VALUES($1,$2,$3,'AVAILABLE',$4)",[environment,paymentId,userId,clock()]);
   if(!refunded)await db.query('UPDATE ktts_users SET paid_member_until=GREATEST(paid_member_until,$2::bigint) WHERE id=$1',[userId,periodEnd]);
   else await db.query("UPDATE ktts_tarot_months SET payment_status='REFUNDED' WHERE environment=$1 AND payment_id=$2",[environment,paymentId]);
   return {balance:current.balance+credited,credited,duplicate:false};
  });
 }
 async function summary(userId){
  if(!uid(userId))fail('Sign in to see your readings.',401);
  const result=await pool.query('SELECT balance FROM ktts_tarot_wallets WHERE environment=$1 AND user_id=$2',[environment,userId]);
  return {credits:result.rows[0]?.balance||0,maxUnusedReadings:15,requests:(await pool.query('SELECT id,contact_email,question,status,response_text,created_at,started_at,completed_at,payment_review FROM ktts_personal_readings WHERE environment=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100',[environment,userId])).rows.map(record)};
 }
 async function request(userId,{nonce,email,question}){
  if(!uid(userId)||!uuid(nonce))fail('Restart your reading request.');
  email=text(email,'your email address',254).toLowerCase();question=text(question,'your reading intention',1500);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Check your email address.');
  return transaction(async db=>{
   const current=await wallet(db,userId);
   const prior=(await db.query('SELECT * FROM ktts_personal_readings WHERE environment=$1 AND user_id=$2 AND nonce=$3',[environment,userId,nonce])).rows[0];
   if(prior){if(prior.contact_email!==email||prior.question!==question)fail('Your request changed. Start a new request.',409);return record(prior);}
   if(current.balance<1)fail('You do not have an unused personal reading credit.',409);
   const funding=(await db.query("SELECT payment_id FROM ktts_reading_credits WHERE environment=$1 AND user_id=$2 AND state='AVAILABLE' ORDER BY created_at,payment_id LIMIT 1 FOR UPDATE",[environment,userId])).rows[0];
   if(!funding)throw Error('Reading credit provenance needs reconciliation.');
   const row=(await db.query("INSERT INTO ktts_personal_readings(id,environment,user_id,nonce,contact_email,question,status,created_at,funding_payment_id) VALUES($1,$2,$3,$4,$5,$6,'REQUESTED',$7,$8) RETURNING *",[randomUUID(),environment,userId,nonce,email,question,clock(),funding.payment_id])).rows[0];
   await db.query("UPDATE ktts_reading_credits SET state='SPENT',request_id=$3 WHERE environment=$1 AND payment_id=$2",[environment,funding.payment_id,row.id]);
   await db.query('UPDATE ktts_tarot_wallets SET balance=balance-1,updated_at=$3 WHERE environment=$1 AND user_id=$2',[environment,userId,clock()]);return record(row);
  });
 }
 const queue=async()=> (await pool.query('SELECT r.id,u.username,r.contact_email,r.question,r.status,r.response_text,r.created_at,r.started_at,r.completed_at,r.payment_review FROM ktts_personal_readings r JOIN ktts_users u ON u.id=r.user_id WHERE r.environment=$1 ORDER BY CASE WHEN r.status=\'READY\' THEN 1 ELSE 0 END,r.created_at LIMIT 100',[environment])).rows.map(record);
 async function deliver(id,{responseText}){
  if(!uuid(id))fail('Invalid reading reference.');responseText=text(responseText,'the personal reading',12000);
  return transaction(async db=>{
   const row=(await db.query('SELECT * FROM ktts_personal_readings WHERE id=$1 AND environment=$2 FOR UPDATE',[id,environment])).rows[0];
   if(!row)fail('Reading not found.',404);
   if(row.payment_review&&row.status!=='READY')fail('This reading needs payment review before delivery.',409);
   if(row.status==='READY'){if(row.response_text!==responseText)fail('This reading has already been delivered.',409);return record(row);}
   return record((await db.query("UPDATE ktts_personal_readings SET status='READY',response_text=$3,completed_at=$4 WHERE id=$1 AND environment=$2 RETURNING *",[id,environment,responseText,clock()])).rows[0]);
  });
 }
 async function start(id){
  if(!uuid(id))fail('Invalid reading reference.');
  const result=await pool.query("UPDATE ktts_personal_readings SET status='IN_PROGRESS',started_at=COALESCE(started_at,$3) WHERE id=$1 AND environment=$2 AND payment_review=FALSE AND status IN ('REQUESTED','IN_PROGRESS') RETURNING *",[id,environment,clock()]);
  if(!result.rows[0])fail('This reading is unavailable or already delivered.',409);return record(result.rows[0]);
 }
 async function voidPaidMonth({userId,paymentId,subscriptionId,refundedCents=1111,reversed=false}){
  if(!uid(userId)||!/^[A-Z0-9]{6,40}$/.test(paymentId||'')||!/^I-[A-Z0-9]{6,40}$/.test(subscriptionId||'')||!Number.isInteger(refundedCents)||refundedCents<1||refundedCents>1111)fail('The payment adjustment has not been verified.',409);
  return transaction(async db=>{
   await wallet(db,userId);
   const month=(await db.query('SELECT * FROM ktts_tarot_months WHERE environment=$1 AND payment_id=$2 FOR UPDATE',[environment,paymentId])).rows[0];
   if(!month)return {missing:true};
   if(String(month.user_id)!==String(userId)||month.subscription_id!==subscriptionId)fail('This payment belongs to a different membership.',409);
   const full=reversed||refundedCents===1111;
   await db.query('UPDATE ktts_tarot_months SET refunded_cents=GREATEST(refunded_cents,$3),reversed_at=CASE WHEN $4 THEN COALESCE(reversed_at,$5) ELSE reversed_at END WHERE environment=$1 AND payment_id=$2',[environment,paymentId,refundedCents,reversed,clock()]);
   await db.query('UPDATE ktts_tarot_months SET payment_status=$3 WHERE environment=$1 AND payment_id=$2',[environment,paymentId,reversed||month.reversed_at?'REVERSED':full?'REFUNDED':'PARTIALLY_REFUNDED']);
   if(full){
    const removed=await db.query("UPDATE ktts_reading_credits SET state='VOID' WHERE environment=$1 AND payment_id=$2 AND state='AVAILABLE' RETURNING payment_id",[environment,paymentId]);
    if(removed.rows.length)await db.query('UPDATE ktts_tarot_wallets SET balance=balance-1,updated_at=$3 WHERE environment=$1 AND user_id=$2',[environment,userId,clock()]);
    await db.query('UPDATE ktts_personal_readings SET payment_review=TRUE WHERE environment=$1 AND user_id=$2 AND funding_payment_id=$3',[environment,userId,paymentId]);
    await db.query('UPDATE ktts_users SET paid_member_until=COALESCE((SELECT MAX(period_end) FROM ktts_tarot_months WHERE environment=$1 AND user_id=$2 AND refunded_cents<amount_cents AND reversed_at IS NULL),0) WHERE id=$2',[environment,userId]);
   }
   return {adjusted:true,full};
  });
 }
 const payment=async id=>record((await pool.query('SELECT * FROM ktts_tarot_months WHERE environment=$1 AND payment_id=$2',[environment,id])).rows[0]);
 const markPartialRefund=async({userId,paymentId,subscriptionId})=>pool.query("UPDATE ktts_tarot_months SET payment_status='PARTIALLY_REFUNDED' WHERE environment=$1 AND payment_id=$2 AND user_id=$3 AND subscription_id=$4 AND payment_status='COMPLETED'",[environment,paymentId,userId,subscriptionId]);
 return {applyPaidMonth,voidPaidMonth,markPartialRefund,payment,summary,request,queue,deliver,start};
}
export async function connectPersonalReadings(connectionString,{environment}={}){
 if(!connectionString)throw Error('Configure reading storage privately.');const {Pool}=await import('pg');
 const pool=new Pool({connectionString:databaseConnection(connectionString),max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true});pool.on('error',()=>console.error('Personal reading storage interrupted.'));
 return {...createPersonalReadingsStore(applicationPool(pool),{environment}),close:()=>pool.end()};
}
