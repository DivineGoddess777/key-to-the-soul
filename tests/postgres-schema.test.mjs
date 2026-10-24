import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationSQL,applicationPool,databaseConnection,migrateApplicationSchema} from '../server/postgres-schema.mjs';
test('application queries name public tables without altering literals, parameters or explicit schemas',async()=>{
 const text="SELECT * FROM ktts_users u JOIN ktts_sessions s ON s.user_id=u.id WHERE u.username=$1 AND 'ktts_users'='ktts_users'";
 assert.equal(applicationSQL(text),"SELECT * FROM public.ktts_users u JOIN public.ktts_sessions s ON s.user_id=u.id WHERE u.username=$1 AND 'ktts_users'='ktts_users'");
 assert.equal(applicationSQL('SELECT * FROM public.ktts_orders'),'SELECT * FROM public.ktts_orders');assert.equal(applicationSQL('BEGIN'),'BEGIN');
 const calls=[],client={query:async(...args)=>calls.push(args),release:()=>calls.push('released')};
 const wrapped=applicationPool({query:client.query,connect:async()=>client,end:async()=>{}});await wrapped.query(text,['ktts_users']);const connected=await wrapped.connect();await connected.query('UPDATE ktts_orders SET status=$1',['PAID']);connected.release();
 assert.equal(calls[0][1][0],'ktts_users');assert.ok(calls[1][0].startsWith('UPDATE public.ktts_orders'));assert.equal(calls[2],'released');
});
test('Neon migrations use direct TLS-verified connections and transaction-local public schema',async()=>{
 const url=new URL(databaseConnection('postgresql://test:test@ep-example-pooler.us-east-1.aws.neon.tech/test?sslmode=require',{direct:true}));
 assert.equal(url.hostname,'ep-example.us-east-1.aws.neon.tech');assert.equal(url.searchParams.get('sslmode'),'verify-full');
 const statements=[],client={query:async sql=>statements.push(sql),release:()=>statements.push('release')};await migrateApplicationSchema({connect:async()=>client},'SYNTHETIC DDL');
 assert.deepEqual(statements,['BEGIN','SET LOCAL search_path TO public','SYNTHETIC DDL','COMMIT','release']);
});
