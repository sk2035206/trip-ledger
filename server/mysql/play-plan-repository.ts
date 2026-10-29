import {createHash} from 'node:crypto';
import type {Pool,RowDataPacket} from 'mysql2/promise';
import {parsePlan} from '../../frontend/travel-guide/plan';
import type {TripPlan} from '../../frontend/travel-guide/types';
import {getMysqlPool} from './pool';
export class PlayPlanError extends Error {constructor(message:string,public readonly status:number){super(message);}}
export const playPlanSchema = `CREATE TABLE IF NOT EXISTS trip_play_plans (
  trip_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '关联出行账本ID',
  plan_json JSON NOT NULL COMMENT '游玩计划结构，包含每日安排、地点和收藏',
  revision VARCHAR(64) NOT NULL COMMENT '计划内容版本，用于并发冲突校验',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后内容更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出行游玩计划表'`;
type TripRow = RowDataPacket & {id:string;title:string;dates:string|null};
type PlanRow = RowDataPacket & {plan_json:unknown;revision:string};
export function planRevision(plan:TripPlan){return createHash('sha256').update(JSON.stringify({...parsePlan(plan),updatedAt:undefined})).digest('hex');}
function decode(row:PlanRow|undefined){return row?parsePlan(typeof row.plan_json==='string'?JSON.parse(row.plan_json):row.plan_json):null;}
function parseInput(plan:unknown){try{return parsePlan(plan);}catch(error){throw new PlayPlanError(error instanceof Error?error.message:'计划内容无效',400);}}
export function createPlayPlanRepository(pool:Pick<Pool,'getConnection'|'execute'>){
 let schema:Promise<void>|undefined;
 async function ensure(){schema??=pool.execute(playPlanSchema).then(()=>{}).catch(error=>{schema=undefined;throw error;});return schema;}
 return {
  ensure,
  async get(tripId:string){
   await ensure();
   const [trips]=await pool.execute<TripRow[]>('SELECT id, title, dates FROM trips WHERE id = ?',[tripId]);
   if(!trips[0])throw new PlayPlanError('出行不存在或已被删除',404);
   const [rows]=await pool.execute<PlanRow[]>('SELECT plan_json, revision FROM trip_play_plans WHERE trip_id = ?',[tripId]);
   return {trip:{id:trips[0].id,title:trips[0].title,dates:trips[0].dates||''},plan:decode(rows[0]),revision:rows[0]?.revision||'empty'};
  },
  async save(tripId:string,input:unknown,revision:unknown){
   const plan=parseInput(input);
   if(typeof revision!=='string'||!revision)throw new PlayPlanError('缺少计划版本，请重新读取后保存',428);
   await ensure();const connection=await pool.getConnection();
   try{
    await connection.beginTransaction();
    // The existing trip row serializes first creation too, when there is no plan row to lock yet.
    const [trips]=await connection.execute<TripRow[]>('SELECT id, title, dates FROM trips WHERE id = ? FOR UPDATE',[tripId]);
    if(!trips[0])throw new PlayPlanError('出行不存在或已被删除',404);
    const [rows]=await connection.execute<PlanRow[]>('SELECT plan_json, revision FROM trip_play_plans WHERE trip_id = ? FOR UPDATE',[tripId]);
    const current=rows[0]?.revision||'empty';
    if(revision!==current)throw new PlayPlanError('游玩计划已被其他设备修改，本次修改未保存。请先导出草稿，再读取最新计划。',409);
    const nextRevision=planRevision(plan);
    if(nextRevision!==current){
     if(rows[0])await connection.execute('UPDATE trip_play_plans SET plan_json = ?, revision = ? WHERE trip_id = ?',[JSON.stringify(plan),nextRevision,tripId]);
     else await connection.execute('INSERT INTO trip_play_plans (trip_id, plan_json, revision) VALUES (?, ?, ?)',[tripId,JSON.stringify(plan),nextRevision]);
    }
    await connection.commit();return {revision:nextRevision};
   }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }
 };
}
let repository:ReturnType<typeof createPlayPlanRepository>|undefined;
export function getPlayPlanRepository(){return repository??=createPlayPlanRepository(getMysqlPool());}
