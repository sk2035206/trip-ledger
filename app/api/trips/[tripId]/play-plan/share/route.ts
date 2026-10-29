import {proxyPlanRequest} from '../proxy';
export async function GET(request:Request,context:{params:Promise<{tripId:string}>}){const {tripId}=await context.params;return proxyPlanRequest(request,`/api/trips/${encodeURIComponent(tripId)}/play-plan/share`,'GET');}
