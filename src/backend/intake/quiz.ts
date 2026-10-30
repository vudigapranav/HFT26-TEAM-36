// P3 — quiz seam (owner: Pranav). TODO(OPEN-Q2): quiz purpose/timing.
// Fixed MCQ bank, no LLM. The focus lane is ALWAYS within the profile's claims.
import type { CandidateProfile, Domain, QuizQuestion, Topic } from '@torquecode/contracts';
import type { FocusLane, SeamResult } from '../contracts/internal.js';
import { domainRules, quizBank, type QuizBank, type QuizOptionData } from './data.js';
import { DOMAINS, detectDomain } from './normalize.js';

const MAX_QUESTIONS = 10;

// Claimed domains = primary domain + any domain whose keywords appear in the profile's stack/skills.
export function claimedDomains(profile: CandidateProfile): Domain[] {
  const { scores } = detectDomain(new Set([...profile.tech_stack, ...profile.skills]), domainRules);
  const ds = DOMAINS.filter(d => scores[d] > 0);
  return ds.includes(profile.domain) ? ds : [profile.domain, ...ds];
}

const touches = (o: QuizOptionData, domains: Domain[], topics: Topic[]) =>
  (o.points_to.domains ?? []).some(d => domains.includes(d)) || (o.points_to.topics ?? []).some(t => topics.includes(t as Topic));

export function selectQuestions(profile: CandidateProfile, bank: QuizBank = quizBank): QuizQuestion[] {
  const domains = claimedDomains(profile);
  return bank.questions
    .filter(q => q.options.some(o => touches(o, domains, profile.claimed_topics)))
    .slice(0, MAX_QUESTIONS)
    .map(q => ({ id: q.id, prompt: q.text,
      options: q.options.filter(o => touches(o, domains, profile.claimed_topics)).map(o => ({ id: o.id, text: o.text })) }));
}

export class QuizAnswerError extends Error {}

export function scoreAnswers(profile: CandidateProfile, answers: { question_id: string; option_id: string }[], bank: QuizBank = quizBank): FocusLane {
  const domains = claimedDomains(profile);
  const tally = new Map<Domain, number>(domains.map(d => [d, 0]));
  const topicTally = new Map<Topic, number>();
  for (const a of answers) {
    const o = bank.questions.find(q => q.id === a.question_id)?.options.find(x => x.id === a.option_id);
    if (!o) throw new QuizAnswerError(`Unknown answer ${a.question_id}/${a.option_id}.`);
    for (const d of o.points_to.domains ?? []) if (tally.has(d)) tally.set(d, (tally.get(d) ?? 0) + 1);
    for (const t of o.points_to.topics ?? []) if (profile.claimed_topics.includes(t as Topic)) topicTally.set(t as Topic, (topicTally.get(t as Topic) ?? 0) + 1);
  }
  const best = Math.max(0, ...tally.values());
  const winners = domains.filter(d => (tally.get(d) ?? 0) === best);
  const domain: Domain = best > 0 ? (winners.includes(profile.domain) ? profile.domain : (winners[0] ?? profile.domain)) : profile.domain;
  const topics = [...topicTally.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const laneKeywords = new Set(Object.keys(domainRules.domains[domain] ?? {}));
  const skills = profile.skills.filter(s => laneKeywords.has(s));
  return { domain, skills, topics: topics.length ? topics : [...profile.claimed_topics] };
}

// Seam signature from contracts/seams.ts (Ports.quiz).
export function quiz(input: { profile: CandidateProfile; answers?: { question_id: string; option_id: string }[] }):
  SeamResult<{ questions: QuizQuestion[] } | { focus_lane: FocusLane }> {
  if (!input.answers) return { kind: 'ok', value: { questions: selectQuestions(input.profile) } };
  return { kind: 'ok', value: { focus_lane: scoreAnswers(input.profile, input.answers) } };
}
