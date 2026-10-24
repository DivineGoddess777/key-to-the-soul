export const collections=Object.freeze([
 {id:'featured',name:'Featured pieces'},
 {id:'intention',name:'Intention candles'},
 {id:'zodiac',name:'Zodiac collection'},
 {id:'angel',name:'Angel numbers'},
 {id:'all',name:'All candles'}
]);
export const intentionNames=Object.freeze(['Money','Love','Protection','Let That Shit Go','Spiritual Journey','Healing','Release','Anxiety','Abundance','Seven Chakras']);
export const zodiacSigns=Object.freeze(['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']);
export const angelNumbers=Object.freeze(['111','222','333','444','555','666','777','888','999','1010','1111','1212']);
const symbols=['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-');
const descriptions={
 Money:'For setting a personal intention around money and what matters to you.',
 Protection:'For reflecting on your boundaries and what you want to keep close.',
 'Spiritual Journey':'For a moment of reflection on your own path.',
 Healing:'For a personal ritual of reflection and self-kindness.',
 Release:'For naming what you’re ready to put down.',
 Anxiety:'For accompanying a quiet moment you choose for yourself.',
 Abundance:'For making space for the possibilities you want to welcome.',
 'Seven Chakras':'For a personal ritual of reflection and connection.'
};
function makeProduct(name,collection,extra={}){
 return {id:collection+'-'+slug(name),name,number:'',intention:'personal',collections:[collection],image:null,alt:'',scent:null,
  detail:'For your own intention.',description:descriptions[name]||'Part of Keianna’s '+(collection==='zodiac'?'Zodiac':'Angel Number')+' Collection. Make this ritual your own.',
  affirmation:collection==='angel'?'I choose the meaning I carry.':'I make room for this season of myself.',
  ritual:['Name the intention you want to carry.','Write what that intention means to you.','Choose one small action that honors it.'],
  priceCents:null,currency:'USD',includesHerbsAndCrystals:true,...extra};
}
export function extendCatalog(original){
 const result=original.map(product=>({...product,collections:['featured'],includesHerbsAndCrystals:true}));
 for(const name of intentionNames){
  const existing=result.find(product=>product.name===name);
  if(existing)existing.collections.push('intention');
  else result.push(makeProduct(name,'intention',{intention:name==='Abundance'?'abundance':name==='Release'?'release':'personal'}));
 }
 zodiacSigns.forEach((name,index)=>result.push(makeProduct(name,'zodiac',{symbol:symbols[index]+String.fromCharCode(0xfe0e)})));
 for(const number of angelNumbers){
  const existing=result.find(product=>product.number===number);
  if(existing)existing.collections.push('angel');
  else result.push(makeProduct(number,'angel',{symbol:number}));
 }
 return result;
}
