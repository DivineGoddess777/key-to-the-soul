import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createPostgresMemberStore} from '../server/membership-postgres.mjs';
import {applicationPool} from '../server/postgres-schema.mjs';
async function setup(clock=Date.now){
 const db=new PGlite();await db.exec(await readFile(new URL('../server/members-schema.sql',import.meta.url),'utf8'));
 // PGlite is one PostgreSQL connection; serialize whole test transactions on that connection.
 let last=Promise.resolve();const statements=[];
 const query=(sql,args)=>{statements.push(sql);return db.query(sql,args);};
 const pool=applicationPool({query,async connect(){let release;const turn=new Promise(resolve=>release=resolve),previous=last;last=turn;await previous;return {query,release};},end:()=>db.close()});
 return {store:createPostgresMemberStore(pool,clock),db,statements,pool};
}
test('Postgres persists our own hashed accounts, session expiry, grants and revocations',async()=>{
 let now=1700000000000;const {store,db}=await setup(()=>now);
 try{
  const user=await store.signup('Moon.Reader','a sufficiently long test password');
  assert.equal(user.username,'moon.reader');assert.equal(Buffer.from(user.password_hash).length,64);
  await assert.rejects(store.signup('MOON.READER','another long test password'),/unavailable/);
  await assert.rejects(store.login('moon.reader','wrong password'),/does not match/);
  await assert.rejects(store.login('missing','wrong password'),/does not match/);
  const signed=await store.login('Moon.Reader','a sufficiently long test password'),token=await store.session(signed);
  assert.equal(store.publicUser(await store.current(token)).active,false);
  assert.equal((await db.query('SELECT token_hash FROM ktts_sessions')).rows[0].token_hash===token,false);
  const code=await store.invite({days:1,uses:1,expiresDays:1});
  assert.equal((await store.redeem(signed,code)).active,true);
  await assert.rejects(store.redeem(signed,code),/unavailable/);
  now+=86400001;assert.equal(store.publicUser(await store.current(token)).active,false);
  await store.grant('moon.reader',1);assert.equal(store.publicUser(await store.current(token)).active,true);
  await store.revoke('moon.reader');assert.equal(store.publicUser(await store.current(token)).active,false);
  await store.logout(token);assert.equal(await store.current(token),null);
  const expiring=await store.session(signed);now+=7*86400000+1;assert.equal(await store.current(expiring),null);
  await store.cleanup();assert.equal((await db.query('SELECT * FROM ktts_sessions')).rows.length,0);
 }finally{await store.close();}
});
test('single-use invitations are transactional and auth limits are shared across store instances',async()=>{
 let now=1700000000000;const {store,pool,statements}=await setup(()=>now),other=createPostgresMemberStore(pool,()=>now);
 try{
  const user=await store.signup('test_reader','a sufficiently long test password');
  const code=await store.invite({days:2,uses:1});
  const results=await Promise.allSettled([store.redeem(user,code),other.redeem(user,code)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.ok(statements.some(sql=>sql.includes('FOR UPDATE')));
  assert.ok(statements.includes('ROLLBACK'));
  assert.equal((await store.grant('test_reader',1)).memberUntil,now+3*86400000);
  const results2=await Promise.all(Array.from({length:30},(_,i)=>(i%2?store:other).consumeAttempt('shared-test-ip')));
  assert.equal(results2.filter(Boolean).length,15);
  now+=15*60*1000;assert.equal(await other.consumeAttempt('shared-test-ip'),true);
  await assert.rejects(store.invite({days:0}),/Invalid/);
 }finally{await store.close();}
});
test('database errors never expose internal details',async()=>{
 const pool={query:async()=>{throw Error('private connection credential');},end:async()=>{}};
 const store=createPostgresMemberStore(pool);
 await assert.rejects(store.login('test','test'),error=>error.status===503&&!error.message.includes('credential'));
});
