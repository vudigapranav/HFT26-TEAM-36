import { describe, expect, it } from 'vitest';
import { detectDomain } from '../../intake/normalize.js';
import { domainRules } from '../../intake/data.js';

const detect = (stack: string[]) => detectDomain(new Set(stack), domainRules);

describe('domain confidence matches the strength of the evidence', () => {
  it('one weak keyword is low confidence, never 100% (live: C/C++/Java systems portfolio)', () => {
    const d = detect(['c', 'c++', 'java', 'stl', 'javafx', 'cmake', 'git', 'linux', 'posix', 'make']);
    expect(d.lowConfidence).toBe(true);
    expect(d.confidence).toBeLessThan(0.5);
  });
  it('a clear stack stays high confidence', () => {
    expect(detect(['react', 'nextjs', 'typescript', 'tailwind'])).toMatchObject({ domain: 'web', lowConfidence: false });
    expect(detect(['react', 'nextjs', 'typescript', 'tailwind']).confidence).toBeGreaterThanOrEqual(0.8);
  });
  it.each([
    ['web', ['React.js', 'Node.js', 'Express.js', 'MongoDB', 'Tailwind CSS', 'Frontend Development']],
    ['web', ['Vue.js', 'Vite', 'SASS', 'HTML']],
    ['ml', ['Python', 'TensorFlow', 'Scikit-Learn', 'Pandas', 'Machine Learning', 'Deep Learning']],
    ['security', ['Burp Suite', 'Wireshark', 'Nmap', 'Kali Linux', 'Penetration Testing', 'Cryptography']],
    ['backend', ['Java', 'Spring Boot', 'PostgreSQL', 'Docker', 'REST APIs']],
  ])('real-world spellings are recognised (live: everything came out backend): %s', (domain, stack) => {
    expect(detect(stack.map(s => s.toLowerCase())).domain).toBe(domain);
  });
  it('one spelling never counts twice (next.js / nextjs, node.js / node)', () => {
    expect(detect(['next.js']).scores.web).toBe(detect(['nextjs']).scores.web);
    expect(detect(['node.js']).scores.backend).toBe(detect(['node']).scores.backend);
  });
  it('a low-confidence result never reports full confidence', () => {
    for (const stack of [['linux'], ['git', 'docker'], ['sql'], ['html'], ['pandas']]) {
      const d = detect(stack);
      if (d.lowConfidence) expect(d.confidence, stack.join(',')).toBeLessThan(1);
    }
  });
});
