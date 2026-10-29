import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
const purpose='trip-ledger:play-plan-view:v1:';
export const planViewCookieName='trip-ledger-plan-view';
function key(secret:string){return createHash('sha256').update(purpose+secret).digest();}
function validTripId(value:string){return !!value.trim()&&value.length<=64;}
export function createPlanShareToken(tripId:string,secret:string){
 if(!validTripId(tripId))throw new Error('出行ID无效');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);
 const encrypted=Buffer.concat([cipher.update(tripId,'utf8'),cipher.final()]);
 // Authenticated, opaque capability: neither trip IDs nor login credentials appear in the URL.
 return Buffer.concat([Buffer.from([1]),iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function verifyPlanShareToken(input:unknown,secret:string):string|null{
 if(typeof input!=='string'||input.length>400||!/^[A-Za-z0-9_-]+$/.test(input))return null;
 try{
  const bytes=Buffer.from(input,'base64url');if(bytes.length<30||bytes[0]!==1||bytes.toString('base64url')!==input)return null;
  const decipher=createDecipheriv('aes-256-gcm',key(secret),bytes.subarray(1,13));decipher.setAuthTag(bytes.subarray(13,29));
  const plain=Buffer.concat([decipher.update(bytes.subarray(29)),decipher.final()]),tripId=plain.toString('utf8');
  return validTripId(tripId)&&Buffer.from(tripId).equals(plain)?tripId:null;
 }catch{return null;}
}
export function serializePlanViewCookie(token:string,secure:boolean){
 return `${planViewCookieName}=${token}; Path=/_AMapService/; Max-Age=604800; HttpOnly; SameSite=Lax${secure?'; Secure':''}`;
}
export function readPlanViewCookie(request:IncomingMessage):string|undefined{
 return (request.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(planViewCookieName+'='))?.slice(planViewCookieName.length+1);
}
