import {createReadStream} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {put,head} from '../.cache/blob-tools/node_modules/@vercel/blob/dist/index.js';

if(!process.env.BLOB_READ_WRITE_TOKEN)throw Error('Private Blob upload credential required.');
const pack=JSON.parse(await readFile('release/latest-vercel-package.json','utf8'));
const manifest=JSON.parse(await readFile('models/manifest.json','utf8'));
const prefix='models/'+pack.sourceManifestSHA256.slice(0,16)+'/';
const reportPath='qa/vercel-model-upload.json';
let report;
try{report=JSON.parse(await readFile(reportPath,'utf8'));}catch{report={prefix,files:[]};}
if(report.prefix!==prefix)throw Error('Existing report belongs to a different asset version.');
const entries=[...manifest.files.map(e=>({...e,file:e.path.slice(7)})),{file:'voice/LICENSE'},{file:'manifest.json'}];
for(const entry of entries){
 if(entry.file.split('/').some(p=>p==='..'||p.startsWith('.')))throw Error('Invalid asset path.');
 const source=path.join(pack.models,entry.file);
 const hash=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(source)){hash.update(chunk);bytes+=chunk.length;}
 const sha256=hash.digest('hex');
 if(entry.sha256&&(entry.sha256!==sha256||entry.bytes!==bytes))throw Error('Asset integrity mismatch: '+entry.file);
 let saved=report.files.find(f=>f.file===entry.file);
 if(!saved){
  const blob=await put(prefix+entry.file,createReadStream(source),{
   access:'public',addRandomSuffix:false,allowOverwrite:false,multipart:bytes>8*1024*1024,
   contentType:entry.file.endsWith('.json')?'application/json':entry.file.endsWith('LICENSE')?'text/plain':'application/octet-stream',
   cacheControlMaxAge:31536000,
  });
  saved={file:entry.file,url:blob.url,bytes,sha256};report.files.push(saved);
  report.baseUrl=blob.url.slice(0,-entry.file.length);
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 }
 const metadata=await head(saved.url);
 if(metadata.size!==bytes)throw Error('Uploaded size mismatch: '+entry.file);
 console.log('Verified upload: '+entry.file+' ('+bytes+' bytes)');
}
report.completedAt=new Date().toISOString();
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log('Selected model pack uploaded. '+report.files.length+' files.');
