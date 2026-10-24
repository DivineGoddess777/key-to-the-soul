import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createMemberStore,createMembershipHandler} from '../membership.js';
test('our member store hashes passwords, uses expiring sessions, and requires active membership',async()=>{
 let now=1700000000000;const store=createMemberStore(':memory:',()=>now);
 try{
  const user=await store.signup('Moon.Reader','a long test-only password');
  assert.equal(user.username,'moon.reader');assert.notEqual(Buffer.from(user.password_hash).toString(),'a long test-only password');
  await assert.rejects(store.login('moon.reader','incorrect password'));await assert.rejects(store.login('missing','incorrect password'));
  const signed=await store.login('Moon.Reader','a long test-only password'),token=store.session(signed);
  assert.equal(store.publicUser(store.current(token)).active,false);
  const code=store.invite({days:1,uses:1,expiresDays:1});const member=store.redeem(signed,code);
  assert.equal(member.active,true);assert.throws(()=>store.redeem(signed,code));
  now+=86400001;assert.equal(store.publicUser(store.current(token)).active,false);
  store.grant('moon.reader',1);assert.equal(store.publicUser(store.current(token)).active,true);
  store.revoke('moon.reader');assert.equal(store.publicUser(store.current(token)).active,false);
  store.logout(token);assert.equal(store.current(token),null);
 }finally{store.close();}
});
test('member HTTP actions reject cross-origin requests and return HttpOnly sessions',async()=>{
 const store=createMemberStore(':memory:');let origin;
 const handler=createMembershipHandler(store,{origin:'http://127.0.0.1:5188',secure:true});
 const server=http.createServer((req,res)=>handler.handle(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 const post=(route,body,extra={})=>fetch(origin+'/api/members/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:5188',...extra},body:JSON.stringify(body)});
 try{
  assert.equal((await post('signup',{username:'reader',password:'test password with length'},{Origin:'https://other-site.example'})).status,403);
  const response=await post('signup',{username:'reader',password:'test password with length'});assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);
  const payload=await response.json();assert.equal(payload.user.active,false);assert.equal('password_hash' in payload.user,false);
  const me=await fetch(origin+'/api/members/me',{headers:{Cookie:cookie.split(';')[0]}}).then(r=>r.json());assert.equal(me.user.username,'reader');
  for(let i=0;i<16;i++){const limited=await post('logout',{});if(i===15)assert.equal(limited.status,429);}
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
