import type {TripPlan} from './types';
import {uid} from './plan';
export function createEmptyPlan(title:string,city:string,dayCount:number):TripPlan{
 if(!city.trim()||city.length>80)throw new Error('请填写目的地城市');
 if(!Number.isInteger(dayCount)||dayCount<1||dayCount>60)throw new Error('行程天数需为 1—60 天');
 return {schemaVersion:1,id:uid(),title:`${title.slice(0,140)} · 游玩计划`,places:[],savedPlaceIds:[],updatedAt:new Date().toISOString(),days:Array.from({length:dayCount},(_,i)=>({id:uid(),title:`第 ${i+1} 天`,subtitle:'',defaultSearchCity:city.trim(),stops:[]}))};
}
