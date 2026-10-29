import {proxyPlanRequest} from './proxy';
type Context={params:Promise<{tripId:string}>};
export async function GET(request:Request,context:Context){const {tripId}=await context.params;return proxyPlanRequest(request,`/api/trips/${encodeURIComponent(tripId)}/play-plan`,'GET');}
export async function PUT(request:Request,context:Context){const {tripId}=await context.params;return proxyPlanRequest(request,`/api/trips/${encodeURIComponent(tripId)}/play-plan`,'PUT');}
