import {databaseConnection,migrateApplicationSchema} from '../server/postgres-schema.mjs';
import {readFile} from 'node:fs/promises';
if(!process.env.DATABASE_URL)throw Error('Set the chosen database connection privately before running this migration.');
const {Pool}=await import('pg');
const pool=new Pool({connectionString:databaseConnection(process.env.DATABASE_URL,{direct:true}),max:1,connectionTimeoutMillis:10000});
try{
 await migrateApplicationSchema(pool,await readFile(new URL('../server/orders-schema.sql',import.meta.url),'utf8'));
 console.log('Order schema is ready. No stock, customer orders, payment credentials or live checkout were created.');
}catch{console.error('Order migration failed. Check the private database connection and database permissions.');process.exitCode=1;}
finally{await pool.end();}
