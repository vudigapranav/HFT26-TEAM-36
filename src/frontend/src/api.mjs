import { samplePortfolio, demoTasks, quizBank } from './demo-data.mjs';

// The preview adapter is deliberately separate from live requests. It never runs code,
// computes a candidate grade, or falls back to sample data after a live API failure.
const KEY = 'torquecode-preview-v1';
const clone = value => structuredClone(value);
const storage = name => { try { return globalThis[name]; } catch { return null; } };
const read = () => { try { return JSON.parse(storage('sessionStorage')?.getItem(KEY) || 'null') || {}; } catch { return {}; } };
let demo = read();
const persist = () => { try { storage('sessionStorage')?.setItem(KEY, JSON.stringify(demo)); } catch { /* Private browsing can disable storage. */ } };
const id = () => globalThis.crypto?.randomUUID?.() || `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export class ApiError extends Error {
  constructor(code, message, status = 400, fields = [], request_id = 'preview') {
    super(message); this.name = 'ApiError'; this.code = code; this.status = status;
    this.fields = fields; this.request_id = request_id;
  }
}
const fail = (code, message, status = 400, fields) => { throw new ApiError(code, message, status, fields); };
export const getMode = () => storage('localStorage')?.getItem('torque-mode') === 'live' ? 'live' : 'demo';
export function setMode(mode) {
  if (!['demo', 'live'].includes(mode)) throw new TypeError('Mode must be demo or live.');
  storage('localStorage')?.setItem('torque-mode', mode);
}
export function resetDemo() { demo = {}; persist(); }
export function finishDemo() {
  if (getMode() !== 'demo') fail('PREVIEW_ONLY', 'Finishing early is only available in the interactive preview.', 403);
  if (!demo.assessment) fail('NOT_FOUND', 'Start a preview assessment first.', 404);
  demo.assessment.status = 'finished'; persist(); return publicState();
}
const knownTopics = ['arrays','strings','hashing','two_pointers','sliding_window','stack','queue','binary_search','sorting','recursion','linked_list','trees','bfs_dfs','graphs','heap','greedy','dp','trie','union_find'];
function validatePortfolio(body) {
  const fields = [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const keys = (value, allowed, prefix) => {
    if (!object(value)) { fields.push({ path: prefix || 'portfolio', message: 'Expected an object.' }); return false; }
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fields.push({ path: `${prefix ? prefix + '.' : ''}${key}`, message: 'This field is not part of the portfolio format.' });
    return true;
  };
  const text = (value, path, max) => { if (typeof value !== 'string' || !value.trim() || value.length > max) fields.push({path, message: `Enter text between 1 and ${max} characters.`}); };
  const array = (value, path, max, length = 100) => {
    if (!Array.isArray(value) || value.length > max) { fields.push({path, message:`Add a list with at most ${max} items.`}); return; }
    value.forEach((item, i) => text(item, `${path}[${i}]`, length));
  };
  if (keys(body, ['candidate','projects','tech_stack','skills','dsa_topics_solved'], '')) {
    if (keys(body.candidate, ['name','email'], 'candidate')) {
      text(body.candidate.name, 'candidate.name', 120);
      if (typeof body.candidate.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.candidate.email) || body.candidate.email.length > 254) fields.push({path:'candidate.email',message:'Enter a valid email address.'});
    }
    if (!Array.isArray(body.projects) || body.projects.length > 20) fields.push({path:'projects',message:'Add a list of up to 20 projects.'});
    else body.projects.forEach((project, i) => {
      const p = `projects[${i}]`;
      if (keys(project, ['name','description','tech_stack','role','highlights'], p)) {
        text(project.name, p+'.name', 120); text(project.description,p+'.description',4000);
        text(project.role,p+'.role',200); array(project.tech_stack,p+'.tech_stack',30,60); array(project.highlights,p+'.highlights',20,1000);
      }
    });
    array(body.tech_stack,'tech_stack',50,60); array(body.skills,'skills',50,100); array(body.dsa_topics_solved,'dsa_topics_solved',50,60);
  }
  if (fields.length) fail('INVALID_PORTFOLIO','Please fix the highlighted portfolio fields.',422,fields);
  const aliases = { 'array':'arrays', 'hash map':'hashing', 'hash maps':'hashing', 'hashmap':'hashing', 'sliding window':'sliding_window', 'two pointers':'two_pointers', 'binary search':'binary_search', 'dynamic programming':'dp', 'linked list':'linked_list' };
  const topics = [...new Set(body.dsa_topics_solved.map(t => aliases[t.toLowerCase().trim()] || t.toLowerCase().trim().replaceAll(' ', '_')).filter(t=>knownTopics.includes(t)))];
  if (!topics.length) fail('INVALID_PORTFOLIO','Add at least one recognized DSA topic.',422,[{path:'dsa_topics_solved',message:'Try arrays, hashing, or sliding_window.'}]);
  const warnings = body.dsa_topics_solved.length !== topics.length ? ['Some topics were normalized or omitted from the supported topic list.'] : [];
  const raw = JSON.stringify(body);
  const injection_flags = /ignore (all |previous |the )?instructions|system prompt|you are now|reveal.*secret/i.test(raw) ? ['instruction_like_portfolio_text'] : [];
  const profile = {domain:'backend',domain_confidence:0.93,claimed_topics:topics,tech_stack:body.tech_stack,skills:body.skills};
  // Domain detection in this adapter is illustrative; live mode uses the actual backend.
  demo.portfolio = clone(body); demo.profile = clone(profile); persist();
  return {profile,warnings,injection_flags};
}
function questions() {
  const topics = demo.profile?.claimed_topics || [];
  return quizBank.map(q=>({id:q.id,prompt:q.text,options:q.options.filter(o=> {
    const p=o.points_to || {};
    if (p.domains?.length && !p.domains.includes(demo.profile?.domain)) return false;
    if (!p.domains?.length && p.topics?.length && !p.topics.some(t=>topics.includes(t))) return false;
    return true;
  }).map(o=>({id:o.id,text:o.text}))})).filter(q=>q.options.length>1).slice(0,10);
}
function publicState() {
  const a = demo.assessment;
  if (!a) fail('NOT_FOUND','This preview assessment was not found.',404);
  const remaining_sec = Math.max(0,Math.min(3600,Math.ceil((Date.parse(a.expires_at)-Date.now())/1000)));
  if (!remaining_sec) a.status = 'finished';
  const ids = a.available;
  return {assessment_id:a.assessment_id,report_id:`report-${a.assessment_id}`,task_id:ids.at(-1),available_task_ids:[...ids],questions:ids.map(task_id=>({task_id,assistant_enabled:task_id!=='question-1'})),unlock_available:a.status==='active' && remaining_sec>0 && a.unlocks_used<2 && !!a.submitted[ids.at(-1)] && canOffer(a.unlocks_used+2),unlocks_used:a.unlocks_used,status:a.status,started_at:a.started_at,expires_at:a.expires_at,remaining_sec,policy_todos:[],runner:'isolated',runner_available:true};
}
function canOffer(number) { return demoTasks[number-1]?.dsa_topics.every(t=>demo.profile?.claimed_topics.includes(t)); }
function assessment(assessmentId, active = false) {
  const a=demo.assessment;
  if (!a || a.assessment_id!==assessmentId) fail('NOT_FOUND','This assessment was not found.',404);
  const state=publicState();
  if (active && state.status!=='active') fail('ASSESSMENT_FINISHED','This assessment has finished. Open your report.',409);
  return a;
}
function taskFor(a, taskId) {
  if (!a.available.includes(taskId)) fail('TASK_LOCKED','This question is not available yet.',403);
  const task=demoTasks.find(t=>t.task_id===taskId);
  if (!task) fail('NOT_FOUND','Question not found.',404);
  return {...clone(task),files:clone(a.files[taskId]||task.files)};
}
function sampleReport(report_id) {
  return {
    report_id,session_id:demo.assessment?.assessment_id || 'sample',final_score:78,
    outcome:'A sample of the evidence-led report: solid practical foundations, with room to strengthen boundary cases.',
    tasks:[{task_id:'question-1',passed:4,total:5,time_sec:720,hints_used:0,aie:null},{task_id:'question-2',passed:4,total:5,time_sec:1080,hints_used:1,aie:{score:14,max:20,independence:0.8,hint_yield:0.4,test_discipline:0.9,gate:1}},{task_id:'question-3',passed:4,total:5,time_sec:1320,hints_used:1,aie:{score:14,max:20,independence:0.8,hint_yield:0.4,test_discipline:0.9,gate:1}}],
    focus_areas:['Check boundary cases before submitting.','Run visible tests after meaningful code changes.','Trace repeated records and ordering rules with a tiny example.'],
    integrity_signals:[{type:'tab_hidden',count:2},{type:'paste',count:1}]
  };
}
async function simulate(method,path,body) {
  if (method==='POST' && ['/auth/register','/auth/login'].includes(path)) {
    if (!body || typeof body.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || typeof body.password!=='string' || body.password.length<12 || body.password.length>128) fail('INVALID_CREDENTIALS','Enter a valid email and a password of 12–128 characters.',400);
    const user={user_id:'00000000-0000-4000-8000-000000000001',email:body.email};
    if (path.endsWith('/register')) {
      if ((demo.registered||[]).includes(body.email)) fail('EMAIL_EXISTS','An account with this email already exists. Sign in instead.',409);
      demo.registered=[...(demo.registered||[]),body.email]; persist(); return {user};
    }
    demo.user=user; persist(); return {user};
  }
  if (path==='/auth/me' && method==='GET') {
    if (!demo.user) fail('UNAUTHENTICATED','Sign in to continue.',401);
    return {user:clone(demo.user)};
  }
  if (path==='/auth/logout' && method==='POST') { delete demo.user; persist(); return undefined; }
  if (!demo.user) fail('UNAUTHENTICATED','Sign in to continue.',401);
  if (path==='/portfolio' && method==='POST') return validatePortfolio(body);
  if (path==='/onboarding-quiz') {
    if (!demo.profile) fail('PORTFOLIO_REQUIRED','Upload your portfolio first.',409);
    if (method==='GET') return {questions:questions()};
    if (method==='POST') {
      const offered=questions();
      if (!Array.isArray(body?.answers) || new Set(body.answers.map(a=>a.question_id)).size!==body.answers.length || body.answers.some(a=>!offered.some(q=>q.id===a.question_id && q.options.some(o=>o.id===a.option_id)))) fail('INVALID_QUIZ_ANSWER','Choose one of the available answers for each question.',400);
      demo.focus_lane={domain:demo.profile.domain,skills:[...demo.profile.skills],topics:[...demo.profile.claimed_topics]}; persist(); return {focus_lane:clone(demo.focus_lane)};
    }
  }
  if (path==='/assessments' && method==='POST') {
    if (!demo.profile) fail('PORTFOLIO_REQUIRED','Upload your portfolio first.',409);
    if (!canOffer(1)) fail('SEED_TOPIC_UNAVAILABLE','No starting question is available for these claimed topics. Try the sample portfolio in preview mode.',422);
    if (demo.assessment && publicState().status==='active') fail('ASSESSMENT_ACTIVE','You already have an active assessment. Resume it to continue.',409);
    const started=Date.now();
    demo.assessment={assessment_id:id(),started_at:new Date(started).toISOString(),expires_at:new Date(started+3600000).toISOString(),available:['question-1'],unlocks_used:0,status:'active',submitted:{},files:{},runs:{},hints:{},events:[]};
    persist(); return publicState();
  }
  const match=path.match(/^\/assessments\/([^/]+)\/(.+)$/);
  if (match) {
    const [,assessmentId,tail]=match;
    const a=assessment(assessmentId,method!=='GET');
    if (tail==='status' && method==='GET') return publicState();
    if (tail==='tier/upgrade' && method==='POST') {
      if (!publicState().unlock_available) fail('UNLOCK_NOT_AVAILABLE','Submit every question in the current set before unlocking more.',409);
      a.unlocks_used++; a.available.push(`question-${a.unlocks_used+1}`); persist(); return publicState();
    }
    const taskMatch=tail.match(/^tasks\/([^/]+)(?:\/(files|run|submit))?$/);
    if (taskMatch) {
      const [,taskId,action]=taskMatch;
      const task=taskFor(a,taskId);
      if (!action && method==='GET') return task;
      const save = () => {
        const editable=task.files.filter(f=>f.editable);
        if (!Array.isArray(body?.files) || body.files.length!==editable.length || new Set(body.files.map(f=>f.path)).size!==editable.length || body.files.some(f=>f.editable!==true || typeof f.content!=='string' || f.content.length>65536 || !editable.some(e=>e.path===f.path))) fail('INVALID_FILES','Only the editable task files may be saved.',400);
        a.files[taskId]=task.files.map(f=>f.editable ? clone(body.files.find(s=>s.path===f.path)) : f); persist();
      };
      if (action==='files' && method==='PUT') { save(); return {ok:true}; }
      if (['run','submit'].includes(action) && method==='POST') {
        if (body?.files) save();
        a.runs[taskId]=(a.runs[taskId]||0)+1;
        const allPass=a.runs[taskId]>1;
        const visible=task.visible_tests.map((t,i)=>({id:t.id,status:!allPass && i===0 ? 'fail' : 'pass',duration_ms:8+i*3}));
        const visiblePassed=visible.filter(t=>t.status==='pass').length;
        const hidden=action==='submit' ? {passed:taskId==='question-1'?2:4,total:taskId==='question-1'?3:6} : null;
        const result={run_id:id(),task_id:taskId,mode:action,visible,hidden,passed:visiblePassed+(hidden?.passed||0),total:visible.length+(hidden?.total||0),stdout:action==='run'?'Illustrative preview result. Python is not executed in preview mode.':'',stderr:'',timed_out:false};
        if (action==='submit') a.submitted[taskId]=clone(result);
        persist(); return result;
      }
    }
    if (['hint','assistant'].includes(tail) && method==='POST') {
      const taskId=body?.task_id || a.available.at(-1);
      const task=taskFor(a,taskId);
      if (!task.assistant_enabled) fail('ASSISTANCE_DISABLED','Assistance is not enabled for this question.',403);
      if (tail==='hint') {
        const level=(a.hints[taskId]||0)+1;
        if (level>3) fail('HINTS_EXHAUSTED','You have used every available hint for this question.',409);
        a.hints[taskId]=level; persist();
        const hints=taskId==='question-2' ? ['Trace a tiny batch with a repeated event ID. Which delivery should represent it?','Think about how to replace a record without changing its first-seen position.','Once the retained records are correct, count their owners and consider the required ordering.'] : ['Trace the parsed request positions and the meaning of an exclusive end.','Keep track of which error codes are inside the current window. What changes when the left edge moves?','Consider whether any growing part of the input is repeatedly copied or scanned.'];
        return {level,text:hints[level-1]};
      }
      if (typeof body?.message!=='string' || !body.message.trim() || body.message.length>2000 || (body.history && (!Array.isArray(body.history) || body.history.length>12))) fail('INVALID_MESSAGE','Write a message between 1 and 2,000 characters.',400);
      if (/write.*(solution|code)|give.*(solution|answer)|complete.*(code|implementation)|hidden test|system prompt|ignore.*instruction/i.test(body.message)) return {blocked:true,reason:'I can help you reason about this task, but I cannot provide a complete solution or hidden test details.'};
      return {blocked:false,reply:taskId==='question-2'?'Which delivery should represent an event when the same ID arrives more than once? Trace a tiny batch and compare your retained records. Then check whether the order of retained IDs stays stable.':'Trace a short example and write down the left edge, exclusive right edge, and code frequencies after each step. Which information can you update without scanning the entire window again?'};
    }
    if (tail==='events' && method==='POST') {
      if (!Array.isArray(body?.events) || body.events.length>100 || body.events.some(e=>!a.available.includes(e.task_id) || !['tab_hidden','tab_visible','copy','paste'].includes(e.type))) fail('INVALID_EVENT','These activity events could not be recorded.',400);
      a.events.push(...clone(body.events)); persist(); return {ok:true};
    }
  }
  if (path.startsWith('/reports/') && method==='GET') {
    const reportId=decodeURIComponent(path.slice('/reports/'.length));
    if (reportId!=='sample' && reportId!==`report-${demo.assessment?.assessment_id}`) fail('NOT_FOUND','Report not found.',404);
    return sampleReport(reportId);
  }
  fail('NOT_FOUND','This preview endpoint was not found.',404);
}

export async function api(method, path, body) {
  method=method.toUpperCase();
  if (!path.startsWith('/') || path.startsWith('//')) throw new TypeError('Use a relative API endpoint beginning with one slash.');
  if (getMode()==='demo') {
    await new Promise(resolve=>setTimeout(resolve,method==='GET'?350:550));
    return clone(await simulate(method,path,body));
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
    throw new ApiError(problem.code||'REQUEST_FAILED',problem.message||'The request could not be completed.',response.status,problem.fields||[],problem.request_id);
  }
  return data;
}

export { samplePortfolio, demoTasks };
