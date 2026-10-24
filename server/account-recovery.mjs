import {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHmac} from 'node:crypto';
import {digest,passwordHash} from '../membership.js';
import {applicationPool,databaseConnection} from './postgres-schema.mjs';
const lifetime=30*60000;
const failure=(message,status=400)=>Object.assign(Error(message),{status,expose:true});
const badLink=()=>failure('This link has expired or was already used. Request a fresh one.');
export function recoveryEmail(value){
 if(typeof value!=='string'||value.length>254)throw failure('Enter a valid email address.');
 const email=value.trim().toLowerCase();
 if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)||email.split('@')[0].length>64)throw failure('Enter a valid email address.');
 return email;
}
const marker=user=>digest(user.salt+':'+Buffer.from(user.password_hash).toString('hex'));
const tokenValid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function cipherKey(secret){if(!/^[a-f0-9]{64,128}$/.test(secret||''))throw Error('Account recovery is not configured.');return createHmac('sha256',Buffer.from(secret,'hex')).update('ktts-account-mail:v1').digest();}
export function sealAccountMail(payload,secret,environment){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cipherKey(secret),iv);cipher.setAAD(Buffer.from(environment));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function openAccountMail(value,secret,environment){
 const bytes=Buffer.from(value,'base64url');if(bytes.length<29)throw Error('Invalid account mail.');
 const cipher=createDecipheriv('aes-256-gcm',cipherKey(secret),bytes.subarray(0,12));cipher.setAAD(Buffer.from(environment));cipher.setAuthTag(bytes.subarray(12,28));
 return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));
}
export function createRecoveryStore(pool,{environment,secret,clock=Date.now}={}){
 if(!['sandbox','live'].includes(environment))throw Error('Configure the account environment.');cipherKey(secret);
 async function transaction(fn){const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
 async function queue(db,email,payload,challengeHash=null,expiresAt=clock()+86400000){
  await db.query('INSERT INTO ktts_account_mail(id,environment,recipient,encrypted_payload,challenge_hash,created_at,expires_at,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$7,$6)',[randomUUID(),environment,email,sealAccountMail(payload,secret,environment),challengeHash,clock(),expiresAt]);
 }
 async function challenge(db,user,purpose,email){
  const token=randomBytes(32).toString('hex'),hash=digest(token);
  await db.query('DELETE FROM ktts_account_challenges WHERE user_id=$1 AND environment=$2 AND purpose=$3',[user.id,environment,purpose]);
  await db.query('INSERT INTO ktts_account_challenges(token_hash,user_id,environment,purpose,email,password_marker,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[hash,user.id,environment,purpose,email,marker(user),clock(),clock()+lifetime]);
  await queue(db,email,{kind:purpose,username:user.username,token},hash,clock()+lifetime);
 }
 async function consumeAttempt(key,limit=15){
  const now=clock(),row=(await pool.query(`INSERT INTO ktts_auth_attempts(bucket_key,attempts,until_ms) VALUES($1,1,$2)
   ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN ktts_auth_attempts.until_ms<=$3 THEN 1 ELSE ktts_auth_attempts.attempts+1 END,until_ms=CASE WHEN ktts_auth_attempts.until_ms<=$3 THEN $2 ELSE ktts_auth_attempts.until_ms END RETURNING attempts`,[digest('account:'+environment+':'+key),now+15*60000,now])).rows[0];return row.attempts<=limit;
 }
 async function status(userId){const row=(await pool.query('SELECT recovery_email FROM ktts_users WHERE id=$1',[userId])).rows[0];return {email:row?.recovery_email||null,verified:Boolean(row?.recovery_email)};}
 async function requestVerification(authenticated,email){
  email=recoveryEmail(email);
  if(!await consumeAttempt('verify-user:'+authenticated.id,3))throw failure('Please wait 15 minutes before requesting another verification email.',429);
  return transaction(async db=>{
   const user=(await db.query('SELECT * FROM ktts_users WHERE id=$1 FOR UPDATE',[authenticated.id])).rows[0];
   if(!user||marker(user)!==marker(authenticated))throw failure('Sign in again before changing your recovery email.',401);
   if(user.recovery_email===email)return;
   const conflict=(await db.query('SELECT id FROM ktts_users WHERE recovery_email=$1',[email])).rows[0];
   if(conflict)return; // The response must not expose another account's email address.
   await challenge(db,user,'VERIFY',email);
  });
 }
 async function requestReset(email){
  email=recoveryEmail(email);
  if(!await consumeAttempt('reset-email:'+email,3))return;
  return transaction(async db=>{
   const user=(await db.query('SELECT * FROM ktts_users WHERE recovery_email=$1 FOR UPDATE',[email])).rows[0];
   if(user)await challenge(db,user,'RESET',email);
  });
 }
 async function consume(raw,purpose,password){
  if(!tokenValid(raw))throw badLink();
  let salt,hash;
  if(purpose==='RESET'){
   if(typeof password!=='string'||password.length<12||password.length>128)throw failure('Use a password between 12 and 128 characters.');
   salt=randomBytes(16).toString('hex');hash=await passwordHash(password,salt);
  }
  return transaction(async db=>{
   const lookup=(await db.query('SELECT user_id FROM ktts_account_challenges WHERE token_hash=$1 AND environment=$2',[digest(raw),environment])).rows[0];if(!lookup)throw badLink();
   const user=(await db.query('SELECT * FROM ktts_users WHERE id=$1 FOR UPDATE',[lookup.user_id])).rows[0];
   const entry=(await db.query('SELECT * FROM ktts_account_challenges WHERE token_hash=$1 AND environment=$2',[digest(raw),environment])).rows[0];
   if(!user||!entry||entry.purpose!==purpose||Number(entry.expires_at)<=clock()||entry.password_marker!==marker(user))throw badLink();
   if(purpose==='VERIFY'){
    try{await db.query('UPDATE ktts_users SET recovery_email=$1 WHERE id=$2',[entry.email,user.id]);}catch(error){if(error.code==='23505')throw badLink();throw error;}
    if(user.recovery_email&&user.recovery_email!==entry.email)await queue(db,user.recovery_email,{kind:'EMAIL_CHANGED',username:user.username});
    await db.query('DELETE FROM ktts_account_challenges WHERE user_id=$1 AND environment=$2',[user.id,environment]);
   }else{
    if(user.recovery_email!==entry.email)throw badLink();
    await db.query('UPDATE ktts_users SET salt=$1,password_hash=$2 WHERE id=$3',[salt,hash,user.id]);
    await db.query('DELETE FROM ktts_sessions WHERE user_id=$1',[user.id]);
    await db.query('DELETE FROM ktts_account_challenges WHERE user_id=$1 AND environment=$2',[user.id,environment]);
    await queue(db,user.recovery_email,{kind:'PASSWORD_CHANGED',username:user.username});
   }
  });
 }
 async function claimMail(){
  const now=clock();
  await pool.query("UPDATE ktts_account_mail SET state='EXPIRED',encrypted_payload='' WHERE environment=$1 AND state='QUEUED' AND lease_until<=$2 AND (expires_at<=$2 OR challenge_hash IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ktts_account_challenges c WHERE c.token_hash=ktts_account_mail.challenge_hash AND c.environment=$1 AND c.expires_at>$2))",[environment,now]);
  return (await pool.query("UPDATE ktts_account_mail SET lease_token=$3,lease_until=$4,attempts=attempts+1 WHERE id=(SELECT id FROM ktts_account_mail WHERE environment=$1 AND state='QUEUED' AND attempts<5 AND next_attempt_at<=$2 AND expires_at>$2 AND lease_until<=$2 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",[environment,now,randomUUID(),now+120000])).rows[0]||null;
 }
 const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(error){if(error.expose)throw error;throw failure('Account service is temporarily unavailable. Please try again shortly.',503);}};
 return {status:safe(status),consumeAttempt:safe(consumeAttempt),requestVerification:safe(requestVerification),requestReset:safe(requestReset),verify:safe(token=>consume(token,'VERIFY')),reset:safe((token,password)=>consume(token,'RESET',password)),claimMail:safe(claimMail),finishMail:safe((id,lease)=>pool.query("UPDATE ktts_account_mail SET state='SENT',sent_at=$4,lease_token=NULL,lease_until=0,encrypted_payload='' WHERE id=$1 AND environment=$2 AND lease_token=$3",[id,environment,lease,clock()])),retryMail:safe((id,lease,attempts)=>pool.query('UPDATE ktts_account_mail SET lease_token=NULL,lease_until=0,next_attempt_at=$4 WHERE id=$1 AND environment=$2 AND lease_token=$3',[id,environment,lease,clock()+60000*2**Math.min(attempts,5)])),close:()=>pool.end()};
}
export async function connectRecovery(connectionString,options){const {Pool}=await import('pg');const pool=new Pool({connectionString:databaseConnection(connectionString),max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true});pool.on('error',()=>console.error('Account storage interrupted.'));return createRecoveryStore(applicationPool(pool),options);}
const htmlEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderAccountMail(job,{origin,secret}){
 const url=new URL(origin);if(url.origin!==origin||url.protocol!=='https:'&&url.hostname!=='127.0.0.1')throw Error('Use the configured account origin.');
 const data=openAccountMail(job.encrypted_payload,secret,job.environment),titles={VERIFY:'Confirm your recovery email',RESET:'Reset your password',PASSWORD_CHANGED:'Your password was changed',EMAIL_CHANGED:'Your recovery email was changed'};
 const title=titles[data.kind];if(!title||!data.username||['VERIFY','RESET'].includes(data.kind)&&!tokenValid(data.token))throw Error('Invalid account mail.');
 const link=data.token?origin+'/account.html#'+(data.kind==='VERIFY'?'verify':'reset')+'='+data.token:null;
 const instruction=link?'Use the button below within 30 minutes. This link works once.':'If you did not make this change, contact support@keytothesoul.com.';
 const test=job.environment==='sandbox'?'[Sandbox test] ':'';
 const text=test+title+'\nKey to the Soul · '+data.username+'\n\n'+instruction+(link?'\n'+link:'')+'\n\nIf you did not request this email, do not use its link. Contact support@keytothesoul.com if you need help.';
 return {from:{name:'Key to the Soul',address:'support@keytothesoul.com'},replyTo:'support@keytothesoul.com',to:{address:job.recipient},subject:test+'Key to the Soul · '+title,text,html:'<div style="background:#151016;color:#efe3d6;padding:32px;font-family:Georgia,serif;max-width:580px;margin:auto"><p style="color:#c18b60;letter-spacing:3px">KEY TO THE SOUL</p><h1 style="font-weight:400">'+htmlEscape(test+title)+'</h1><p>'+htmlEscape(data.username)+'</p><p>'+instruction+'</p>'+(link?'<p><a style="display:inline-block;background:#c18b60;color:#151016;padding:16px 22px" href="'+htmlEscape(link)+'">'+htmlEscape(title)+' ↗</a></p>':'')+'<p>If you did not request this email, do not use its link. Contact support@keytothesoul.com if you need help.</p></div>',messageId:'<account-'+job.id+'@keytothesoul.com>'};
}
export async function dispatchAccountMail({store,mailer,origin,secret,limit=2}){let sent=0,failed=0;for(let i=0;i<limit;i++){const job=await store.claimMail();if(!job)break;try{await mailer.send(renderAccountMail(job,{origin,secret}));await store.finishMail(job.id,job.lease_token);sent++;}catch{await store.retryMail(job.id,job.lease_token,job.attempts);failed++;}}return {sent,failed};}
