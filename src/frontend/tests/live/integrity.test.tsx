import {act,renderHook} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useIntegrityMonitor} from '../../src/integrity';

let hidden=false,focused=true,fullscreen:Element|null=null;
Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>fullscreen});
document.hasFocus=()=>focused;
const fire=(target:EventTarget,type:string)=>act(()=>{target.dispatchEvent(new Event(type));});
const leaveTab=async()=>{hidden=true;focused=false;fire(window,'blur');fire(document,'visibilitychange');await act(()=>vi.advanceTimersByTimeAsync(200));};
const comeBack=async()=>{hidden=false;focused=true;fire(document,'visibilitychange');fire(window,'focus');await act(()=>vi.advanceTimersByTimeAsync(10));};
afterEach(()=>{vi.useRealTimers();sessionStorage.clear();hidden=false;focused=true;fullscreen=null;});

describe('assessment focus monitor',()=>{
 it('counts one tab switch once, even when hidden and blur both fire, and records time away',async()=>{
  vi.useFakeTimers();
  const emitted:{type:string;payload?:{duration_ms?:number}}[]=[];
  const {result}=renderHook(()=>useIntegrityMonitor('a1',true,(type,payload)=>emitted.push({type,payload})));
  await leaveTab();
  expect(result.current.count).toBe(1);
  expect(result.current.warning).toMatchObject({count:1,cause:'tab_hidden'});
  await act(()=>vi.advanceTimersByTimeAsync(4000));
  await comeBack();
  expect(emitted.map(e=>e.type)).toEqual(['tab_hidden','tab_visible']);
  expect(emitted[1]!.payload!.duration_ms).toBeGreaterThanOrEqual(4000);
  await act(()=>result.current.acknowledge(false));
  await leaveTab();await comeBack();await leaveTab();await comeBack();
  expect(result.current.count).toBe(3);
  expect(result.current.warning!.count).toBe(3);
 });

 it('records a fullscreen exit as its own interruption and ends it when the candidate returns',async()=>{
  vi.useFakeTimers();
  fullscreen=document.documentElement;
  const emitted:string[]=[];
  const {result}=renderHook(()=>useIntegrityMonitor('a2',true,type=>emitted.push(type)));
  fullscreen=null;fire(document,'fullscreenchange');
  expect(result.current.warning).toMatchObject({count:1,cause:'fullscreen_exit'});
  await act(()=>result.current.acknowledge(false));
  expect(emitted).toEqual(['fullscreen_exit','tab_visible']);
 });

 it('reports a reload of a live workspace once, and nothing while disabled',()=>{
  const first:string[]=[],second:string[]=[],off:string[]=[];
  renderHook(()=>useIntegrityMonitor('a3',true,type=>first.push(type))).unmount();
  renderHook(()=>useIntegrityMonitor('a3',true,type=>second.push(type))).unmount();
  renderHook(()=>useIntegrityMonitor('a4',false,type=>off.push(type)));
  expect(first).toEqual([]);expect(second).toEqual(['page_reload']);expect(off).toEqual([]);
 });
});
