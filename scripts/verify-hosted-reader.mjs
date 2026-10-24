import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withPinnedModelLengths} from '../edge/model-fetch.js';
const report=JSON.parse(await readFile('qa/vercel-model-upload.json','utf8'));
const file=report.files.find(entry=>entry.file==='reading-qwen3/onnx/model_q4f16.onnx');
const origin='https://model-integrity.invalid';
const fetcher=(input,init)=>fetch(new URL(new URL(input,origin).pathname.slice('/models/'.length),report.baseUrl),init);
const ranged=withPinnedModelLengths(fetcher,[{path:'models/'+file.file,bytes:file.bytes}],origin);
const response=await ranged('/models/'+file.file,{signal:AbortSignal.timeout(900000)});
if(!response.ok)throw Error('Model download status '+response.status);
const hash=createHash('sha256');let bytes=0,last=0;
for await(const chunk of response.body){bytes+=chunk.length;hash.update(chunk);if(bytes-last>=100000000){last=bytes;console.log('Verified stream progress: '+Math.round(bytes/1e6)+' MB');}}
const sha256=hash.digest('hex');
if(bytes!==file.bytes||sha256!==file.sha256)throw Error('Hosted reader differs from the pinned pack.');
await writeFile('qa/vercel-reader-integrity.json',JSON.stringify({verifiedAt:new Date().toISOString(),url:file.url,bytes,sha256,match:true},null,2)+'\n');
console.log('Hosted reader SHA-256 matches.');
