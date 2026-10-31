// Project evidence for K6 (owner: Pranav). Deterministic: every feature and DSA mention is a reviewed pattern match
// with a source path back into the submitted portfolio. Nothing is inferred beyond the text, nothing is added to the
// candidate's claimed topics, and text flagged as prompt injection is never mined. Evidence is not proof of authorship.
import type { Portfolio } from '@torquecode/contracts';
import type { Topic } from '../contracts/internal.js';
import { findInjection, toToken } from './normalize.js';

export const EVIDENCE_VERSION = 'evidence-v1';
export type FeatureTag =
  | 'event_dedup' | 'order_processing' | 'cart' | 'inventory' | 'payments' | 'log_analysis' | 'auth_security'
  | 'alerting' | 'monitoring' | 'rate_limiting' | 'api_traffic' | 'batch_stats' | 'data_preprocessing'
  | 'ranking' | 'analytics_reporting' | 'realtime_events' | 'scheduling';
export type EvidenceRef = { source: string; quote: string };
export type ProjectEvidence = {
  index: number; name: string; role: string; technologies: string[];
  features: ({ tag: FeatureTag } & EvidenceRef)[];
  dsa_evidence: ({ topic: Topic } & EvidenceRef)[];
  injection_flagged: string[]; missing: string[]; confidence: 'high' | 'medium' | 'low';
};
export type PortfolioEvidence = { version: typeof EVIDENCE_VERSION; projects: ProjectEvidence[] };

// Reviewed vocabulary. A tag needs one of its phrases in a project's own text; generic words are avoided on purpose.
const FEATURES: Record<FeatureTag, RegExp> = {
  event_dedup: /\b(de-?dup(?:e|licat\w*)|duplicate (?:\w+ )?(?:events?|orders?|messages?|records?|requests?|pings?)|idempoten\w*|repeated (?:events?|orders?|messages?|pings?|checkouts?))\b/i,
  order_processing: /\b(orders?|checkouts?|order[- ]processing|fulfil+ment)\b/i,
  cart: /\b(shopping cart|carts?|basket)\b/i,
  inventory: /\b(inventory|stock levels?|warehouse|sku)\b/i,
  payments: /\b(payments?|invoices?|billing|transactions?)\b/i,
  log_analysis: /\b(logs?|log[- ](?:analysis|parsing|events?)|siem|audit trail)\b/i,
  auth_security: /\b(authenticat\w*|login attempts?|brute[- ]force|intrusion|threats?|vulnerabilit\w*|access control|failed logins?)\b/i,
  alerting: /\b(alerts?|alerting|incidents?|on-?call|pager)\b/i,
  monitoring: /\b(monitor\w*|metrics|dashboards?|observability|uptime|sla|slo|error (?:rates?|budgets?))\b/i,
  rate_limiting: /\b(rate[- ]limit\w*|throttl\w*|quotas?)\b/i,
  api_traffic: /\b(requests? per|traffic|endpoints?|rest api|api gateway|latency|throughput)\b/i,
  batch_stats: /\b(batch(?:es)? statistics|aggregat\w*|summar(?:y|ies|ises|izes)|statistics|rollups?)\b/i,
  data_preprocessing: /\b(preprocess\w*|data cleaning|clean(?:ed|ing) data|feature engineering|datasets?|etl|pipelines?)\b/i,
  ranking: /\b(leaderboards?|rank(?:ing|ings|ed)?|top[- ]?k|scores?)\b/i,
  analytics_reporting: /\b(analytics|reports?|reporting|insights?|kpis?)\b/i,
  realtime_events: /\b(real[- ]?time|streams?|streaming|websockets?|event[- ]driven|kafka|pub\/?sub|webhooks?)\b/i,
  scheduling: /\b(schedul\w*|bookings?|reservations?|time ?slots?|calendars?)\b/i,
};
// Unambiguous DSA phrases only (everyday words like "stack" or "map" never count as evidence).
const DSA: [Topic, RegExp][] = [
  ['hashing', /\b(hash ?maps?|hash ?tables?|hash ?sets?|dictionar(?:y|ies) keyed)\b/i],
  ['two_pointers', /\btwo[- ]pointers?\b/i],
  ['sliding_window', /\bsliding[- ]windows?\b/i],
  ['sorting', /\b(sort(?:ed|ing)|merge sort|quick ?sort)\b/i],
  ['binary_search', /\bbinary search\b/i],
  ['arrays', /\b(arrays?|prefix sums?)\b/i],
  ['heap', /\b(priority queues?|min[- ]?heap|max[- ]?heap)\b/i],
  ['graphs', /\b(graphs?|shortest paths?|dijkstra|topological)\b/i],
  ['dp', /\b(dynamic programming|memoi[sz]ation)\b/i],
];
const quote = (text: string, match: RegExpMatchArray) => {
  const at = match.index ?? 0;
  return text.slice(Math.max(0, at - 40), at + match[0].length + 40).replace(/\s+/g, ' ').trim().slice(0, 120);
};

/** Builds evidence from a portfolio that already passed the Portfolio contract (see parsePortfolioDetailed). */
export function extractEvidence(portfolio: Portfolio, claimedTopics: Topic[]): PortfolioEvidence {
  const projects = portfolio.projects.map((project, index): ProjectEvidence => {
    const fields = [
      { source: `projects[${index}].name`, text: project.name },
      { source: `projects[${index}].description`, text: project.description },
      ...project.highlights.map((text, j) => ({ source: `projects[${index}].highlights[${j}]`, text })),
    ];
    const flagged = new Set(findInjection(fields.map(f => ({ path: f.source, text: f.text }))));
    const usable = fields.filter(f => !flagged.has(f.source));
    const features: ProjectEvidence['features'] = [];
    for (const [tag, pattern] of Object.entries(FEATURES) as [FeatureTag, RegExp][]) {
      for (const field of usable) {
        const match = field.text.match(pattern);
        if (match) { features.push({ tag, source: field.source, quote: quote(field.text, match) }); break; }
      }
    }
    const dsa_evidence: ProjectEvidence['dsa_evidence'] = [];
    for (const [topic, pattern] of DSA) {
      if (!claimedTopics.includes(topic)) continue; // evidence supports a claim; it never creates one
      for (const field of usable) {
        const match = field.text.match(pattern);
        if (match) { dsa_evidence.push({ topic, source: field.source, quote: quote(field.text, match) }); break; }
      }
    }
    const missing = [
      ...(project.description.trim().length < 40 ? ['description is too short to describe the work'] : []),
      ...(project.highlights.length === 0 ? ['no highlights (concrete features or responsibilities)'] : []),
      ...(project.tech_stack.length === 0 ? ['no technologies listed'] : []),
      ...(features.length === 0 ? ['no recognised feature or workflow'] : []),
    ];
    const confidence = features.length >= 2 && project.highlights.length > 0 && flagged.size === 0 ? 'high' : features.length > 0 ? 'medium' : 'low';
    return {
      index, name: project.name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60) || `Project ${index + 1}`,
      role: project.role.slice(0, 80), technologies: [...new Set(project.tech_stack.map(toToken).filter(Boolean))].slice(0, 20),
      features, dsa_evidence, injection_flagged: [...flagged], missing, confidence,
    };
  });
  return { version: EVIDENCE_VERSION, projects };
}
