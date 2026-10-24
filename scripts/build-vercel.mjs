import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const publicFiles=['index.html','storefront.css','storefront.js','storefront-state.js','catalog-collections.js','catalog-ui.js','candle-sizes.js','ritual-bag.js','ritual-bag-ui.js','ember-3d.html','ember-3d.css','ember-3d.js','moon-room.html','moon-room.css','moon-room.js','zen-state.js','zen-ui.js','tarot.html','tarot.css','tarot.js','tarot-art.js','tarot-edge.js','personal-readings.js','subscriptions.js','subscriptions.css','fonts.css','licenses.html','paypal-sandbox.html','paypal-sandbox.js','owner.html','owner.css','owner.js','checkout.html','checkout.css','checkout.js','account.html','account.css','account.js'];
export async function buildVercel(root=process.cwd()){
 const out=path.resolve(root,'dist');
 // Only clear this fixed generated directory inside the selected project.
 if(path.dirname(out)!==path.resolve(root))throw Error('Invalid output directory.');
 await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
 for(const name of publicFiles)await fs.copyFile(path.join(root,name),path.join(out,name));
 for(const name of ['images','logos','vendor'])await fs.cp(path.join(root,name),path.join(out,name),{recursive:true,filter:source=>!source.endsWith('.prompt.txt')});
 return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))console.log('Vercel public build:',await buildVercel());
