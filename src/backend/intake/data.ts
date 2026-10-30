// Loads the intake data files (taxonomy, domain rules, quiz bank) once.
// Data lives next to this file so it can be tuned without code changes.
import { readFileSync } from 'node:fs';
import type { Domain } from '@torquecode/contracts';

export type Taxonomy = { fallback_topics: string[]; topics: Record<string, string[]> };
export type DomainRules = {
  thresholds: { low_confidence_below_score: number; low_confidence_margin: number };
  fallback_domain: Domain;
  tie_break_order: Domain[];
  domains: Record<Domain, Record<string, number>>;
};
export type QuizOptionData = { id: string; text: string; points_to: { domains?: Domain[]; topics?: string[] } };
export type QuizQuestionData = { id: string; text: string; options: QuizOptionData[] };
export type QuizBank = { questions: QuizQuestionData[] };

const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')) as T;

export const taxonomy: Taxonomy = load('taxonomy.json');
export const domainRules: DomainRules = load('domainRules.json');
export const quizBank: QuizBank = load('quizBank.json');
