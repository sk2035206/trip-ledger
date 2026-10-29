import type {TripPlan} from './types';
export type PlanSyncStatus = {state:'idle'|'saving'|'saved'|'error'|'conflict';message:string};
export class PlanSyncController {
 private pending:TripPlan|null=null;private running=false;private blocked=false;private stopped=false;private conflict=false;
 constructor(private revision:string,private saveRemote:(plan:TripPlan,revision:string)=>Promise<{revision:string}>,private emit:(status:PlanSyncStatus)=>void){}
 enqueue(plan:TripPlan){this.pending=plan;if(!this.blocked&&!this.stopped)void this.drain();}
 retry(){if(this.stopped||this.running||this.conflict)return;this.blocked=false;void this.drain();}
 dispose(){this.stopped=true;this.pending=null;}
 private async drain(){
  if(this.running||this.blocked||this.stopped||!this.pending)return;
  this.running=true;this.emit({state:'saving',message:'正在保存到共享计划…'});
  try{
   while(this.pending&&!this.stopped){
    const snapshot=this.pending;this.pending=null;
    try{const result=await this.saveRemote(snapshot,this.revision);if(!result.revision)throw new Error('保存响应缺少版本');this.revision=result.revision;}
    catch(error){if(this.stopped)return;this.pending??=snapshot;this.blocked=true;const conflict=error&&typeof error==='object'&&'status'in error&&[409,428].includes(Number(error.status));this.conflict=Boolean(conflict);this.emit({state:conflict?'conflict':'error',message:error instanceof Error?error.message:'计划尚未保存，请重试'});return;}
   }
   if(!this.stopped)this.emit({state:'saved',message:'已保存，可跨设备查看'});
  }finally{this.running=false;}
 }
}
