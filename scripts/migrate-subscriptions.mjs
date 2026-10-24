import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {databaseConnection,migrateApplicationSchema} from '../server/postgres-schema.mjs';
if(!process.env.DATABASE_URL)throw Error('Choose the intended database privately.');
const pool=new Pool({connectionString:databaseConnection(process.env.DATABASE_URL,{direct:true}),max:1,connectionTimeoutMillis:10000});
try{
 const sql=await readFile(new URL('../server/subscriptions-schema.sql',import.meta.url),'utf8');await migrateApplicationSchema(pool,sql);
 console.log('Subscription schema is ready. No agreement, payment, credit or account access was created.');
}catch{console.error('Subscription migration failed. Check private database configuration.');process.exitCode=1;}
finally{await pool.end();}
