import {proxyPlanRequest} from '../../trips/[tripId]/play-plan/proxy';
export async function GET(request:Request,context:{params:Promise<{token:string}>}){const {token}=await context.params;return proxyPlanRequest(request,`/api/play-plan-shares/${encodeURIComponent(token)}`,'GET');}
