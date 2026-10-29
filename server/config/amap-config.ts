import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export type AmapSettings = {webKey:string;securityCode:string;serviceKey:string};
export class AmapConfig {
  static load(path = resolve(process.cwd(),'config/amap.json')): AmapSettings {
    let file: Partial<AmapSettings> = {};
    try { file = JSON.parse(readFileSync(path,'utf8')); }
    catch(error) { if (!(error && typeof error==='object' && 'code' in error && error.code==='ENOENT')) throw new Error('高德配置文件无法读取，请检查 JSON 格式'); }
    const config = {webKey:process.env.AMAP_WEB_KEY||file.webKey,securityCode:process.env.AMAP_SECURITY_CODE||file.securityCode,serviceKey:process.env.AMAP_SERVICE_KEY||file.serviceKey};
    for(const key of ['webKey','securityCode','serviceKey'] as const) if(typeof config[key]!=='string'||!/^[a-f\d]{32}$/i.test(config[key]!)) throw new Error('高德配置不完整，请配置 config/amap.json 或对应环境变量');
    return config as AmapSettings;
  }
}
