import fs from 'node:fs/promises';import path from 'node:path';
const dir='vendor/fonts';await fs.mkdir(dir,{recursive:true});let css='';
for(const [family,query,weights,repo] of [
 ['Cormorant Garamond','Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500','400 600','cormorantgaramond'],
 ['Manrope','Manrope:wght@400;500;600;700','400 700','manrope']
]){
 const response=await fetch('https://fonts.googleapis.com/css2?family='+query+'&display=swap',{headers:{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'}});if(!response.ok)throw Error(response.status);
 const source=await response.text();const blocks=[...source.matchAll(/(@font-face\s*\{[^}]+\})/g)].map(m=>m[1]);if(!blocks.length)throw Error('Latin font face missing');
 let index=0;
 for(const block of blocks){const remote=/url\(([^)]+)\)/.exec(block)?.[1];if(!remote?.startsWith('https://fonts.gstatic.com/'))throw Error('Unexpected font source');const ext=remote.endsWith('.woff2')?'woff2':'ttf';const name=repo+'-'+index+++'.'+ext;const font=await fetch(remote);if(!font.ok)throw Error(font.status);await fs.writeFile(path.join(dir,name),Buffer.from(await font.arrayBuffer()));css+=block.replace(remote,'vendor/fonts/'+name)+'\n';}
 const license=await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/'+repo+'/OFL.txt');if(!license.ok)throw Error('Font license missing');await fs.writeFile(path.join(dir,repo+'-OFL.txt'),await license.text());
}
await fs.writeFile('fonts.css',css);
for(const file of ['storefront.css','studio.css','ember-3d.css','moon-room.css','tarot.css']){let source=await fs.readFile(file,'utf8');source=source.replace(/^@import url\('https:\/\/fonts.googleapis.com\/[^\n]+\);/,"@import url('fonts.css');");await fs.writeFile(file,source);}
console.log('Fonts and OFL licenses are now self-hosted.');