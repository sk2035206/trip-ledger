import {proxyPlanRequest} from '../../../trips/[tripId]/play-plan/proxy';
export async function GET(request:Request,context:{params:Promise<{token:string;path:string[]}>}){const {token,path}=await context.params;return proxyPlanRequest(request,`/api/play-plan-shares/${encodeURIComponent(token)}/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`,'GET');}
