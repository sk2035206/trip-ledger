import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Modal} from './Modal';import {Icon} from './Icon';
import {standaloneApi,type GuideApi} from '../adapters/api';
import {typeLabels,type Place,type PlaceType,type SearchPlace} from '../domain/types';
export interface SearchContext {query:string;city:string;type:PlaceType;replaceId?:string}
export function SearchDialog({context,onClose,onChoose,api=standaloneApi,savedPlaces=[],onChooseSaved}:{
 context:SearchContext;api?:GuideApi;onClose:()=>void;
 onChoose:(place:SearchPlace,type:PlaceType,target:'day'|'saved')=>void;
 savedPlaces?:Place[];onChooseSaved?:(placeId:string)=>void;
}){
 const [source,setSource]=useState<'search'|'saved'>('search'),[savedQuery,setSavedQuery]=useState('');
 const [query,setQuery]=useState(context.query),[city,setCity]=useState(context.city),[type,setType]=useState(context.type),[results,setResults]=useState<SearchPlace[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false);
 const controller=useRef<AbortController|null>(null);useEffect(()=>()=>controller.current?.abort(),[]);
 function changeSource(next:'search'|'saved'){if(loading){controller.current?.abort();setLoading(false);setSearched(false);}setSource(next);}
 async function search(event:FormEvent){
  event.preventDefault();controller.current?.abort();const current=new AbortController();controller.current=current;setLoading(true);setError('');setSearched(true);setResults([]);
  try{const places=await api.searchPlaces(query.trim(),city.trim(),current.signal);if(!current.signal.aborted)setResults(places);}
  catch(error){if(!current.signal.aborted)setError(error instanceof Error?error.message:'搜索失败');}
  finally{if(!current.signal.aborted)setLoading(false);}
 }
 const filteredSaved=savedPlaces.filter(place=>`${place.name} ${place.city} ${place.address||''}`.toLocaleLowerCase().includes(savedQuery.trim().toLocaleLowerCase()));
 return <Modal title={context.replaceId?'确认具体位置':'添加当天地点'} wide onClose={onClose}>
  {!context.replaceId&&onChooseSaved&&<div className="modal-source-tabs" aria-label="添加地点来源"><button className={source==='search'?'active':''} aria-pressed={source==='search'} onClick={()=>changeSource('search')}><Icon name="search" size={16}/>搜索新地点</button><button className={source==='saved'?'active':''} aria-pressed={source==='saved'} onClick={()=>changeSource('saved')}><Icon name="pin" size={16}/>从待选添加（{savedPlaces.length}）</button></div>}
  {source==='saved'&&onChooseSaved?<>
   <p className="muted search-intro">选择待选地点加入当天，收藏仍会保留，其他日期也可以再次使用。</p>
   <label className="saved-search-label">筛选待选地点<input value={savedQuery} onChange={event=>setSavedQuery(event.target.value)} placeholder="按名称、城市或地址筛选" maxLength={100}/></label>
   <div className="search-results">
    {!filteredSaved.length&&<div className="empty-state"><Icon name="pin" size={36}/><h3>{savedPlaces.length?'没有匹配的待选地点':'还没有待选地点'}</h3><p>可以先搜索地点并存入待选，或直接搜索加入当天。</p><button className="button" onClick={()=>changeSource('search')}>搜索新地点</button></div>}
    {filteredSaved.map(place=><article className="search-result" key={place.id}><span className={`place-icon ${place.type}`}><Icon name={place.type==='sight'?'mountain':place.type}/></span><div><h3>{place.name}</h3><p>{place.city} · {typeLabels[place.type]}</p><small>{place.locationStatus==='confirmed'?place.address||'位置已确认':'位置待确认，加入后可继续定位'}</small><div className="result-actions"><button className="button small primary" onClick={()=>onChooseSaved(place.id)}>加入当天</button></div></div></article>)}
   </div>
  </>:<>
   <p className="muted search-intro">选择具体分店或景区入口，确认后加入地图。</p>
   <form className="search-form" onSubmit={search}><label>搜索城市<input value={city} onChange={event=>{setCity(event.target.value);setResults([]);setSearched(false);controller.current?.abort();setLoading(false);}} maxLength={80} required placeholder="长沙 / 张家界"/></label><label className="search-keyword">地点名称<div className="input-icon"><Icon name="search" size={18}/><input value={query} onChange={event=>{setQuery(event.target.value);setResults([]);setSearched(false);controller.current?.abort();setLoading(false);}} maxLength={100} required placeholder="搜索景点、餐厅、酒店…"/></div></label><button className="button primary" disabled={loading}>{loading?'搜索中…':'搜索地点'}</button></form>
   <div className="search-type"><span>添加为</span>{Object.entries(typeLabels).map(([key,label])=><button key={key} className={`chip ${type===key?'active':''}`} aria-pressed={type===key} onClick={()=>setType(key as PlaceType)}>{label}</button>)}</div>
   <div className="search-results" aria-live="polite">
    {loading&&<div className="empty-state"><span className="spinner"/><p>正在寻找合适的地点…</p></div>}
    {error&&<div className="notice error"><Icon name="info"/><p>{error}</p></div>}
    {!loading&&!error&&!results.length&&<div className="empty-state"><Icon name="search" size={36}/><h3>{searched?'没有找到匹配地点':'从一个想去的地方开始'}</h3><p>{searched?'试试缩短名称，或更换搜索城市。':'搜索不会自动选择结果，请核对地址后确认。'}</p></div>}
    {results.map(place=><article className="search-result" key={place.id}><span className={`place-icon ${type}`}><Icon name={type==='sight'?'mountain':type}/></span><div><h3>{place.name}</h3><p>{place.city} · {place.address||'暂未提供详细地址'}</p><small>{place.category}</small><div className="result-actions"><button className="button small primary" onClick={()=>onChoose(place,type,'day')}>{context.replaceId?'确认此位置':'加入当天'}</button>{!context.replaceId&&<button className="button small" onClick={()=>onChoose(place,type,'saved')}>存入待选</button>}</div></div></article>)}
   </div>
  </>}
 </Modal>;
}
