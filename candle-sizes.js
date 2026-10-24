export const candleSizes=Object.freeze([
 Object.freeze({id:'mini',name:'Mini ritual candle',short:'Mini',weight:'4 oz',priceCents:1200,purpose:'Sample size or small gift'}),
 Object.freeze({id:'small',name:'Small ritual candle',short:'Small',weight:'6 oz',priceCents:1800,purpose:'Everyday intention candle'}),
 Object.freeze({id:'signature',name:'Signature ritual candle',short:'Signature',weight:'8 oz',priceCents:2600,purpose:'Main collection size'}),
 Object.freeze({id:'large',name:'Large ritual candle',short:'Large',weight:'10 oz',priceCents:3000,purpose:'A fuller candle'}),
 Object.freeze({id:'deluxe',name:'Deluxe ritual candle',short:'Deluxe',weight:'12 oz',priceCents:3600,purpose:'Premium candle or gift'}),
 Object.freeze({id:'luxury',name:'Luxury ritual candle',short:'Luxury',weight:'16 oz',priceCents:4400,purpose:'Statement candle with premium presentation'})
]);
export const getSize=id=>candleSizes.find(size=>size.id===id);
export const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:cents%100?2:0}).format(cents/100);
export const sizeLabel=size=>size.short+' · '+size.weight;
