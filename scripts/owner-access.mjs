import {applicationPool,databaseConnection} from '../server/postgres-schema.mjs';
import {Pool} from 'pg';
const [action,username,hoursText]=process.argv.slice(2),hours=Number(hoursText);
if(!process.env.DATABASE_URL||!['grant','revoke','status'].includes(action)||!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username||'')||action==='grant'&&(!Number.isInteger(hours)||hours<1||hours>87600)){
 console.error('Load the intended private database, then use grant USERNAME HOURS | revoke USERNAME | status USERNAME. Owner access is separate from tarot membership.');process.exit(1);
}
const rawPool=new Pool({connectionString:databaseConnection(process.env.DATABASE_URL),max:1,connectionTimeoutMillis:10000});
const pool=applicationPool(rawPool);
try{
 const result=action==='status'?await pool.query('SELECT username,store_owner_until FROM ktts_users WHERE username=$1',[username]):await pool.query('UPDATE ktts_users SET store_owner_until=$2 WHERE username=$1 RETURNING username,store_owner_until',[username,action==='grant'?Date.now()+hours*3600000:0]);
 if(!result.rows.length)throw Error('Create that store account first.');
 const row=result.rows[0];console.log(JSON.stringify({username:row.username,ownerUntil:Number(row.store_owner_until),ownerActive:Number(row.store_owner_until)>Date.now()}));
}catch{console.error('Owner access was not confirmed. Check the target environment, account and migration.');process.exitCode=1;}
finally{await pool.end();}
