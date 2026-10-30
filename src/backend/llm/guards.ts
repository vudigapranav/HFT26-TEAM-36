// Deterministic guards for the R5 assistant. Heuristics, not a proof: they stop the
// obvious extraction routes and anything that looks like a complete solution.
import type { File } from '../contracts/internal.js';

export type InputVerdict = { blocked: false } | { blocked: true; code: string };
export type OutputVerdict = { ok: true } | { ok: false; code: string };

// Each rule names an extraction route. Patterns require intent words, so normal
// debugging questions ("why does my loop skip the last day?") don't match.
const ASK = String.raw`(?:give|show|write|print|reveal|tell|send|output|paste|provide|share|type|generate|produce|dump|list|display|return|reply with|just (?:do|write|give))`;
const WHOLE = String.raw`(?:reference|official|model|full|complete|entire|whole|correct|working|fixed|final|finished|corrected|exact)`;
const ARTIFACT = String.raw`(?:solution|implementation|answer|code|function|file|version|fix|body|program|module)`;
const INPUT_RULES: [code: string, pattern: RegExp][] = [
  ['instruction_override', /\b(?:ignore|disregard|forget|override|bypass)\b[^.?!\n]{0,30}\b(?:previous|prior|above|earlier|all|your|system|these)\b[^.?!\n]{0,20}\b(?:instructions?|rules?|prompts?|guidelines?|messages?|restrictions?)/i],
  ['instruction_override', /\b(?:developer|god|dan|jailbreak|unrestricted|admin)\s+mode\b|\byou are (?:now )?(?:free|unrestricted|no longer|in [a-z ]{0,20}mode)\b|\bno (?:rules|restrictions|limits) (?:apply|now)\b/i],
  ['prompt_extraction', /\b(?:system|developer|hidden|initial)\s+(?:prompt|message|instructions?)\b|\brepeat (?:everything|all|the (?:text|messages?)) (?:above|before)\b|\b(?:verbatim|word for word)\b[^.?!\n]{0,40}\b(?:above|instructions?|prompt)/i],
  ['solution_request', new RegExp(String.raw`\b${ASK}\b[^.?!\n]{0,40}\b${WHOLE}\b[^.?!\n]{0,30}\b${ARTIFACT}`, 'i')],
  ['solution_request', /\b(?:just|please)?\s*(?:fix|solve|finish|complete|implement)\s+(?:it|this|the (?:task|bug|function|whole thing))\s+for me\b|\bdo (?:the|my) (?:task|assignment|homework) for me\b/i],
  ['reference_extraction', /\b(?:reference|official|model|grader'?s?)\s+(?:solution|implementation|answer|code)\b/i],
  ['hidden_tests', /\bhidden\s+(?:tests?|cases?|inputs?|outputs?|asserts?|checks?)\b|\b(?:what|which|list|show)\b[^.?!\n]{0,30}\b(?:tests?|inputs?)\b[^.?!\n]{0,30}\b(?:grader|hidden|expect(?:ed)?)\b[^.?!\n]{0,20}\b(?:use|run|check)/i],
  ['encoded_solution', /\b(?:base ?64|rot ?13|hex(?:adecimal)?|encode[ds]?|encrypt(?:ed)?|cipher|morse|reversed? order|backwards|obfuscat\w*)\b[^\n]{0,60}\b(?:solution|code|function|body|answer|fix|implementation)\b|\b(?:solution|code|function|body|answer|fix)\b[^\n]{0,60}\b(?:in|as|using) (?:base ?64|rot ?13|hex|morse)\b|\breply only in (?:base ?64|rot ?13|hex)\b/i],
  ['piecemeal_extraction', /\b(?:first|next|last|remaining|following)\s+(?:\d+|one|two|three|four|five|few|couple of)\s+lines?\b|\bline[- ]by[- ]line\b[^.?!\n]{0,40}\b(?:fix|solution|code|function)|\bevery line\b[^.?!\n]{0,40}\b(?:fix|solution)/i],
  ['format_laundering', /\b(?:exact|complete|full|whole|line[- ]by[- ]line|every line|detailed)\b[^.?!\n]{0,30}\bpseudo-?code\b|\bpseudo-?code\b[^.?!\n]{0,40}\b(?:whole|full|entire|complete|every line|exact)\b/i],
  ['translation_laundering', /\b(?:write|give|show|rewrite|translate|port|convert)\b[^.?!\n]{0,40}\b(?:solution|answer|fix|it|function|code)\b[^.?!\n]{0,30}\b(?:in|into|to) (?:javascript|typescript|java|c\+\+|c#|golang|go|rust|ruby|php|kotlin|swift|another language|a different language|other language)\b/i],
  ['roleplay', /\b(?:let'?s play|pretend|act as|role-?play|you are my|imagine (?:you are|you're)|from now on you are)\b[^\n]{0,100}\b(?:type|write|code|solution|engineer|no restrictions|without (?:any )?(?:restrictions|limits)|always)\b/i],
  // Found by the live evaluation (R5-live P2/P3/P4/P6): asking for the fixed form without saying "solution".
  ['fix_description', /\b(?:what|how) would (?:the|a|my) (?:fixed|corrected|correct|working|finished) (?:function|code|version|loop|line|file|solution)\b[^.?!\n]{0,20}\blook\b/i],
  ['fix_description', /\bexactly what (?:to|i should|should i) (?:change|write|type|replace|put)\b|\bcharacter[- ]by[- ]character\b/i],
  // "what should the loop header be?" asks for the edit itself; "what should the output be?" does not match.
  ['fix_description', /\bwhat (?:exactly )?should (?:the|that|this|my) (?:loop|line|header|condition|expression|range|bound|code|statement|call|return)\b[a-z ]{0,20}\bbe\b/i],
  ['fix_description', /\b(?:as it should (?:read|look|be)|after the fix|once (?:it'?s|it is) fixed)\b/i],
  // Needs an explicit request: Security-domain tasks legitimately talk about passwords and tokens.
  ['secret_request', new RegExp(String.raw`\b${ASK}\b[^.?!\n]{0,40}(?:\b(?:your|the server'?s?|the grader'?s?|featherless|openai|platform)\b[^.?!\n]{0,20})(?:api[ _-]?keys?|secret keys?|access tokens?|credentials|env(?:ironment)? variables?|\.env\b|config(?:uration)?)`, 'i')],
];
// Text addressed to the assistant inside the candidate's own files is injection, not code.
const FILE_INJECTION = /\b(?:note|message|instructions?|hint|request)s?\s+(?:to|for)\s+(?:the\s+)?(?:assistant|ai|model|llm|chat ?bot|grader)\b|^\s*(?:#|\/\/|\*|--)\s*(?:assistant|ai|llm|system)\s*:/im;

export function checkInput(message: string): InputVerdict {
  for (const [code, pattern] of INPUT_RULES) if (pattern.test(message)) return { blocked: true, code };
  return { blocked: false };
}

/** Comment/docstring text in candidate files that tries to instruct the assistant. */
export function checkFilesForInjection(files: File[]): InputVerdict {
  for (const file of files) {
    if (FILE_INJECTION.test(file.content)) return { blocked: true, code: 'instructions_in_code' };
    // Comments that are extraction requests in their own right.
    const comments = file.content.split('\n').filter(line => /^\s*(?:#|\/\/)/.test(line)).join('\n');
    const verdict = checkInput(comments);
    if (verdict.blocked && verdict.code !== 'secret_request') return { blocked: true, code: 'instructions_in_code' };
  }
  return { blocked: false };
}

// ---------- output guard ----------

export type OutputPolicy = {
  /** Longest allowed fenced code block, in non-blank lines. */
  maxBlockLines: number;
  /** Total code-looking lines allowed in one reply (fenced or not). */
  maxCodeLines: number;
};
/** With a trusted reference to compare against. */
export const STANDARD_POLICY: OutputPolicy = { maxBlockLines: 6, maxCodeLines: 10 };
/** No reference available: be stricter, since similarity can't be checked. */
export const RESTRICTIVE_POLICY: OutputPolicy = { maxBlockLines: 4, maxCodeLines: 6 };

const CODE_LINE = /^\s*(?:def |class |return\b|for .+:\s*$|while .+:\s*$|if .+:\s*$|elif .+:\s*$|else:\s*$|try:\s*$|except\b.*:\s*$|import |from \S+ import |[A-Za-z_][\w.\[\]]*\s*(?:[+\-*/%]?=)(?!=)|[A-Za-z_][\w.]*\(.*\)\s*$|(?:const|let|var|function)\s)/;
const DISCLOSURE = /\b(?:hidden tests?|reference (?:solution|implementation)|system prompt|my instructions (?:are|say)|ASSISTANT POLICY|UNTRUSTED-[0-9a-f]{6,})\b/i;
const SECRETS = /\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._-]{12,}|\bFEATHERLESS_[A-Z_]+|\bapi[_-]?key\s*[:=]/i;

/** Fenced blocks and the code-looking lines of a reply. */
export function extractCode(reply: string): { blocks: string[][]; codeLines: string[] } {
  const blocks: string[][] = [];
  const fence = /```[^\n]*\n([\s\S]*?)(?:```|$)/g;
  for (const match of reply.matchAll(fence)) blocks.push(match[1]!.split('\n').filter(line => line.trim() !== ''));
  const outside = reply.replace(fence, '');
  const loose = outside.split('\n').filter(line => CODE_LINE.test(line) && !/^\s*[-*]\s/.test(line));
  return { blocks, codeLines: [...blocks.flat(), ...loose] };
}

/** Function/class names the candidate's files define: a reply re-implementing one is solution-like. */
export function taskSymbols(files: File[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) for (const match of file.content.matchAll(/^\s*(?:def|class)\s+([A-Za-z_]\w*)/gm)) names.add(match[1]!);
  return names;
}

/** Normalized code line for similarity: no comments, no whitespace, lowercase. */
export const normalizeLine = (line: string) => line.replace(/#.*$|\/\/.*$/, '').replace(/\s+/g, '').toLowerCase();

/**
 * Lines that exist in the reference but not in the candidate's visible files: the fix.
 * Computed server-side only; the reference never enters a prompt.
 */
export function solutionFingerprint(reference: File[], visible: File[]): Set<string> {
  const known = new Set(visible.flatMap(file => file.content.split('\n').map(normalizeLine)));
  const fingerprint = new Set<string>();
  for (const file of reference) {
    for (const line of file.content.split('\n')) {
      const normal = normalizeLine(line);
      // Ignore trivial lines (return x, pass, brackets) that would match any reply.
      if (normal.length >= 12 && !known.has(normal)) fingerprint.add(normal);
    }
  }
  return fingerprint;
}

export function checkOutput(reply: string, context: { files: File[]; fingerprint: Set<string> | null; policy: OutputPolicy }): OutputVerdict {
  if (DISCLOSURE.test(reply)) return { ok: false, code: 'disclosure' };
  if (SECRETS.test(reply)) return { ok: false, code: 'secret' };
  const { blocks, codeLines } = extractCode(reply);
  if (blocks.some(block => block.length > context.policy.maxBlockLines)) return { ok: false, code: 'long_code_block' };
  if (codeLines.length > context.policy.maxCodeLines) return { ok: false, code: 'too_much_code' };
  // Re-defining one of the task's own functions/classes is a solution, however short.
  const symbols = taskSymbols(context.files);
  for (const line of codeLines) {
    const defined = /^\s*(?:def|class)\s+([A-Za-z_]\w*)/.exec(line)?.[1];
    if (defined && symbols.has(defined)) return { ok: false, code: 'task_function_implementation' };
  }
  const inline = [...reply.matchAll(/`([^`\n]+)`/g)].map(match => match[1]!);
  if (context.fingerprint && context.fingerprint.size > 0) {
    const replyLines = new Set(reply.split('\n').map(normalizeLine).filter(line => line.length >= 12));
    // Also catch a fix written inline in prose ("change it to `for i in range(len(counts))`").
    for (const line of [...replyLines, ...inline.map(normalizeLine)]) if (context.fingerprint.has(line)) return { ok: false, code: 'reference_similarity' };
    // Fragments of a fix line count too (live eval: "`for count in counts` ... `max(peak, count)`").
    for (const fragment of [...inline, ...codeLines].map(normalizeLine).filter(f => f.length >= 10)) {
      for (const line of context.fingerprint) if (line.includes(fragment)) return { ok: false, code: 'reference_similarity' };
    }
  }
  // New task-specific code: an expression that uses the candidate's own names but isn't in
  // their files is a prescribed edit. For one-token bugs (the live eval's "change
  // `range(len(counts) - 1)` to `range(len(counts))`") that IS the solution, reference or not.
  const names = taskIdentifiers(context.files);
  const existing = context.files.map(file => file.content.split('\n').map(normalizeLine).join('\n')).join('\n');
  for (const fragment of [...inline, ...codeLines]) if (isNewTaskCode(fragment, names, existing)) return { ok: false, code: 'new_task_code' };
  return { ok: true };
}

const COMMON_NAMES = new Set(('def return for in range len max min sum list dict set int str float bool None True False if else elif while '
  + 'import from as with not and or is lambda pass break continue class try except finally raise yield print sorted enumerate zip map '
  + 'filter abs any all self open sorted reversed append extend items keys values get pop').split(' '));

/** Identifiers the candidate's code defines or uses (strings and comments removed), minus common names. */
export function taskIdentifiers(files: File[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    const code = file.content.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|#.*$/gm, ' ');
    for (const match of code.matchAll(/\b[A-Za-z_]\w*\b/g)) if (match[0].length >= 3 && !COMMON_NAMES.has(match[0])) names.add(match[0]);
  }
  return names;
}

function isNewTaskCode(fragment: string, names: Set<string>, existing: string): boolean {
  const normal = normalizeLine(fragment);
  if (normal.length < 6 || /^[\w.]+$/.test(normal)) return false; // bare names/numbers
  if (/^(?:print|repr|type|len|assert)\(/.test(normal)) return false; // debugging suggestions
  if (!/[()[\]=:<>+\-*/%]/.test(normal)) return false; // not code-like
  if (![...fragment.matchAll(/\b[A-Za-z_]\w*\b/g)].some(match => names.has(match[0]))) return false; // generic example
  return !existing.includes(normal); // quoting the candidate's own code is fine
}
