import {databaseConnection,migrateApplicationSchema} from '../server/postgres-schema.mjs';
import {readFile} from 'node:fs/promises';
if(!process.env.DATABASE_URL)throw Error('Set the database connection privately.');
const {Pool}=await import('pg'),pool=new Pool({connectionString:databaseConnection(process.env.DATABASE_URL,{direct:true}),max:1,connectionTimeoutMillis:10000});
try{await migrateApplicationSchema(pool,await readFile(new URL('../server/recovery-schema.sql',import.meta.url),'utf8'));console.log('Account recovery schema is ready. No account, access grant or email was created.');}
catch{console.error('Account recovery migration failed. No private connection or database response printed.');process.exitCode=1;}finally{await pool.end();}
