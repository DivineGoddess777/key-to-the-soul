import {tarotDeck,getTarotCard} from './tarot-deck.js';
export const spreads=Object.freeze({
 quick:{name:'Quick',count:1,subtitle:'One clear light',positions:['What wants your attention'],opening:'A single card can offer a place to pause. Let this image meet the season you are in, without asking it to decide your future.'},
 standard:{name:'Standard',count:3,subtitle:'Three currents',positions:['What you are carrying','What is asking for attention','What you can make room for'],opening:'These three cards form a conversation. Notice what you have brought into this moment, what wants care now, and a possibility you might choose to explore.'},
 deep:{name:'Deep',count:5,subtitle:'The deeper passage',positions:['Where you are now','What sits beneath the surface','What may be ready to release','What can support you','A next step to consider'],opening:'Give this spread a little room. Each card offers a different angle on your intention. You can hold what resonates, question what does not, and choose your own next step.'}
});
export const focuses=Object.freeze({
 becoming:{name:'A new chapter',invitation:'Let the cards offer language for what is changing, and for the person you are becoming.',closing:'You do not need to see the entire path to choose a thoughtful next step. Let one small action honor the chapter you want to begin.'},
 connection:{name:'Love & connection',invitation:'Notice what connection asks of you, and what it gives back. Your needs belong in the conversation.',closing:'Connection can hold both warmth and boundaries. Let this reading make room for an honest conversation with yourself before asking anything of someone else.'},
 purpose:{name:'Work & purpose',invitation:'Consider where your effort feels meaningful, where it feels scattered, and what deserves your attention.',closing:'You can care about your direction without making every moment a measure of achievement. Choose one action that feels useful and aligned with your values.'},
 self:{name:'Coming back to me',invitation:'Give your own voice a little space. You are allowed to receive the care and attention you so often offer outward.',closing:'Return to what feels steady, kind, and true enough for today. You can leave this reading with a question rather than an answer, and still have received something useful.'}
});
export function secureIndex(max,source=globalThis.crypto){
 if(!Number.isInteger(max)||max<1)throw Error('Invalid random range');
 const limit=2**32-(2**32%max),buffer=new Uint32Array(1);let value;
 do{source.getRandomValues(buffer);value=buffer[0];}while(value>=limit);return value%max;
}
export function shuffleDeck(index=secureIndex){
 const deck=tarotDeck.map(card=>card.id);
 for(let i=deck.length-1;i>0;i--){const j=index(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
 return deck;
}
export function createSpread(kind='quick',focus='becoming',index=secureIndex){
 return {kind:spreads[kind]?kind:'quick',focus:focuses[focus]?focus:'becoming',deck:shuffleDeck(index),selected:[]};
}
export function chooseCard(state,id,reversed=false){
 const spread=spreads[state.kind];
 if(state.selected.length>=spread.count||!state.deck.includes(id)||state.selected.some(card=>card.id===id))return state;
 return {...state,selected:[...state.selected,{id,reversed:Boolean(reversed)}]};
}
export const spreadComplete=state=>state.selected.length===spreads[state.kind].count;
const positionNotes=[
 'Begin by noticing the image and the feeling it brings up. You do not need an immediate explanation. Let your first impression be one part of the conversation.',
 'Consider this alongside the card before it. The cards can hold different truths at once, and their relationship may matter more than a single fixed meaning.',
 'You can approach this as a possibility to explore rather than a direction you must follow. What fits your real circumstances is yours to decide.',
 'Support can be practical, emotional, or simply a kinder pace. Notice where this card connects with care already available to you.',
 'Choose something small enough to return to. A meaningful next step does not have to resolve the whole story.'
];
export function buildReading(state){
 if(!spreadComplete(state))throw Error('Choose the complete spread first');
 const spread=spreads[state.kind],focus=focuses[state.focus];
 const sections=state.selected.map((draw,index)=>{
  const card=getTarotCard(draw.id),body=draw.reversed?card.reversed:card.upright;
  return {id:card.id,name:card.name,reversed:draw.reversed,position:spread.positions[index],keywords:card.keywords,body,context:state.kind==='quick'?positionNotes[0]:positionNotes[index],question:card.question};
 });
 const reading={kind:state.kind,focus:state.focus,opening:spread.opening+' '+focus.invitation,sections,closing:focus.closing};
 const text=readingText(reading);return {...reading,minutes:Math.max(1,Math.ceil(text.split(/\s+/).length/130))};
}
export function readingText(reading,reflection=''){
 return ['Key to the Soul. Your '+spreads[reading.kind].name.toLowerCase()+' tarot reading.',focuses[reading.focus].name+'.',reading.opening,
 ...reading.sections.map(section=>[section.position+'.',section.name+(section.reversed?', reversed.':'.'),section.body,section.context,'A question to sit with: '+section.question].join(' ')),
 reading.closing,reflection?'A local reflection. '+reflection:''].filter(Boolean).join('\n\n');
}
export function reflectionMessages(reading){
 const notes=reading.sections.map(card=>card.body).join(' ');
 return [
  {role:'system',content:'You are a careful editor. Use only the source themes to write two gentle closing sentences addressed to the reader as you. Keep the language plain, under 55 words. No predictions, invented experiences, elaborate metaphors, tarot names, questions, headings, or quotations. Do not speak as I or me. It is fine to keep a good sentence from the source.'},
  {role:'user',content:'Source: '+reading.sections[0].body},
  {role:'assistant',content:reading.sections[0].body},
  {role:'user',content:'Source: '+notes+' Write two closing sentences from this source.'}
 ];
}
export function cleanReflection(raw,reading){
 if(/<think[\s>]/i.test(String(raw??'')))return null;
 let text=String(raw??'').replace(/<[^>]*>/g,'').replace(/\*|#{1,6}/g,'').replace(/\s+/g,' ').trim();
 const focusName=focuses[reading.focus]?.name;
 if(focusName&&text.toLowerCase().startsWith(focusName.toLowerCase()+'.'))text=text.slice(focusName.length+1).trim();
 text=text.replace(/^(?:Intention:[^.]*\.\s*)?Source notes:\s*/i,'').replace(/\bQuestions:\s*/gi,'');
 if(/source notes|rewrite these notes|write two|careful editor/i.test(text))return null;
 const end=Math.max(text.lastIndexOf('.'),text.lastIndexOf('?'),text.lastIndexOf('!'));
 if(end>=35)text=text.slice(0,end+1);
 const sentences=text.match(/[^.!?]+[.!?]+/g)||[];
 const statements=sentences.filter(sentence=>!sentence.trim().endsWith('?'));
 if(statements.length<2||statements.slice(0,2).some(sentence=>/^[\s]*["“”’.,;:?!—–-]/.test(sentence)||sentence.trim().split(/\s+/).length<4))return null;
 const normalized=statements.slice(0,2).map(sentence=>sentence.toLowerCase().replace(/[^a-z0-9 ]/g,'').trim());
 const a=new Set(normalized[0].split(/\s+/)),b=new Set(normalized[1].split(/\s+/));
 const overlap=[...a].filter(word=>b.has(word)).length/new Set([...a,...b]).size;
 if(normalized[0]===normalized[1]||overlap>.8)return null;
 if(statements.slice(0,2).some(sentence=>/^\s*(?:Letting|Noticing|Finding|Making|Giving)\b/i.test(sentence)&&! /\b(?:is|can|may|helps|allows|means)\b/i.test(sentence)))return null;
 const question=reading.sections.at(-1)?.question||sentences.find(sentence=>sentence.trim().endsWith('?'));
 text=(question?[...statements.slice(0,2),question]:sentences.slice(0,3)).join(' ').replace(/\s+/g,' ').trim();
 const stop=new Set('about after again along also always another around before being could does each even feels from have here into just kind like little more much only other over should small some than that them then there these they this those through today toward very what when where which while will with would your yourself'.split(' '));
 const words=value=>(String(value).toLowerCase().match(/[a-z]{4,}/g)||[]).filter(word=>!stop.has(word)).map(word=>word.slice(0,4));
 const sourceWords=new Set(words(reading.sections.map(section=>section.body).join(' ')));
 const shared=new Set(words(statements.slice(0,2).join(' ')).filter(word=>sourceWords.has(word)));
 if(shared.size<2)return null;
 if(text.length<45||text.length>700||/guarantee|definitely will|will certainly|diagnos|\bcure\b|\binvest\b|as an ai|in your story|ancient symbol|around the world|\b(?:I|me|my|mine|myself)\b|\bfate\b/i.test(text))return null;
 const unseen=tarotDeck.filter(card=>card.arcana==='major'&&!reading.sections.some(section=>section.id===card.id)).some(card=>(card.name.startsWith('The ')?new RegExp('\\b'+card.name+'\\b','i').test(text):new RegExp('(?:card (?:of )?'+card.name+'|'+card.name+' card)','i').test(text)));
 return unseen?null:text;
}
export function splitSpeech(text,max=260){
 const paragraphs=String(text).split(/\n+/).filter(Boolean),chunks=[];
 for(const paragraph of paragraphs){
  const words=paragraph.split(/\s+/);let chunk='';
  for(const word of words){if(chunk&&(chunk.length+word.length+1)>max){chunks.push(chunk);chunk='';}chunk+=(chunk?' ':'')+word;}
  if(chunk)chunks.push(chunk);
 }
 return chunks;
}
export function wavBytes(samples,sampleRate=24000){
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer),write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
 write(0,'RIFF');view.setUint32(4,36+samples.length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);
 samples.forEach((sample,i)=>view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,sample))*32767),true));
 return buffer;
}
