// Real-browser journey against a running stack (Prompt 3): frontend on BASE_URL with /api proxied to a backend in
// APP_MODE=auth + RUNNER=docker. Not part of `pnpm test`; it needs live services and Playwright.
//   BASE_URL=http://127.0.0.1:4177 node src/frontend/tests/e2e/journey.mjs
// Each step prints PASS/FAIL with evidence; screenshots go to src/frontend/tests/e2e/screenshots/ (git-ignored).
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=await import('playwright'));}

const here=dirname(fileURLToPath(import.meta.url));
const repo=join(here,'..','..','..','..');
const shots=join(here,'screenshots');mkdirSync(shots,{recursive:true});
const BASE=process.env.BASE_URL||'http://127.0.0.1:4177';
const LEVELS=/\b(novice|adept|master)\b/i;
const results=[];
let shotNo=0;
async function step(page,name,fn){
 const started=Date.now();
 try{const detail=await fn();results.push({step:name,ok:true,ms:Date.now()-started,...(detail?{detail}:{})});console.log(`PASS ${name}${detail?` — ${detail}`:''}`);}
 catch(error){results.push({step:name,ok:false,error:String(error?.message||error).slice(0,400)});console.log(`FAIL ${name} — ${String(error?.message||error).slice(0,400)}`);throw error;}
 finally{if(page)await page.screenshot({path:join(shots,`${String(++shotNo).padStart(2,'0')}-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.png`),fullPage:true}).catch(()=>{});}
}
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
// HashRouter: route changes never fire a load event, so wait on location.hash itself.
async function at(page,route,timeout=30000){
 const deadline=Date.now()+timeout;
 while(!new URL(page.url()).hash.startsWith(`#/${route}`)){
  if(Date.now()>deadline)throw new Error(`expected #/${route}, still at ${new URL(page.url()).hash}`);
  await page.waitForTimeout(100);
 }
}
const portfolio=name=>readFileSync(join(repo,'src','backend','tests','fixtures','portfolios',name),'utf8');

async function register(page,email,password){
 await page.goto(`${BASE}/#/register`);
 await page.getByLabel('Email').fill(email);
 await page.locator('input[autocomplete="new-password"]').nth(0).fill(password);
 await page.locator('input[autocomplete="new-password"]').nth(1).fill(password);
 await page.getByRole('button',{name:'Create account'}).click();
}
async function signIn(page,email,password){
 await at(page,'login');
 await page.getByLabel('Email').fill(email);
 await page.locator('input[autocomplete="current-password"]').fill(password);
 await page.getByRole('button',{name:/^Sign in/}).click();
 await at(page,'portfolio');
}
async function uploadPortfolio(page,json){
 await page.locator('#portfolio-json').fill(json);
 await page.getByRole('button',{name:/Validate/}).click();
}
async function answerQuiz(page){
 await at(page,'quiz');
 await page.getByRole('button',{name:/^(Next question|Review my focus|Continue)$/}).first().waitFor({timeout:30000});
 for(let i=0;i<30;i++){
  if(new URL(page.url()).hash.startsWith('#/ready'))return;
  const option=page.locator('[role="radio"]').first();
  const next=page.getByRole('button',{name:/^(Next question|Review my focus)/});
  const finish=page.getByRole('button',{name:'Continue',exact:true});
  if(await next.count()){await option.click();await next.click();}
  else if(await finish.count()){await finish.first().click();}
  await page.waitForTimeout(200);
 }
 await at(page,'ready');
}

async function waitIdle(page){
 // Run/Submit/Unlock buttons show aria-busy while a request is in flight.
 await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'),null,{timeout:120000});
}
async function bodyText(page){return await page.locator('body').innerText();}
async function assertNoLevelNames(page,where){const text=await bodyText(page);assert(!LEVELS.test(text),`level name visible on ${where}: ${text.match(LEVELS)?.[0]}`);}
async function questionTabs(page){return page.locator('.question-tabs button');}
async function submitEveryQuestion(page){
 const tabs=await questionTabs(page);const count=await tabs.count();
 for(let i=0;i<count;i++){
  await tabs.nth(i).click();await waitIdle(page);
  await page.getByRole('button',{name:/^Submit code/}).click();
  await waitIdle(page);
  await page.getByText('Hidden tests').first().waitFor({timeout:120000});
 }
 return count;
}
async function editorType(page,text){
 await page.locator('.monaco-editor').first().waitFor({timeout:60000});
 await page.locator('.monaco-editor .view-lines').first().click();
 await page.keyboard.press('Control+End');
 await page.keyboard.type(text);
}
async function assessmentId(page){return await page.evaluate(()=>sessionStorage.getItem('torque-assessment-id'));}

const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:960}});
const page=await context.newPage();
const consoleErrors=[];
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
const email=`journey-${Date.now()}@example.com`,password='Journey-pass-2026';
let failed=false;
try{
 await step(page,'a register, reload, sign out, sign in',async()=>{
  await register(page,email,password);
  await at(page,'portfolio');
  await page.reload();await at(page,'portfolio');
  await page.getByText(email).waitFor();
  await page.getByRole('button',{name:'Sign out'}).click();
  await at(page,'login');
  await signIn(page,email,password);
  return email;
 });
 await step(page,'b portfolio upload shows profile, then quiz',async()=>{
  await uploadPortfolio(page,portfolio('normal-web.json'));
  await page.getByText('Portfolio validated').waitFor({timeout:15000});
  await page.getByRole('button',{name:'Continue to focus quiz'}).click();
  await answerQuiz(page);
 });
 await step(page,'c generation progress, receipts, questions released',async()=>{
  const started=Date.now();
  await page.getByRole('button',{name:/Start 60-minute assessment/}).click();
  await page.getByRole('dialog',{name:/A focused, 60-minute session/}).waitFor();
  await page.getByRole('button',{name:/Enter fullscreen and start/}).click();
  await page.getByRole('status',{name:'Question preparation'}).waitFor({timeout:30000});
  assert(await page.evaluate(()=>!!document.fullscreenElement),'fullscreen was not entered from the start click');
  await at(page,'workspace',300000);
  await page.locator('.monaco-editor').first().waitFor({timeout:60000});
  const editorMs=Date.now()-started;
  await assertNoLevelNames(page,'workspace');
  return `questions + editor ready after ${Math.round(editorMs/1000)} s`;
 });
 await step(page,'d set 1: edit, run visible tests, submit all, unlock',async()=>{
  await editorType(page,'\n# reviewed by the journey test\n');
  await page.getByRole('button',{name:/Run visible tests/}).click();await waitIdle(page);
  await page.getByLabel('Execution results').waitFor();
  assert(!/Hidden tests/.test(await page.getByLabel('Execution results').innerText()),'Run showed hidden results');
  assert(!(await page.locator('.assistant').count()),'assistant shown on a first-set question');
  const n=await submitEveryQuestion(page);
  // The server-authoritative advancement prompt appears once every question in the set is submitted.
  await page.getByRole('dialog',{name:/Ready for the next question set/}).waitFor({timeout:30000});
  await page.getByRole('button',{name:/Advance now/}).click();await waitIdle(page);
  await page.waitForFunction(n=>document.querySelectorAll('.question-tabs button').length>n,n,{timeout:30000});
  await assertNoLevelNames(page,'workspace after unlock 1');
  return `${n} question(s) submitted`;
 });
 await step(page,'e set 2: hint and assistant visible, hint served, submit all, unlock',async()=>{
  const tabs=await questionTabs(page);await tabs.last().click();await waitIdle(page);
  await page.getByRole('complementary',{name:'Task assistant'}).waitFor({timeout:30000});
  await page.getByRole('button',{name:/Next hint/}).click();await waitIdle(page);
  await page.getByText(/HINT 1/).waitFor({timeout:60000});
  await page.locator('#chat-input').fill('Which function should I look at first?');
  await page.getByRole('button',{name:'Send message'}).click();
  await page.waitForFunction(()=>!document.querySelector('.chat-thinking'),null,{timeout:120000});
  const chat=await page.getByRole('complementary',{name:'Task assistant'}).innerText();
  const n=await submitEveryQuestion(page);
  // The server-authoritative advancement prompt appears once every question in the set is submitted.
  await page.getByRole('dialog',{name:/Ready for the next question set/}).waitFor({timeout:30000});
  await page.getByRole('button',{name:/Advance now/}).click();await waitIdle(page);
  await page.waitForFunction(n=>document.querySelectorAll('.question-tabs button').length>n,n,{timeout:30000});
  await assertNoLevelNames(page,'workspace after unlock 2');
  return `${n} question(s) in the set; assistant: ${/unavailable|not available/i.test(chat)?'clean unavailable message':'replied'}`;
 });
 let aid='';
 await step(page,'f set 3: submit all, no further unlock, upgrade API returns 409',async()=>{
  const n=await submitEveryQuestion(page);
  assert(!(await page.getByRole('button',{name:/Unlock next questions/}).count()),'a third unlock was offered');
  aid=await assessmentId(page);
  const status=await page.evaluate(id=>fetch(`/api/assessments/${id}/tier/upgrade`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.status),aid);
  assert(status===409,`upgrade returned ${status}`);
  return `${n} question(s); upgrade -> ${status}`;
 });
 await step(page,'g paste into the editor, reload restores timer and files',async()=>{
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:BASE});
  await page.evaluate(()=>navigator.clipboard.writeText('# pasted line'));
  await page.locator('.monaco-editor .view-lines').first().click();
  await page.keyboard.press('Control+End');await page.keyboard.press('Control+V');
  await page.getByText('All changes saved').waitFor({timeout:20000});
  const before=await page.locator('.monaco-editor .view-lines').first().innerText();
  await page.reload();await at(page,'workspace');
  await page.locator('.monaco-editor').first().waitFor({timeout:60000});
  await page.waitForTimeout(500);
  const tabs=await questionTabs(page);assert(await tabs.count()>=3,'question sets not restored');
  const timer=await page.locator('[aria-label*="minutes"]').first().getAttribute('aria-label').catch(()=>null);
  return `timer: ${timer||'shown'}; editor restored (${before.length} chars before reload)`;
 });
 await step(page,'k fullscreen exits: warnings 1 and 2, return to fullscreen',async()=>{
  if(!(await page.evaluate(()=>!!document.fullscreenElement)))await page.getByRole('button',{name:'Enter fullscreen'}).click();
  await page.waitForFunction(()=>!!document.fullscreenElement,null,{timeout:5000});
  await page.evaluate(()=>document.exitFullscreen());
  await page.getByRole('alertdialog',{name:/Warning 1/}).waitFor({timeout:10000});
  await page.getByRole('button',{name:/Return to fullscreen/}).click();
  await page.waitForFunction(()=>!!document.fullscreenElement,null,{timeout:5000}).catch(()=>{throw new Error('Return to fullscreen did not re-enter');});
  // Headless Chromium never hides a background page, so a real tab switch can't be produced here (tab-switch
  // dedupe is covered by tests/live/integrity.test.tsx). A second real fullscreen exit drives Warning 2.
  await page.evaluate(()=>document.exitFullscreen());
  await page.getByRole('alertdialog',{name:/Warning 2/}).waitFor({timeout:10000});
  await page.getByRole('button',{name:/Return to assessment/}).click();
  assert(await page.getByRole('button',{name:'Enter fullscreen'}).isVisible(),'fullscreen banner missing after declining re-entry');
  await page.locator('.monaco-editor').first().waitFor();
  return 'warning 1 + Return to fullscreen re-entered; warning 2 + Return to assessment keeps the banner; editor intact';
 });
 await step(page,'h end assessment (confirmation, server closes the session), final report',async()=>{
  await page.getByRole('button',{name:/^End assessment/}).click();
  await page.getByRole('dialog',{name:/End the assessment now/}).waitFor();
  await page.getByRole('button',{name:/End and see report/}).click();
  await at(page,'report',180000);
  await page.getByText(/Claims vs/).waitFor({timeout:30000});
  const text=await bodyText(page);
  for(const needle of ['QUESTION SUMMARY','Assistance evidence','Integrity'])assert(text.includes(needle),`report missing ${needle}`);
  assert(/demonstrated/i.test(text),'claims states missing');
  assert(!/No signals recorded/.test(text),'the paste from step g is missing from integrity signals');
  assert(/fullscreen exits/i.test(text)&&/page reloads/i.test(text),'integrity summary is missing fullscreen exits or reloads');
  assert(/Minor interruptions|Needs review/.test(text),'integrity review status missing');
  return 'report shows score, rows, AIE, integrity, claims';
 });
 await step(page,'i past reports, sign out, sign in, report still opens',async()=>{
  await page.getByRole('link',{name:'Past reports'}).first().click();await at(page,'reports');
  await page.waitForTimeout(800);
  const listed=await bodyText(page);
  await page.getByRole('button',{name:'Sign out'}).click();await at(page,'login');
  await signIn(page,email,password);
  await page.goto(`${BASE}/#/report?id=report-${aid}`);
  await page.getByText(/Claims vs/).waitFor({timeout:30000});
  return /No reports|nothing yet/i.test(listed)?'history empty while the session is active (only completed reports are listed)':'history lists reports';
 });
 const second=await browser.newContext({viewport:{width:1280,height:900}});
 const other=await second.newPage();
 await step(other,'b2 PDF portfolio is drafted as JSON in the browser and validates',async()=>{
  await register(other,`journey-b-${Date.now()}@example.com`,password);await at(other,'portfolio');
  await other.locator('input[type=file]').setInputFiles(join(repo,'src','frontend','public','samples','torquecode-portfolio.pdf'));
  await other.getByText('Drafted from your PDF. Check it before validating.').waitFor({timeout:30000});
  const draft=JSON.parse(await other.locator('#portfolio-json').inputValue());
  assert(draft.candidate.email==='ananya.raghavan@example.com','email not drafted from the PDF');
  await other.getByRole('button',{name:/Validate/}).click();
  await other.getByText('Portfolio validated').waitFor({timeout:15000});
  return `${draft.projects.length} projects, topics: ${draft.dsa_topics_solved.join(', ')}`;
 });
 await step(other,'j portfolio without arrays: clear SEED_TOPIC_UNAVAILABLE message',async()=>{
  await uploadPortfolio(other,portfolio('typo-topics.json'));
  await other.getByText('Portfolio validated').waitFor({timeout:15000});
  await other.getByRole('button',{name:'Continue to focus quiz'}).click();
  await answerQuiz(other);
  await other.getByRole('button',{name:/Start 60-minute assessment/}).click();
  await other.getByRole('button',{name:/Enter fullscreen and start|Start without fullscreen/}).click();
  await other.getByRole('alert').waitFor({timeout:30000});
  const alert=await other.getByRole('alert').innerText();
  assert(/arrays/i.test(alert),`unexpected message: ${alert}`);
  return alert.replace(/\s+/g,' ').slice(0,160);
 });
}catch{failed=true;}
finally{
 console.log(JSON.stringify({ok:!failed&&results.every(r=>r.ok),steps:results,console_errors:consoleErrors.slice(0,10)},null,1));
 await browser.close();
 if(failed)process.exitCode=1;
}
