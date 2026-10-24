import {databaseConnection,migrateApplicationSchema} from '../server/postgres-schema.mjs';
import {readFile} from 'node:fs/promises';
if(!process.env.DATABASE_URL)throw Error('Set DATABASE_URL privately before running a migration.');
const {Pool}=await import('pg'),pool=new Pool({connectionString:databaseConnection(process.env.DATABASE_URL,{direct:true}),max:1,connectionTimeoutMillis:10000});
try{
 await migrateApplicationSchema(pool,await readFile(new URL('../server/members-schema.sql',import.meta.url),'utf8'));
 console.log('Member schema is ready. No accounts or access grants were created.');
}catch{console.error('Migration failed. Check the private database connection and database permissions.');process.exitCode=1;}finally{await pool.end();}
