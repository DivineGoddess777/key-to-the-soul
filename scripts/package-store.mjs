import fs from 'node:fs/promises';import path from 'node:path';
const root=process.cwd(),out=path.join(root,'release','store-'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(out,{recursive:true});
const manifest=JSON.parse(await fs.readFile('models/manifest.json','utf8'));
for(const name of await fs.readdir(root)){if(/\.(html|css|js)$/.test(name)||['dev-server.mjs','paypal-sandbox.mjs','README.md','SELF-HOSTING.md','OWNERSHIP.md','.env.example'].includes(name))await fs.copyFile(path.join(root,name),path.join(out,name));}
for(const dir of ['vendor','logos','images'])await fs.cp(path.join(root,dir),path.join(out,dir),{recursive:true});
for(const file of manifest.files){const target=path.join(out,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,file.path),target);}
await fs.copyFile('models/manifest.json',path.join(out,'models','manifest.json'));
for(const folder of ['reading-qwen3','voice']){for(const file of await fs.readdir(path.join(root,'models',folder))){if(/LICENSE|NOTICE/.test(file))await fs.copyFile(path.join(root,'models',folder,file),path.join(out,'models',folder,file));}}
await fs.mkdir(path.join(out,'scripts'));await fs.copyFile('scripts/members.mjs',path.join(out,'scripts','members.mjs'));
await fs.writeFile(path.join(out,'package.json'),JSON.stringify({name:'key-to-the-soul-runtime',private:true,type:'module',engines:{node:'>=24'},scripts:{start:'node --env-file-if-exists=.env.local dev-server.mjs',members:'node scripts/members.mjs'}},null,2)+'\n');
await fs.writeFile(path.join(out,'README.md'),'# Key to the Soul — deployment build\n\nRun with Node.js 24 or newer: npm start. There are no server npm dependencies to install.\n\nRead SELF-HOSTING.md for HTTPS/origin configuration, membership invitations, SQLite backups and launch limitations. OWNERSHIP.md documents third-party licenses. This folder excludes development tools, private accounts, test artifacts and credentials. Full editable sources remain in the development project.\n');
console.log(out);console.log('Runtime only: no private accounts, secrets, node_modules, QA files, or rejected model candidates.');