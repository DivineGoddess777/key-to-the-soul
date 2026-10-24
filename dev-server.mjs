import http from 'node:http';
import {createPaypalSandbox} from './paypal-sandbox.mjs';
import {createCheckoutApi} from './server/checkout-api.mjs';
import {storeTerms} from './server/store-policy.mjs';
import {createPersonalReadingsApi} from './server/personal-readings-api.mjs';
import {createSubscriptionsApi} from './server/subscriptions-api.mjs';
import {createRecoveryApi} from './server/recovery-api.mjs';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createMemberStore,createMembershipHandler} from './membership.js';
import { readFile, realpath, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const clients = new Set();
const production=process.env.KTTS_PRODUCTION==='1';
if(production&&(!process.env.KTTS_ORIGIN||new URL(process.env.KTTS_ORIGIN).protocol!=='https:'))throw Error('Production requires KTTS_ORIGIN set to the public HTTPS origin.');
const memberStore=createMemberStore(path.join(root,'.data','members.sqlite'));
const membership=createMembershipHandler(memberStore,{origin:process.env.KTTS_ORIGIN||'http://127.0.0.1:'+port,secure:production});
const paypalSandbox=createPaypalSandbox({root,origin:process.env.KTTS_ORIGIN||'http://127.0.0.1:'+port,production});
const closedCheckout=createCheckoutApi({origin:process.env.KTTS_ORIGIN||'http://127.0.0.1:'+port,mode:'sandbox',enabled:false,secure:false,terms:storeTerms});
const closedPersonal=createPersonalReadingsApi({origin:process.env.KTTS_ORIGIN||'http://127.0.0.1:'+port,environment:'sandbox',enabled:false});
const closedSubscriptions=createSubscriptionsApi({origin:process.env.KTTS_ORIGIN||'http://127.0.0.1:'+port,mode:'sandbox',enabled:false});
const closedRecovery=createRecoveryApi({enabled:false});
const allowed = new Set(['.html', '.css', '.js', '.svg', '.jpg', '.jpeg', '.png', '.webp', '.ico', '.ttf', '.woff2']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.ttf':'font/ttf', '.woff2':'font/woff2' };
const reloadScript = `<script>
(() => {
  const events = new EventSource('/__changes');
  events.onmessage = ({data}) => {
    const file = JSON.parse(data);
    if (file.endsWith('.css')) {
      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const url = new URL(link.href);
        if (url.origin === location.origin) {
          url.searchParams.set('v', Date.now());
          const next = link.cloneNode(); next.href = url.href;
          next.onload = () => link.remove(); link.after(next);
        }
      });
    } else { location.reload(); }
  };
})();
</script>`;

const server = http.createServer(async (req, res) => {
  try{new URL(req.url,'http://localhost');}catch{res.writeHead(400).end('Bad request');return;}
  try{
    if(req.url.startsWith('/api/account/')){
      const response=await closedRecovery(new Request((process.env.KTTS_ORIGIN||'http://127.0.0.1:'+port)+req.url,{method:req.method}),new URL(req.url,'http://localhost').pathname.slice('/api/account/'.length));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(req.url.startsWith('/api/subscriptions/')){
      const response=await closedSubscriptions(new Request((process.env.KTTS_ORIGIN||'http://127.0.0.1:'+port)+req.url,{method:req.method}),new URL(req.url,'http://localhost').pathname.slice('/api/subscriptions/'.length));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(req.url.startsWith('/api/personal-readings/')){
      const response=await closedPersonal(new Request((process.env.KTTS_ORIGIN||'http://127.0.0.1:'+port)+req.url,{method:req.method}),new URL(req.url,'http://localhost').pathname.slice('/api/personal-readings/'.length));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(req.url.startsWith('/api/checkout/')){
      const response=await closedCheckout(new Request((process.env.KTTS_ORIGIN||'http://127.0.0.1:'+port)+req.url,{method:req.method}),new URL(req.url,'http://localhost').pathname.slice('/api/checkout/'.length));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(await membership.handle(req,res))return;
    if(await paypalSandbox.handle(req,res))return;
  }catch{if(!res.headersSent)res.writeHead(500,{'Cache-Control':'no-store'}).end('The server could not complete that request.');else res.destroy();return;}
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (pathname === '/__changes' && !production) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n'); clients.add(res);
    req.on('close', () => clients.delete(res)); return;
  }
  const parts = pathname.split(/[\\/]/);
  if (parts.some(part => part.startsWith('.') || part.includes(':'))) { res.writeHead(403).end('Forbidden'); return; }
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  const ext = path.extname(target).toLowerCase();
  const memberAsset=pathname.startsWith('/models/')||pathname.startsWith('/vendor/edge/')||['/tarot-deck.js','/tarot-state.js'].includes(pathname);
  const binaryAsset=(pathname.startsWith('/models/')&&['.json','.onnx','.bin'].includes(ext))||(pathname.startsWith('/vendor/edge/')&&['.mjs','.wasm','.txt'].includes(ext));
  if(memberAsset&&!await membership.active(req)){res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({error:'Active membership required.'}));return;}
  if (!allowed.has(ext)&&!binaryAsset) { res.writeHead(404).end('Not found'); return; }
  try {
    const resolved = await realpath(target);
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !(await stat(resolved)).isFile()) {
      res.writeHead(403).end('Forbidden'); return;
    }
    const details=await stat(resolved);
    const types={'.json':'application/json; charset=utf-8','.onnx':'application/octet-stream','.bin':'application/octet-stream','.wasm':'application/wasm','.mjs':'text/javascript; charset=utf-8','.txt':'text/plain; charset=utf-8'};
    const headers={'Content-Type':mime[ext]||types[ext],'Cache-Control':memberAsset?'private, max-age=0, must-revalidate':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
    if(ext==='.html'){
      let content=await readFile(resolved);
      if(!production)content=Buffer.from(content.toString('utf8').replace('</body>',reloadScript+'</body>'));
      res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:content);return;
    }
    headers['Accept-Ranges']='bytes';let startByte=0,endByte=details.size-1,status=200;
    if(req.headers.range){
      const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!range||!range[1]&&!range[2]){res.writeHead(416,{'Content-Range':'bytes */'+details.size}).end();return;}
      if(!range[1])startByte=Math.max(0,details.size-Number(range[2]));
      else{startByte=Number(range[1]);if(range[2])endByte=Math.min(endByte,Number(range[2]));}
      if(!Number.isSafeInteger(startByte)||!Number.isSafeInteger(endByte)||startByte>endByte||startByte>=details.size){res.writeHead(416,{'Content-Range':'bytes */'+details.size}).end();return;}
      status=206;headers['Content-Range']='bytes '+startByte+'-'+endByte+'/'+details.size;
    }
    headers['Content-Length']=Math.max(0,endByte-startByte+1);res.writeHead(status,headers);
    if(req.method==='HEAD'||details.size===0){res.end();return;}
    try{await pipeline(createReadStream(resolved,{start:startByte,end:endByte,highWaterMark:65536}),res);}catch{if(!res.destroyed)res.destroy();}

  } catch { res.writeHead(404).end('Not found'); }
});

let pending;
const changedFiles = new Set();
function onChange(_, filename) {
  if (!filename || !allowed.has(path.extname(filename).toLowerCase())) return;
  changedFiles.add(filename);
  clearTimeout(pending);
  pending = setTimeout(() => {
    const batch = [...changedFiles]; changedFiles.clear();
    // A later CSS save must not hide an earlier script or HTML change.
    const changed = batch.find(file => !file.endsWith('.css')) || batch.at(-1);
    for (const client of clients) client.write(`data: ${JSON.stringify(changed)}\n\n`);
  }, 100);
}
// Watch editable sources only. Dependency/cache extraction must not trigger reload storms.
const watchers = production?[]:[watch(root, onChange), ...['images', 'logos'].map(directory => watch(path.join(root, directory), { recursive: true }, onChange))];
const heartbeat = production?null:setInterval(() => { for (const client of clients) client.write(': keepalive\n\n'); }, 15000);
server.on('error', error => { console.error(error.message); watchers.forEach(watcher => watcher.close()); clearInterval(heartbeat); process.exitCode = 1; });
server.on('close',()=>{watchers.forEach(watcher=>watcher.close());clearInterval(heartbeat);memberStore.close();paypalSandbox.close();});
server.listen(port, '127.0.0.1', () => {
  console.log(`Copper storefront: http://127.0.0.1:${port}/`);
  console.log(`Live brand studio: http://127.0.0.1:${port}/brand-studio.html`);
  console.log('CSS swaps live. HTML, JavaScript and image edits reload automatically. Ctrl+C stops preview.');
});
