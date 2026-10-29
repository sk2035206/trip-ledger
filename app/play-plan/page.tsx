import {PlayPlanViewer} from './play-plan-viewer';
export const dynamic='force-dynamic';
export default async function PlayPlanPage({searchParams}:{searchParams:Promise<{tripId?:string}>}){
 const {tripId=''}=await searchParams;
 return <PlayPlanViewer tripId={tripId}/>;
}
