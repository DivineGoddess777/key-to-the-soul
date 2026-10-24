import {applicationPool,databaseConnection} from './postgres-schema.mjs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {digest,passwordHash} from '../membership.js';
const day=86400000;
const input=message=>Object.assign(Error(message),{expose:true});
const normalize=user=>user?{...user,member_until:Number(user.member_until),created_at:Number(user.created_at)}:null;
export function createPostgresMemberStore(pool,clock=Date.now){
 const one=async(sql,args)=>normalize((await pool.query(sql,args)).rows[0]);
 const publicUser=user=>{if(!user)return null;const until=Math.max(Number(user.member_until),Number(user.paid_member_until||0));return {username:user.username,memberUntil:until,active:until>clock()};};
 async function signup(username,password){
  username=String(username??'').trim().toLowerCase();password=String(password??'');
  if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username))throw input('Use 3–32 letters, numbers, dots, underscores, or hyphens for your username.');
  if(password.length<12||password.length>128)throw input('Use a password between 12 and 128 characters.');
  const salt=randomBytes(16).toString('hex'),hash=await passwordHash(password,salt);
  try{return await one('INSERT INTO ktts_users(username,salt,password_hash,created_at) VALUES($1,$2,$3,$4) RETURNING *',[username,salt,hash,clock()]);}
  catch(error){if(error.code==='23505')throw input('That username is unavailable. Try another.');throw error;}
 }
 async function login(username,password){
  const user=await one('SELECT * FROM ktts_users WHERE username=$1',[String(username??'').trim().toLowerCase()]);
  const hash=await passwordHash(String(password??'').slice(0,128),user?.salt||'00000000000000000000000000000000');
  if(!timingSafeEqual(hash,user?Buffer.from(user.password_hash):Buffer.alloc(64))||!user)throw input('The username or password does not match.');
  return user;
 }
 async function session(user){
  const token=randomBytes(32).toString('hex');
  const result=await pool.query('WITH verified AS (SELECT id FROM ktts_users WHERE id=$3 AND salt=$4 AND password_hash=$5 FOR UPDATE) INSERT INTO ktts_sessions(token_hash,user_id,expires_at) SELECT $1,id,$2 FROM verified RETURNING token_hash',[digest(token),clock()+7*day,user.id,user.salt,Buffer.from(user.password_hash)]);
  if(!result.rows.length)throw input('Your password changed. Sign in again.');return token;
 }
 async function current(token){
  if(!/^[a-f0-9]{64}$/.test(token||''))return null;
  return one('SELECT u.* FROM ktts_sessions s JOIN ktts_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2',[digest(token),clock()]);
 }
 async function logout(token){if(token)await pool.query('DELETE FROM ktts_sessions WHERE token_hash=$1',[digest(token)]);}
 async function invite({days=30,uses=1,expiresDays=30}={}){
  if(!Number.isInteger(days)||days<1||days>3660||!Number.isInteger(uses)||uses<1||uses>10000||!Number.isInteger(expiresDays)||expiresDays<1||expiresDays>3660)throw input('Invalid invitation duration or use count.');
  const code='EMBER-'+randomBytes(18).toString('hex').toUpperCase();
  await pool.query('INSERT INTO ktts_invitations(code_hash,days,uses_left,expires_at) VALUES($1,$2,$3,$4)',[digest(code),days,uses,clock()+expiresDays*day]);return code;
 }
 async function redeem(user,rawCode){
  const code=String(rawCode??'').trim().toUpperCase();
  if(code.length>100)throw input('That invitation is unavailable or has expired.');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   // Lock the invitation across every function instance; one use cannot be redeemed twice.
   const entry=(await client.query('SELECT * FROM ktts_invitations WHERE code_hash=$1 AND uses_left>0 AND expires_at>$2 FOR UPDATE',[digest(code),clock()])).rows[0];
   if(!entry)throw input('That invitation is unavailable or has expired.');
   const updated=normalize((await client.query('UPDATE ktts_users SET member_until=GREATEST(member_until,paid_member_until,$1::bigint)+$2::bigint WHERE id=$3 RETURNING *',[clock(),entry.days*day,user.id])).rows[0]);
   if(!updated)throw input('Sign in again before using an invitation.');
   await client.query('UPDATE ktts_invitations SET uses_left=uses_left-1 WHERE code_hash=$1',[digest(code)]);
   await client.query('COMMIT');return publicUser(updated);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async function grant(username,days=30){
  if(!Number.isInteger(days)||days<1||days>3660)throw input('Use 1–3660 days.');
  const user=await one('UPDATE ktts_users SET member_until=GREATEST(member_until,paid_member_until,$1::bigint)+$2::bigint WHERE username=$3 RETURNING *',[clock(),days*day,String(username).toLowerCase()]);
  if(!user)throw input('Create that member account first.');return publicUser(user);
 }
 async function revoke(username){
  const user=await one('UPDATE ktts_users SET member_until=0,paid_member_until=0 WHERE username=$1 RETURNING *',[String(username).toLowerCase()]);
  if(!user)throw input('Unknown member');return publicUser(user);
 }
 async function consumeAttempt(key){
  const now=clock(),row=(await pool.query(`INSERT INTO ktts_auth_attempts(bucket_key,attempts,until_ms) VALUES($1,1,$2)
   ON CONFLICT(bucket_key) DO UPDATE SET
   attempts=CASE WHEN ktts_auth_attempts.until_ms<=$3 THEN 1 ELSE ktts_auth_attempts.attempts+1 END,
   until_ms=CASE WHEN ktts_auth_attempts.until_ms<=$3 THEN $2 ELSE ktts_auth_attempts.until_ms END
   RETURNING attempts`,[digest('member:'+key),now+15*60*1000,now])).rows[0];
  return row.attempts<=15;
 }
 async function cleanup(){
  await pool.query('DELETE FROM ktts_sessions WHERE expires_at<=$1',[clock()]);
  await pool.query('DELETE FROM ktts_auth_attempts WHERE until_ms<=$1',[clock()]);
  await pool.query('DELETE FROM ktts_invitations WHERE expires_at<=$1 OR uses_left=0',[clock()]);
 }
 // Database failures must never expose credentials, SQL, or internal connection details.
 const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(error){if(error.expose)throw error;throw Object.assign(Error('Member service is temporarily unavailable. Please try again shortly.'),{status:503});}};
 return {signup:safe(signup),login:safe(login),session:safe(session),current:safe(current),logout:safe(logout),invite:safe(invite),redeem:safe(redeem),grant:safe(grant),revoke:safe(revoke),consumeAttempt:safe(consumeAttempt),cleanup:safe(cleanup),publicUser,close:()=>pool.end()};
}
export async function connectPostgresMembers(connectionString=process.env.DATABASE_URL){
 if(!connectionString)throw Error('A durable DATABASE_URL is required for Vercel accounts.');
 const {Pool}=await import('pg');
 const pool=new Pool({connectionString:databaseConnection(connectionString),max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
 pool.on('error',()=>console.error('The member database connection was interrupted.'));
 return createPostgresMemberStore(applicationPool(pool));
}
