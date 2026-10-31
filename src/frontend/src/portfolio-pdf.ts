// PDF portfolio → draft portfolio JSON, entirely in the browser. The backend accepts JSON only (POST /portfolio), so a
// PDF is never sent anywhere: its text is read with pdf.js, a draft is built with the backend's own vocabulary (the
// intake taxonomy and domain keywords), and the candidate reviews the JSON before "Validate portfolio" sends it.
// Nothing is guessed beyond what the text says: missing fields stay as clearly marked placeholders to fill in.
import type {Portfolio} from './types';
import taxonomy from '../../backend/intake/taxonomy.json';
import domainRules from '../../backend/intake/domainRules.json';

export const MAX_PDF_BYTES=5*1024*1024;
const MAX_PAGES=10;

/** Reads the text of a PDF, one line per text row. pdf.js is loaded only when a PDF is chosen. */
export async function pdfToText(data:ArrayBuffer):Promise<string>{
 const pdfjs=await import('pdfjs-dist');
 const worker=(await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
 pdfjs.GlobalWorkerOptions.workerSrc=worker;
 const task=pdfjs.getDocument({data});
 try{
  const doc=await task.promise;
  const lines:string[]=[];
  for(let n=1;n<=Math.min(doc.numPages,MAX_PAGES);n++){
   const page=await doc.getPage(n);
   const content=await page.getTextContent();
   let line='';
   for(const item of content.items){
    if(!('str' in item))continue;
    line+=item.str;
    if(item.hasEOL){lines.push(line);line='';}
   }
   if(line)lines.push(line);
  }
  return lines.join('\n');
 }finally{await task.destroy();}
}

// Synonyms that are also everyday words in a CV ("tech stack", "site map", "sort of") are only trusted inside a
// section that is about DSA; elsewhere they would invent claims the candidate never made.
const AMBIGUOUS=new Set(['list','lists','map','maps','dict','arr','hash','sort','sorts','stack','stacks','queue','queues','tree','trees','graph','graphs','memo','heap','heaps','greedy','dp','recursive','matrix']);
const HEADING=/^(projects?|personal projects|experience|work experience|education|skills|technical skills|tech(nical)? stack|technologies|tools|dsa|data structures( (and|&) algorithms)?|algorithms|problem solving|achievements|certifications|summary|about|profile|contact)\s*:?\s*$/i;
const DSA_HEADING=/^(dsa|data structures( (and|&) algorithms)?|algorithms|problem solving)\b/i;
const PROJECT_HEADING=/^(projects?|personal projects)\b/i;
const SKILL_HEADING=/^(skills|technical skills|tech(nical)? stack|technologies|tools)\b/i;

const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Word-boundary match that also works for terms such as "next.js" or "c++".
const has=(text:string,term:string)=>new RegExp(`(^|[^a-z0-9+#.])${escape(term).replace(/\\?[\s-]+/g,'[\\s-]+')}($|[^a-z0-9+#])`,'i').test(text);

function sections(lines:string[]){
 const out:{heading:string;lines:string[]}[]=[{heading:'',lines:[]}];
 for(const raw of lines){const line=raw.trim();if(!line)continue;if(HEADING.test(line))out.push({heading:line.replace(/:$/,''),lines:[]});else out[out.length-1]!.lines.push(line);}
 return out;
}

const topics=Object.entries((taxonomy as {topics:Record<string,string[]>}).topics);
const keywords=[...new Set(Object.values((domainRules as unknown as {domains:Record<string,Record<string,number>>}).domains).flatMap(d=>Object.keys(d)))];

function findTopics(text:string,dsaSection:boolean){
 const found:string[]=[];
 for(const [key,synonyms] of topics){
  if(synonyms.some(s=>(dsaSection||!AMBIGUOUS.has(s))&&has(text,s)))found.push(key);
 }
 return found;
}
const findKeywords=(text:string)=>keywords.filter(k=>has(text,k));

export interface PdfDraft {portfolio:Portfolio;notes:string[]}

/** Builds a draft portfolio from extracted PDF text. Pure, so it is unit-tested without pdf.js. */
export function draftPortfolio(text:string):PdfDraft{
 const lines=text.split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
 const parts=sections(lines);
 const notes:string[]=[];
 const email=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]??'';
 const name=lines.find(l=>!l.includes('@')&&!/https?:|www\.|\d{5,}/i.test(l)&&!HEADING.test(l)&&l.split(' ').length<=5)??'';
 if(!name)notes.push('No name found: fill in candidate.name.');
 if(!email)notes.push('No email found: fill in candidate.email.');

 const dsaText=parts.filter(p=>DSA_HEADING.test(p.heading)).flatMap(p=>p.lines).join('\n');
 const dsa=[...new Set([...findTopics(dsaText,true),...findTopics(text,false)])];
 if(!dsa.length)notes.push('No DSA topics found: list the topics you have practised in dsa_topics_solved.');

 const skillText=parts.filter(p=>SKILL_HEADING.test(p.heading)).flatMap(p=>p.lines).join('\n');
 const allKeywords=findKeywords(text);
 const skills=allKeywords.filter(k=>k.includes('-')&&!/\.js$/.test(k));
 const tech=allKeywords.filter(k=>!skills.includes(k));
 if(!tech.length)notes.push('No technologies recognised: fill in tech_stack.');
 if(!skillText&&!skills.length)notes.push('No skills section found: add skills if you have them.');

 const projects:Portfolio['projects']=[];
 for(const part of parts.filter(p=>PROJECT_HEADING.test(p.heading))){
  let current:Portfolio['projects'][number]|null=null;
  for(const line of part.lines){
   const bullet=/^[•\-*–▪◦]\s*/.test(line);
   const body=line.replace(/^[•\-*–▪◦]\s*/,'');
   // A short line that isn't a bullet and doesn't end like a sentence starts a new project.
   if(!bullet&&body.split(' ').length<=8&&!/[.;,]$/.test(body)){
    current={name:body.slice(0,120),description:'',tech_stack:[],role:'Author',highlights:[]};projects.push(current);
   }else if(current){
    if(bullet&&current.highlights.length<20)current.highlights.push(body.slice(0,1000));
    else current.description=`${current.description} ${body}`.trim().slice(0,4000);
   }
  }
 }
 for(const p of projects){
  const own=findKeywords([p.name,p.description,...p.highlights].join('\n'));
  p.tech_stack=own.slice(0,30);
  if(!p.description)p.description=p.highlights[0]??'Describe this project.';
 }
 if(!projects.length)notes.push('No projects section found: add your projects.');
 notes.push('Projects are drafted with role "Author": change it if you had a different role.');

 return {portfolio:{
  candidate:{name:(name||'Your name').slice(0,120),email:email||'you@example.com'},
  projects:projects.slice(0,20),
  tech_stack:tech.slice(0,50),
  skills:skills.slice(0,50),
  dsa_topics_solved:dsa.slice(0,50),
 },notes};
}
