import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
export class PlayPlanShareConfig {
 static load(path=resolve(process.cwd(),'config/play-plan-share.json')):string{
  const environment=process.env.PLAY_PLAN_SHARE_SECRET;
  if(environment!==undefined)return validate(environment);
  let data:{secret?:unknown};
  try{data=JSON.parse(readFileSync(path,'utf8'));}
  catch(error){
   if(!error||typeof error!=='object'||!('code'in error)||error.code!=='ENOENT')throw new Error('只读分享密钥配置无法读取，请检查 config/play-plan-share.json');
   const created={secret:randomBytes(32).toString('hex')};
   try{writeFileSync(path,JSON.stringify(created)+'\n',{mode:0o600,flag:'wx'});data=created;}
   catch(reason){if(!reason||typeof reason!=='object'||!('code'in reason)||reason.code!=='EEXIST')throw new Error('无法初始化只读分享密钥配置');data=JSON.parse(readFileSync(path,'utf8'));}
  }
  return validate(data.secret);
 }
}
function validate(value:unknown){if(typeof value!=='string'||!/^[a-f\d]{64}$/i.test(value))throw new Error('只读分享密钥需为 64 位十六进制随机值');return value;}
