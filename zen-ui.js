export function initMoonRoom({showDialog}){
 const dialog=document.querySelector('#zen-dialog'),holder=document.querySelector('#zen-frame'),hero=document.querySelector('#hero-seal-frame');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function syncHero(){
  hero?.contentWindow?.postMessage({type:'ktts-motion',paused:document.hidden||reduced.matches||document.body.classList.contains('still')||Boolean(document.querySelector('dialog[open]'))},location.origin);
 }
 function open(){
  if(dialog.open)return;
  const iframe=document.createElement('iframe');iframe.src='moon-room.html?embed=1';iframe.title='The Moon Room — a quiet space to play and pause';holder.replaceChildren(iframe);showDialog(dialog);
  const menu=document.querySelector('#menu-button');menu.setAttribute('aria-expanded','false');document.querySelector('#site-links').dataset.open='false';
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-open-zen]'))open();});
 dialog.addEventListener('close',()=>{holder.replaceChildren();if(location.hash==='#moon-room')history.replaceState(null,'',location.pathname+location.search);});
 addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  if(event.data?.type==='ktts-seal-ready'&&event.source===hero?.contentWindow)syncHero();
  if(event.data?.type==='ktts-close-room'&&event.source===holder.querySelector('iframe')?.contentWindow)dialog.close();
  if(event.data?.type==='ktts-close-seal'&&event.source===document.querySelector('#seal-frame iframe')?.contentWindow)document.querySelector('#seal-dialog').close();
 });
 const observer=new MutationObserver(syncHero);observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 document.querySelectorAll('dialog').forEach(item=>observer.observe(item,{attributes:true,attributeFilter:['open']}));
 hero?.addEventListener('load',syncHero);document.addEventListener('visibilitychange',syncHero);reduced.addEventListener('change',syncHero);
 function hashOpen(){if(location.hash==='#moon-room')open();}
 addEventListener('hashchange',hashOpen);hashOpen();syncHero();
 addEventListener('pagehide',()=>observer.disconnect(),{once:true});
}
