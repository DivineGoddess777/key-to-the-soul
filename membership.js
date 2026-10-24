import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
const scrypt=promisify(scryptCallback),day=86400000;
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const passwordHash=(password,salt)=>scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
export function createMemberStore(filename,clock=Date.now){
 if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
 const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
 db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash BLOB NOT NULL,member_until INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS invitations(code_hash TEXT PRIMARY KEY,days INTEGER NOT NULL,uses_left INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
 function userByName(username){return db.prepare('SELECT * FROM users WHERE username=?').get(String(username).toLowerCase());}
 function publicUser(user){return user?{username:user.username,memberUntil:user.member_until,active:user.member_until>clock()}:null;}
 async function signup(username,password){
  username=String(username??'').trim().toLowerCase();password=String(password??'');
  if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username))throw Error('Use 3–32 letters, numbers, dots, underscores, or hyphens for your username.');
  if(password.length<12||password.length>128)throw Error('Use a password between 12 and 128 characters.');
  const salt=randomBytes(16).toString('hex'),hash=await passwordHash(password,salt);
  try{db.prepare('INSERT INTO users(username,salt,password_hash,created_at) VALUES(?,?,?,?)').run(username,salt,hash,clock());}
  catch(error){if(String(error.message).includes('UNIQUE'))throw Error('That username is unavailable. Try another.');throw error;}
  return userByName(username);
 }
 async function login(username,password){
  const user=userByName(username),salt=user?.salt||'00000000000000000000000000000000';
  const hash=await passwordHash(String(password??'').slice(0,128),salt),expected=user?Buffer.from(user.password_hash):Buffer.alloc(64);
  if(!timingSafeEqual(hash,expected)||!user)throw Error('The username or password does not match.');
  return user;
 }
 function session(user){
  const token=randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(clock());
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),user.id,clock()+7*day);return token;
 }
 function current(token){
  if(!/^[a-f0-9]{64}$/.test(token||''))return null;
  return db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(digest(token),clock())||null;
 }
 function logout(token){if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
 function invite({days=30,uses=1,expiresDays=30}={}){
  if(!Number.isInteger(days)||days<1||days>3660||!Number.isInteger(uses)||uses<1||uses>10000||!Number.isInteger(expiresDays)||expiresDays<1||expiresDays>3660)throw Error('Invalid invitation duration or use count.');
  const code='EMBER-'+randomBytes(18).toString('hex').toUpperCase();
  db.prepare('INSERT INTO invitations(code_hash,days,uses_left,expires_at) VALUES(?,?,?,?)').run(digest(code),days,uses,clock()+expiresDays*day);return code;
 }
 function redeem(user,rawCode){
  const code=String(rawCode??'').trim().toUpperCase();if(code.length>100)throw Error('That invitation is unavailable or has expired.');
  db.exec('BEGIN IMMEDIATE');
  try{
   const entry=db.prepare('SELECT * FROM invitations WHERE code_hash=? AND uses_left>0 AND expires_at>?').get(digest(code),clock());
   if(!entry)throw Error('That invitation is unavailable or has expired.');
   const currentUser=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
   const until=Math.max(clock(),currentUser.member_until)+entry.days*day;
   db.prepare('UPDATE invitations SET uses_left=uses_left-1 WHERE code_hash=?').run(digest(code));
   db.prepare('UPDATE users SET member_until=? WHERE id=?').run(until,user.id);db.exec('COMMIT');return publicUser({...currentUser,member_until:until});
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 function grant(username,days=30){
  if(!Number.isInteger(days)||days<1||days>3660)throw Error('Use 1–3660 days.');
  const user=userByName(username);if(!user)throw Error('Create that member account first.');
  const until=Math.max(clock(),user.member_until)+days*day;
  db.prepare('UPDATE users SET member_until=? WHERE id=?').run(until,user.id);return publicUser({...user,member_until:until});
 }
 function revoke(username){const user=userByName(username);if(!user)throw Error('Unknown member');db.prepare('UPDATE users SET member_until=0 WHERE id=?').run(user.id);return publicUser({...user,member_until:0});}
 return {signup,login,session,current,logout,invite,redeem,grant,revoke,publicUser,close:()=>db.close()};
}
export function createMembershipHandler(store,{origin='http://127.0.0.1:5173',secure=false,clock=Date.now,clientKey=req=>req.socket.remoteAddress||'local'}={}){
 const attempts=new Map(),cookieName='ktts_member';
 const token=req=>String(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 function send(res,status,payload,sessionToken){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(sessionToken!==undefined)headers['Set-Cookie']=cookieName+'='+sessionToken+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+(sessionToken?604800:0)+(secure?'; Secure':'');
  res.writeHead(status,headers);res.end(JSON.stringify(payload));
 }
 function currentUser(req){return store.current(token(req));}
 async function active(req){return Boolean(store.publicUser(await currentUser(req))?.active);}
 async function handle(req,res){
  const url=new URL(req.url,origin);if(!url.pathname.startsWith('/api/members/'))return false;
  if(url.pathname==='/api/members/me'&&req.method==='GET'){send(res,200,{user:store.publicUser(await currentUser(req)),serverTime:clock()});return true;}
  if(req.method!=='POST'){send(res,405,{error:'This action needs a POST request.'});return true;}
  if(req.headers.origin!==origin){send(res,403,{error:'Please use the member form on this site.'});return true;}
  if(!(req.headers['content-type']||'').startsWith('application/json')){send(res,415,{error:'Use the member form on this site.'});return true;}
  const key=clientKey(req),now=clock();
  if(store.consumeAttempt){
   if(!await store.consumeAttempt(key)){send(res,429,{error:'Please take a short pause before trying again.'});return true;}
  }else{
   for(const [ip,record] of attempts)if(record.until<now)attempts.delete(ip);
   const attempt=attempts.get(key)||{count:0,until:now+15*60*1000};
   attempt.count++;attempts.set(key,attempt);
   if(attempt.count>15){send(res,429,{error:'Please take a short pause before trying again.'});return true;}
   if(attempts.size>2000)attempts.delete(attempts.keys().next().value);
  }
  let raw='',body;
  try{
   if(Number(req.headers['content-length']||0)>4096){send(res,413,{error:'That request is too large.'});req.resume();return true;}
   const chunks=[];let bytes=0;for await(const chunk of req){const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>4096)throw Error('Request too large');chunks.push(buffer);}raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
   body=JSON.parse(raw);
   if(!body||Array.isArray(body)||typeof body!=='object')throw Error('Invalid member form');
  }catch{send(res,400,{error:'Please check the member form and try again.'});return true;}
  try{
   if(url.pathname==='/api/members/signup'||url.pathname==='/api/members/login'){
    if(typeof body.username!=='string'||typeof body.password!=='string'||body.password.length>128)throw Error('Please check your username and password.');
    const user=url.pathname.endsWith('/signup')?await store.signup(body.username,body.password):await store.login(body.username,body.password);
    send(res,200,{user:store.publicUser(user)},await store.session(user));
   }else if(url.pathname==='/api/members/logout'){await store.logout(token(req));send(res,200,{user:null},'');}
   else if(url.pathname==='/api/members/redeem'){
    const user=await currentUser(req);if(!user){send(res,401,{error:'Sign in before using an invitation.'});return true;}
    send(res,200,{user:await store.redeem(user,body.code)});
   }else send(res,404,{error:'That member action is unavailable.'});
  }catch(error){send(res,error.status===503?503:400,{error:error.message});}
  return true;
 }
 return {handle,active,currentUser};
}
