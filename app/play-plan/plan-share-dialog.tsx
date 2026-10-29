'use client';
import {useRef,useState} from 'react';
import {Modal} from '@/modules/travel-guide/src/components/Modal';
export function PlanShareDialog({url,title,onClose}:{url:string;title:string;onClose:()=>void}){
 const input=useRef<HTMLInputElement>(null);const [message,setMessage]=useState('');
 async function copy(){try{await navigator.clipboard.writeText(url);setMessage('只读分享链接已复制');}catch{input.current?.focus();input.current?.select();setMessage('请长按或使用复制快捷键，复制上方链接');}}
 async function share(){if(/MicroMessenger/i.test(navigator.userAgent)){setMessage('请点击微信右上角，分享给好友或朋友圈');return;}try{if(navigator.share){await navigator.share({title,url});return;}await copy();}catch(error){if(!(error instanceof Error&&error.name==='AbortError'))await copy();}}
 return <Modal title="分享只读游玩计划" onClose={onClose}><p className="muted">通过链接可以查看这份游玩计划、地图和路线，不需要登录。页面只提供查看功能。</p><label className="plan-share-link">只读链接<input ref={input} readOnly value={url} onFocus={event=>event.target.select()}/></label>{message&&<p className="plan-share-message" role="status">{message}</p>}<div className="modal-actions"><button className="button" onClick={()=>{window.location.href=url;}}>打开只读页</button><button className="button" onClick={share}>系统分享</button><button className="button primary" onClick={copy}>复制链接</button></div></Modal>;
}
