import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicFiles} from './build-vercel.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tag=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(3).toString('hex');
const release=path.join(root,'release'),out=path.join(release,'vercel-'+tag),assets=path.join(release,'model-pack-'+tag);
if(path.dirname(out)!==release||path.dirname(assets)!==release)throw Error('Invalid package target.');
await fs.mkdir(out,{recursive:true});await fs.mkdir(assets,{recursive:true});
async function copy(name){
 const destination=path.join(out,name);await fs.mkdir(path.dirname(destination),{recursive:true});
 await fs.copyFile(path.join(root,name),destination);
}
for(const name of [...publicFiles,'tarot-deck.js','tarot-state.js','membership.js','paypal-sandbox.mjs','vercel.json','.vercelignore','.env.example','OWNERSHIP.md','VERCEL.md','ORDER-DESK.md','CHECKOUT.md','PERSONAL-READINGS.md','EMAIL-SETUP.md','ACCOUNT-RECOVERY.md','LAUNCH-READINESS.md','scripts/build-vercel.mjs','scripts/migrate-members.mjs','scripts/members.mjs','scripts/migrate-orders.mjs','scripts/migrate-personal-readings.mjs','scripts/migrate-subscriptions.mjs','scripts/migrate-recovery.mjs','scripts/orders.mjs','scripts/owner-access.mjs','models/manifest.json'])await copy(name);
for(const folder of ['api','server','images','logos','vendor'])await fs.cp(path.join(root,folder),path.join(out,folder),{recursive:true,filter:source=>!source.endsWith('.prompt.txt')});
const sourcePackage=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
await fs.writeFile(path.join(out,'package.json'),JSON.stringify({name:sourcePackage.name,private:true,type:'module',version:sourcePackage.version,engines:{node:'24.x'},scripts:{'build:vercel':'node scripts/build-vercel.mjs','db:migrate':'node --env-file-if-exists=.env.local scripts/migrate-members.mjs','db:migrate:readings':'node scripts/migrate-personal-readings.mjs','db:migrate:subscriptions':'node scripts/migrate-subscriptions.mjs','db:migrate:recovery':'node scripts/migrate-recovery.mjs','db:migrate:orders':'node --env-file-if-exists=.env.local scripts/migrate-orders.mjs',members:'node --env-file-if-exists=.env.local scripts/members.mjs',orders:'node --env-file-if-exists=.env.local scripts/orders.mjs','owner:access':'node --env-file-if-exists=.env.local scripts/owner-access.mjs'},dependencies:{pg:sourcePackage.dependencies.pg,nodemailer:sourcePackage.dependencies.nodemailer}},null,2)+'\n');
const manifest=JSON.parse(await fs.readFile(path.join(root,'models/manifest.json'),'utf8'));
let total=0;
for(const entry of manifest.files){
 if(!/^models\/(reading-qwen3|voice)\//.test(entry.path)||entry.path.split('/').some(part=>part==='..'||part.startsWith('.')))throw Error('Invalid asset manifest path.');
 const source=path.resolve(root,entry.path),destination=path.join(assets,entry.path.slice('models/'.length));
 if(!source.startsWith(root+path.sep)||!destination.startsWith(assets+path.sep))throw Error('Asset outside package.');
 await fs.mkdir(path.dirname(destination),{recursive:true});
 const hash=createHash('sha256');let bytes=0;
 await pipeline(createReadStream(source),new Transform({transform(chunk,_,next){hash.update(chunk);bytes+=chunk.length;next(null,chunk);}}),createWriteStream(destination,{flags:'wx'}));
 if(bytes!==entry.bytes||hash.digest('hex')!==entry.sha256)throw Error('Asset integrity mismatch: '+entry.path);
 total+=bytes;
}
await fs.copyFile(path.join(root,'models/voice/LICENSE'),path.join(assets,'voice/LICENSE'));
await fs.writeFile(path.join(assets,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(out,'PACKAGE-README.md'),'# Vercel upload package\n\nThis folder contains the complete deploy source and prebuilt browser runtime. Vercel installs only the small pg server dependency. Build command: npm run build:vercel. Output: dist. Node: 24.x.\n\nNo credentials, private databases, test accounts, model weights, development tooling, or QA screenshots are included here. The sibling model-pack directory contains only integrity-verified selected model assets; publish it to owner-controlled asset storage. See VERCEL.md before connecting Preview environments.\n\nThis package does not enable live checkout or billing.\n');
const report={createdAt:new Date().toISOString(),application:out,models:assets,modelBytes:total,modelFiles:manifest.files.length,sourceManifestSHA256:createHash('sha256').update(await fs.readFile(path.join(root,'models/manifest.json'))).digest('hex')};
await fs.writeFile(path.join(release,'latest-vercel-package.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
