// Assessment focus monitoring for the coding workspace. Browser-observed signals only (tab visibility, window focus,
// fullscreen), merged so one tab switch counts once: an interruption starts at the first signal and ends when the
// page is visible, focused and (if it was fullscreen before) back in fullscreen or acknowledged. Nothing here blocks
// Esc, OS shortcuts or closing the page; the server stores the events, the client counter is for warnings only.
import {useCallback,useEffect,useRef,useState} from 'react';

export type IntegritySignal='tab_hidden'|'window_blur'|'fullscreen_exit';
export type IntegrityEventType=IntegritySignal|'tab_visible'|'page_reload';
type Emit=(type:IntegrityEventType,payload?:{duration_ms?:number})=>void;

export const fullscreenSupported=()=>typeof document!=='undefined'&&!!document.documentElement.requestFullscreen&&document.fullscreenEnabled!==false;
export const isFullscreen=()=>typeof document!=='undefined'&&!!document.fullscreenElement;
/** Must be called from a user gesture (click). Resolves false when the browser refuses. */
export async function enterFullscreen():Promise<boolean>{
 if(!fullscreenSupported())return false;
 if(isFullscreen())return true;
 try{await document.documentElement.requestFullscreen({navigationUI:'hide'});return true;}catch{return false;}
}

const countKey=(id:string)=>`torque-interruptions:${id}`;
const liveKey=(id:string)=>`torque-workspace-live:${id}`;
const read=(key:string)=>{try{return Number(sessionStorage.getItem(key)||0)||0}catch{return 0}};
const write=(key:string,value:string|null)=>{try{if(value===null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,value)}catch{/* storage may be disabled */}};

/** Clears the reload marker when the candidate leaves the assessment on purpose (finish / end). */
export function endMonitoring(id:string){write(liveKey(id),null);write(countKey(id),null);}

export function useIntegrityMonitor(id:string|undefined,enabled:boolean,emit:Emit){
 const [count,setCount]=useState(()=>id?read(countKey(id)):0);
 const [warning,setWarning]=useState<{count:number;cause:IntegritySignal}|null>(null);
 const [fullscreen,setFullscreen]=useState(isFullscreen());
 const away=useRef<{since:number;cause:IntegritySignal}|null>(null);
 const wasFullscreen=useRef(isFullscreen());
 const emitRef=useRef(emit);emitRef.current=emit;

 useEffect(()=>{
  if(!id||!enabled)return;
  // A reload while the workspace was live is itself an interruption signal (reported, not penalised).
  if(read(liveKey(id)))emitRef.current('page_reload');
  write(liveKey(id),'1');
  const start=(cause:IntegritySignal)=>{
   if(away.current)return; // already interrupted: overlapping signals don't count again
   away.current={since:Date.now(),cause};
   emitRef.current(cause);
   setCount(c=>{const next=c+1;write(countKey(id),String(next));setWarning({count:next,cause});return next;});
  };
  const end=()=>{
   if(!away.current||document.hidden||!document.hasFocus())return;
   const duration_ms=Math.max(0,Date.now()-away.current.since);away.current=null;
   emitRef.current('tab_visible',{duration_ms});
  };
  const onVisibility=()=>{if(document.hidden)start('tab_hidden');else end();};
  // Focus moving to the browser chrome or another app; ignored while the page is hidden (already counted).
  const onBlur=()=>{setTimeout(()=>{if(!document.hasFocus()&&!document.hidden)start('window_blur');},150);};
  const onFocus=()=>end();
  const onFullscreen=()=>{
   const now=isFullscreen();setFullscreen(now);
   if(wasFullscreen.current&&!now)start('fullscreen_exit');
   if(now&&away.current?.cause==='fullscreen_exit')end();
   wasFullscreen.current=now;
  };
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('blur',onBlur);window.addEventListener('focus',onFocus);document.addEventListener('fullscreenchange',onFullscreen);
  return()=>{document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('blur',onBlur);window.removeEventListener('focus',onFocus);document.removeEventListener('fullscreenchange',onFullscreen);};
 },[id,enabled]);

 /** The candidate acknowledged the warning (and, from the click, may re-enter fullscreen). */
 const acknowledge=useCallback(async(refullscreen:boolean)=>{
  if(refullscreen)await enterFullscreen();
  setWarning(null);
  // A fullscreen exit ends when the candidate returns to the assessment, whether or not fullscreen is restored.
  if(away.current&&away.current.cause==='fullscreen_exit'&&!document.hidden){const duration_ms=Date.now()-away.current.since;away.current=null;emitRef.current('tab_visible',{duration_ms});}
 },[]);
 return {count,warning,fullscreen,acknowledge};
}
