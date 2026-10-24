const tables=new Set(['ktts_users','ktts_sessions','ktts_invitations','ktts_auth_attempts','ktts_sandbox_orders','ktts_stock','ktts_orders','ktts_order_lines','ktts_order_events','ktts_payment_events','ktts_tarot_wallets','ktts_tarot_months','ktts_personal_readings','ktts_reading_credits','ktts_subscriptions','ktts_order_refunds','ktts_refund_attempts','ktts_mail_outbox','ktts_account_challenges','ktts_account_mail']);
// Runtime SQL always names the application schema. Session SET search_path is
// unreliable on transaction poolers and must never decide which tables we use.
export function applicationSQL(sql){
 if(typeof sql!=='string')return {...sql,text:applicationSQL(sql.text)};
 return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\b(ktts_[a-z_]+)\b/g,(match,table,offset)=>table&&tables.has(table)&&sql[offset-1]!=='.'?'public.'+table:match);
}
export function applicationPool(pool){
 return {query:(sql,...args)=>pool.query(applicationSQL(sql),...args),connect:async()=>{
  const client=await pool.connect();return {query:(sql,...args)=>client.query(applicationSQL(sql),...args),release:()=>client.release()};
 },end:()=>pool.end()};
}
export function databaseConnection(connectionString,{direct=false}={}){
 const url=new URL(connectionString),neon=url.hostname.endsWith('.neon.tech')||url.hostname.endsWith('.neon.build');
 if(neon){url.searchParams.set('sslmode','verify-full');if(direct)url.hostname=url.hostname.replace('-pooler.','.');}
 return url.href;
}
export async function migrateApplicationSchema(pool,sql){
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL search_path TO public');await client.query(sql);await client.query('COMMIT');}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
