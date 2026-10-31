import { ApiError } from './api-error.mjs';
export { ApiError };

// __DEMO_BUILD__ is replaced by Vite (vite.config.ts): false for every production build, so the preview
// adapter and its sample data are dead code there. Plain Node tests have no define and may opt in.
// eslint-disable-next-line no-undef
const DEMO_BUILD = typeof __DEMO_BUILD__ === 'undefined' ? true : __DEMO_BUILD__;
const storage = name => { try { return globalThis[name]; } catch { return null; } };
export const demoAvailable = () => DEMO_BUILD;
// Live is the default and, in production, the only mode.
export const getMode = () => DEMO_BUILD && storage('localStorage')?.getItem('torque-mode') === 'demo' ? 'demo' : 'live';
export function setMode(mode) {
  if (!['demo', 'live'].includes(mode)) throw new TypeError('Mode must be demo or live.');
  if (mode === 'demo' && !DEMO_BUILD) throw new TypeError('The interactive preview is not part of this build.');
  storage('localStorage')?.setItem('torque-mode', mode);
}
const preview = () => import('./demo-adapter.mjs');
export async function resetDemo() { if (DEMO_BUILD) (await preview()).resetDemo(); }
export async function finishDemo() {
  if (!DEMO_BUILD || getMode() !== 'demo') throw new ApiError('PREVIEW_ONLY', 'Finishing early is only available in the interactive preview.', 403);
  return (await preview()).finishDemo();
}

export async function api(method, path, body) {
  method=method.toUpperCase();
  if (!path.startsWith('/') || path.startsWith('//')) throw new TypeError('Use a relative API endpoint beginning with one slash.');
  if (DEMO_BUILD && getMode()==='demo') {
    const { simulate } = await preview();
    await new Promise(resolve=>setTimeout(resolve,method==='GET'?350:550));
    return structuredClone(await simulate(method,path,body));
  }
  let response;
  try {
    response=await fetch('/api'+path,{method,credentials:'include',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  } catch {
    throw new ApiError('NETWORK_ERROR','The backend could not be reached. Check that it is running, then try again.',0);
  }
  if (response.status===204) return undefined;
  let data;
  try { data=await response.json(); }
  catch { throw new ApiError('INVALID_RESPONSE','The backend returned an unexpected response. Please try again.',response.status); }
  if (!response.ok) {
    const problem=data?.error || {};
    const retry=Number(response.headers?.get?.('Retry-After'));
    throw new ApiError(problem.code||'REQUEST_FAILED',problem.message||'The request could not be completed.',response.status,problem.fields||[],problem.request_id,Number.isFinite(retry)&&retry>0?retry:null);
  }
  return data;
}

// For a page that is being hidden or unloaded: a keepalive request outlives the document, so queued integrity
// events still reach the backend when the candidate reloads, closes or switches away (context §8).
export function sendOnLeave(path, body) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new TypeError('Use a relative API endpoint beginning with one slash.');
  if (DEMO_BUILD && getMode()==='demo') return api('POST', path, body);
  return fetch('/api'+path,{method:'POST',credentials:'include',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(response=>{if(!response.ok)throw new ApiError('REQUEST_FAILED','The request could not be completed.',response.status);});
}
