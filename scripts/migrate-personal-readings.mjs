import {databaseConnection,migrateApplicationSchema} from '../server/postgres-schema.mjs';
import {readFile} from 'node:fs/promises';
if(!process.env.DATABASE_URL)throw Error('Select the intended database privately.');
const {Pool}=await import('pg');
const pool=new Pool({connectionString:databaseConnection(process.env.DATABASE_URL,{direct:true}),max:1,connectionTimeoutMillis:10000});
try{await migrateApplicationSchema(pool,await readFile(new URL('../server/personal-readings-schema.sql',import.meta.url),'utf8'));console.log('Personal reading schema is ready. No paid memberships, credits, customer requests or owner grants were created.');}
catch{console.error('Reading migration failed. Check private database settings.');process.exitCode=1;}
finally{await pool.end();}
