export function fakePool(){
 const data={trips:new Map([['one',{id:'one',title:'旅行一',dates:'2026-10'}],['two',{id:'two',title:'旅行二',dates:''}]]),plans:new Map(),writes:0,schemas:0,releases:0};let lock=Promise.resolve();
 async function run(sql,values=[],plans=data.plans){
  if(sql.startsWith('CREATE TABLE')){data.schemas++;return [[],[]];}
  if(sql.startsWith('SELECT id,'))return [[data.trips.get(values[0])].filter(Boolean),[]];
  if(sql.startsWith('SELECT plan_json'))return [[plans.get(values[0])].filter(Boolean),[]];
  if(sql.startsWith('INSERT INTO trip_play_plans')){data.writes++;plans.set(values[0],{plan_json:values[1],revision:values[2]});return [[],[]];}
  if(sql.startsWith('UPDATE trip_play_plans')){data.writes++;plans.set(values[2],{plan_json:values[0],revision:values[1]});return [[],[]];}
  throw new Error('Unexpected SQL');
 }
 return {data,execute:run,async getConnection(){let unlock,local;return {
  async beginTransaction(){const previous=lock;lock=new Promise(resolve=>unlock=resolve);await previous;local=new Map(data.plans);},
  execute:(sql,values)=>run(sql,values,local),
  async commit(){data.plans=local;},async rollback(){},release(){data.releases++;unlock();}
 };}};
}
