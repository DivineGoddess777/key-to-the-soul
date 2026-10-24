import {createMemberStore} from '../membership.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const store=process.env.DATABASE_URL?await import('../server/membership-postgres.mjs').then(module=>module.connectPostgresMembers()):createMemberStore(path.join(root,'.data','members.sqlite'));
const args=process.argv.slice(2),flag=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:Number(args[i+1]);};
try{
 if(args[0]==='invite'){console.log(await store.invite({days:flag('days',30),uses:flag('uses',1),expiresDays:flag('expires-days',30)}));}
 else if(args[0]==='grant'){console.log(JSON.stringify(await store.grant(args[1],flag('days',30))));}
 else if(args[0]==='revoke'){console.log(JSON.stringify(await store.revoke(args[1])));}
 else if(args[0]==='cleanup'){if(store.cleanup)await store.cleanup();console.log('Expired member records cleared.');}
 else console.log('Owner commands:\n  node scripts/members.mjs invite --days 30 --uses 1 --expires-days 30\n  node scripts/members.mjs grant USERNAME --days 30\n  node scripts/members.mjs revoke USERNAME\nRun these only on the server. Invitation codes grant access; share them privately.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await store.close();}
