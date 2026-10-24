import {extendCatalog} from './catalog-collections.js';
export const intentions = Object.freeze([
 {id:'release',name:'Release',line:'Put down what you no longer need to carry.',symbol:'◔'},
 {id:'love',name:'Self-love',line:'Pour a little of that love back into yourself.',symbol:'◑'},
 {id:'abundance',name:'Abundance',line:'Leave a little room for what comes next.',symbol:'◕'},
 {id:'joy',name:'Joy',line:'Let the little things feel like enough.',symbol:'●'},
 {id:'personal',name:'Personal intention',line:'A ritual that is yours to define.',symbol:'◯'}
]);
const originalProducts = [
 {id:'release-1010',name:'Let That Shit Go',number:'1010',intention:'release',image:'images/let-that-shit-go-1010-copper-v2.jpg',alt:'Let That Shit Go 1010 candle with dried botanicals and quartz',scent:'Marshmallow',detail:'For the letting go.',description:'For the days when you’re done carrying what was never yours to hold. A little reminder to make room for your peace.',affirmation:'I don’t have to carry everything.',ritual:['Name one thing you’re ready to put down.','Write what you want to make room for instead.','Give yourself permission to leave the rest for another day.'],priceCents:null,currency:'USD'},
 {id:'love-333',name:'Love',number:'333',intention:'love',image:'images/love-333-copper-v2.jpg',alt:'Love 333 candle with rose quartz and autumn botanicals',scent:'Autumn wreath',detail:'For coming home to yourself.',description:'The candle that began Keianna’s story. An invitation to pour something into yourself, and make your own peace a priority.',affirmation:'I can choose myself without asking permission.',ritual:['Write one thing you appreciate about yourself.','Choose a small kindness you can offer yourself today.','Let that kindness be enough.'],priceCents:null,currency:'USD'},
 {id:'prosperity-888',name:'Prosperity',number:'888',intention:'abundance',image:'images/prosperity-888-copper-v2.jpg',gallery:[{image:'images/prosperity-888-original-v2.jpg',alt:'Original view of the lit Prosperity 888 Candy Corn candle'}],alt:'Keianna’s lit Prosperity 888 candle in its glass jar',scent:'Candy corn',detail:'For what you’re calling in.',description:'For the next chapter you’re ready to welcome. A candle to accompany your intentions, wherever your becoming takes you.',affirmation:'I can make room for new possibilities.',ritual:['Name a possibility you want to welcome.','Write one small step that belongs to you.','Choose when you’ll take that step.'],priceCents:null,currency:'USD'},
 {id:'happy',name:'Smells Like Happy',number:'',intention:'joy',image:'images/smells-like-happy-copper-v2.jpg',alt:'Smells Like Happy double-wick mug candle with crystals',scent:'Double-wick ritual mug',detail:'For the little good things.',description:'A little invitation to romanticize an ordinary moment. The small pause, the familiar comfort, the thing that makes you smile.',affirmation:'Joy can be a small, daily choice.',ritual:['Notice one small good thing around you.','Write it down before the moment passes.','Choose a little more of it for tomorrow.'],priceCents:null,currency:'USD'}
];
export const products = Object.freeze(extendCatalog(originalProducts));
export const getProduct=id=>products.find(p=>p.id===id);
export const getIntention=id=>intentions.find(i=>i.id===id);
export function normalizeBag(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 return Object.fromEntries(products.flatMap(({id})=>{
  if(!Object.hasOwn(raw,id))return [];
  const qty=raw[id];
  return typeof qty==='number'&&Number.isInteger(qty)&&qty>0?[[id,Math.min(qty,9)]]:[];
 }));
}
export function changeBag(raw,id,delta){
 const bag=normalizeBag(raw);if(!getProduct(id)||!Number.isInteger(delta))return bag;
 const qty=Math.max(0,Math.min(9,(bag[id]||0)+delta));
 if(qty)bag[id]=qty;else delete bag[id];return bag;
}
