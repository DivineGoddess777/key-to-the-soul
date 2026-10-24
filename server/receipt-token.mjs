import {createHmac,timingSafeEqual} from 'node:crypto';
const uuid=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const valid=secret=>typeof secret==='string'&&/^[a-f0-9]{64,128}$/.test(secret);
export function issueReceiptToken(orderId,environment,secret,now=Date.now()){
 if(!uuid(orderId)||!['sandbox','live'].includes(environment)||!valid(secret))throw Error('Configure private receipt links.');
 const value=Buffer.from(JSON.stringify({id:orderId,env:environment,exp:now+30*86400000,purpose:'receipt'})).toString('base64url');
 return value+'.'+createHmac('sha256',secret).update(value).digest('base64url');
}
export function verifyReceiptToken(token,environment,secret,now=Date.now()){
 if(!valid(secret)||typeof token!=='string'||token.length>400)return null;
 try{
  const parts=token.split('.');if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))return null;
  const expected=createHmac('sha256',secret).update(parts[0]).digest(),given=Buffer.from(parts[1],'base64url');
  if(given.length!==expected.length||!timingSafeEqual(given,expected))return null;
  const value=JSON.parse(Buffer.from(parts[0],'base64url').toString());
  return value.purpose==='receipt'&&value.env===environment&&uuid(value.id)&&Number.isSafeInteger(value.exp)&&value.exp>now&&value.exp<=now+31*86400000?value.id:null;
 }catch{return null;}
}
