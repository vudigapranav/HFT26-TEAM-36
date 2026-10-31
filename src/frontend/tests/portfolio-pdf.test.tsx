// @vitest-environment node
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {draftPortfolio} from '../src/portfolio-pdf';

// Text as pdf.js extracts it from public/samples/torquecode-portfolio.pdf, the same way src/portfolio-pdf.ts does.
async function sampleText(){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const data=new Uint8Array(readFileSync(new URL('../public/samples/torquecode-portfolio.pdf',import.meta.url)));
 const task=pdfjs.getDocument({data,useWorkerFetch:false});const doc=await task.promise;
 const lines:string[]=[];
 for(let n=1;n<=doc.numPages;n++){let line='';for(const item of (await (await doc.getPage(n)).getTextContent()).items){if(!('str' in item))continue;line+=item.str;if(item.hasEOL){lines.push(line);line='';}}if(line)lines.push(line);}
 await task.destroy();
 return lines.join('\n');
}

describe('PDF portfolio draft',()=>{
 it('drafts the demo portfolio from its sample PDF with only claims the PDF makes',async()=>{
  const {portfolio,notes}=draftPortfolio(await sampleText());
  const source=JSON.parse(readFileSync(new URL('../../../docs/demo/demo-portfolio.json',import.meta.url),'utf8'));
  expect(portfolio.candidate).toEqual(source.candidate);
  expect(portfolio.projects.map(p=>p.name)).toEqual(['RouteLedger','ClubDesk']);
  expect(portfolio.projects[0]!.highlights).toHaveLength(3);
  expect(portfolio.projects[0]!.tech_stack).toEqual(expect.arrayContaining(['fastapi','postgres','redis','docker']));
  // Every claimed topic in the source JSON is found, and nothing beyond what the PDF text says.
  expect([...portfolio.dsa_topics_solved].sort()).toEqual(['arrays','hashing','sliding_window','sorting','two_pointers']);
  expect(portfolio.skills).toContain('rest-apis');
  expect(notes.some(n=>/role/.test(n))).toBe(true);
 });

 it('does not turn everyday CV words into DSA claims outside a DSA section',()=>{
  const {portfolio}=draftPortfolio('Sam Lee\nsam@example.com\nExperience\nWorked across the full stack and kept the site map tidy.\nSkills\nReact, Node.js');
  expect(portfolio.dsa_topics_solved).toEqual([]);
  const dsa=draftPortfolio('Sam Lee\nsam@example.com\nData Structures and Algorithms\nStack, queue, dynamic programming');
  expect(dsa.portfolio.dsa_topics_solved.sort()).toEqual(['dp','queue','stack']);
 });

 it('marks missing fields instead of inventing them',()=>{
  const {portfolio,notes}=draftPortfolio('just some text without any structure at all for testing');
  expect(portfolio.candidate.email).toBe('you@example.com');
  expect(notes).toEqual(expect.arrayContaining([expect.stringMatching(/email/),expect.stringMatching(/projects/)]));
 });
});
