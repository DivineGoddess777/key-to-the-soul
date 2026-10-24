import {applicationPool,databaseConnection} from '../server/postgres-schema.mjs';
import {Pool} from 'pg';
import {createPostgresOrders} from '../server/orders-postgres.mjs';
const [flag,mode,command,...args]=process.argv.slice(2);
if(flag!=='--mode'||!['sandbox','live'].includes(mode)||!['list','show','stock','expire','ship'].includes(command)){
 console.error('Use --mode sandbox|live list | show ID | stock SKU ready_stock QUANTITY | stock SKU made_to_order | expire | ship ID CARRIER TRACKING');process.exit(1);
}
if(!process.env.DATABASE_URL||mode==='live'&&process.env.KTTS_PRODUCTION!=='1'||mode==='sandbox'&&process.env.KTTS_PRODUCTION==='1'){
 console.error('Load the intended private database environment. Live administration requires KTTS_PRODUCTION=1; sandbox administration refuses that flag.');process.exit(1);
}
const rawPool=new Pool({connectionString:databaseConnection(process.env.DATABASE_URL),max:1,connectionTimeoutMillis:10000});
const pool=applicationPool(rawPool);
const store=createPostgresOrders(pool,{environment:mode});
try{
 let result;
 if(command==='list')result=await store.list();
 if(command==='show'){
  result=(await pool.query('SELECT * FROM ktts_orders WHERE id=$1 AND environment=$2',[args[0],mode])).rows[0]||null;
  // Explicit owner command. Includes customer address; do not paste its output publicly.
 }
 if(command==='stock')result=await store.setStock(args[0],{mode:args[1],onHand:args[1]==='made_to_order'?null:Number(args[2])});
 if(command==='expire')result={expired:await store.expireReservations()};
 if(command==='ship')result=await store.fulfill(args[0],{carrier:args[1],trackingNumber:args[2]});
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.status?error.message:'Order administration could not complete. No payment was initiated.');process.exitCode=1;}
finally{await pool.end();}
