const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const projects = {
  "intake": {
    "id": "intake",
    "category": "INTAKE & ONBOARDING",
    "title": "Portfolio → profile",
    "subtitle": "Start with the skills you actually claim.",
    "type": "INTAKE & ONBOARDING",
    "image": "intake.svg",
    "description": "TorqueCode turns a structured JSON portfolio into a candidate profile. The assessment starts from the candidate’s claimed skills, rather than a generic question list.",
    "idea": "Normalize claimed DSA topics, identify a domain, and use a fixed onboarding quiz to select a relevant focus lane.",
    "approach": "Strict schema validation gives field-level errors. Topic normalization uses a 19-topic taxonomy, and portfolio text is treated as untrusted input. The selected focus lane stays inside the candidate’s claimed topics.",
    "source": "src/backend/intake/portfolio.ts",
    "alt": "Illustrative TorqueCode intake layout, with a portfolio JSON document flowing into a candidate skills profile"
  },
  "assessment": {
    "id": "assessment",
    "category": "ASSESSMENT FLOW",
    "title": "A codebase. A challenge.",
    "subtitle": "Fix bugs. Build features. Show your thinking.",
    "type": "ASSESSMENT FLOW",
    "image": "assessment.svg",
    "description": "The project is built around practical work in a small, multi-file codebase: debugging and feature tasks instead of a blank editor.",
    "idea": "Use one server-authoritative 60-minute session, starting with the initial question set and allowing at most two further unlocks.",
    "approach": "The current policy checks that every question in the current set has been submitted before the next set can unlock. Run checks visible tests; Submit includes hidden tests. Editable-file allow-lists keep task boundaries explicit.",
    "source": "src/backend/api/assessments.ts",
    "alt": "Illustrative TorqueCode assessment workspace with file tabs, Python task code, Run and Submit actions, and a sixty-minute session indicator"
  },
  "sandbox": {
    "id": "sandbox",
    "category": "ISOLATED EXECUTION",
    "title": "Tests decide. Every time.",
    "subtitle": "A clear boundary between code and grading.",
    "type": "ISOLATED EXECUTION",
    "image": "sandbox.svg",
    "description": "Correctness comes from deterministic test execution. An LLM does not decide whether a candidate’s code passes.",
    "idea": "Separate the candidate’s execution environment from the trusted grading process.",
    "approach": "The Docker runner uses separate worker and grader containers, with network disabled, resource limits, and a read-only root filesystem. Hidden test details and reference solutions stay server-side. This is a hackathon implementation, not a production security certification.",
    "source": "src/backend/runner/dockerRunner.ts",
    "alt": "TorqueCode architecture illustration showing candidate files entering an isolated worker and a separate trusted grader returning test aggregates"
  },
  "report": {
    "id": "report",
    "category": "SCORING & REPORTS",
    "title": "Evidence over impressions.",
    "subtitle": "Understand the result—and the work behind it.",
    "type": "SCORING & REPORTS",
    "image": "report.svg",
    "description": "The report combines per-task test results, time, hint usage, focus areas, and integrity signals into a structured assessment outcome.",
    "idea": "Measure correctness and, where applicable, how effectively the candidate used assistance.",
    "approach": "AI efficiency is calculated from logged events: independence, hint yield, and test discipline, gated by the final submit’s pass rate. It contributes up to 20 points when applicable. Novice-only sessions scale correctness to 100. Integrity events are signals, not automatic cheating verdicts.",
    "source": "src/backend/scoring/report.ts",
    "alt": "Illustrative TorqueCode report layout showing correctness, task evidence, AI-efficiency components, and focus areas without invented candidate scores"
  }
};
const filters = document.querySelectorAll('[data-filter]');
filters.forEach(button => button.addEventListener('click', () => {
  filters.forEach(filter => { const active = filter === button; filter.classList.toggle('active', active); filter.setAttribute('aria-pressed', String(active)); });
  document.querySelectorAll('.project-card').forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter; });
}));
const dialog = document.querySelector('#project-dialog');
document.querySelectorAll('[data-project]').forEach(card => card.addEventListener('click', () => {
  const project = projects[card.dataset.project];
  document.querySelector('#dialog-title').textContent = project.title;
  document.querySelector('#dialog-category').textContent = project.category;
  document.querySelector('#dialog-description').textContent = project.description;
  document.querySelector('#dialog-idea').textContent = project.idea;
  document.querySelector('#dialog-approach').textContent = project.approach;
  const image = document.querySelector('#dialog-image'); image.src = `assets/${project.image}`; image.alt = `${project.title} illustrative module view`;
  document.querySelector('.dialog-cta').href = 'https://github.com/vudigapranav/HFT26-TEAM-36/blob/main/' + project.source;
  dialog.showModal(); dialog.scrollTop = 0;
}));
document.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
document.querySelector('.dialog-cta').addEventListener('click', () => dialog.close());
const menu = document.querySelector('.menu-button');
const mobileNav = document.querySelector('#mobile-nav');
function closeMenu() { menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open menu'); mobileNav.hidden = true; }
menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); mobileNav.hidden = !open; });
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
const toast = document.querySelector('.toast'); let toastTimer;
document.querySelector('#copy-repo').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('https://github.com/vudigapranav/HFT26-TEAM-36'); toast.textContent = 'Repository link copied.'; }
  catch { toast.textContent = 'Repository: https://github.com/vudigapranav/HFT26-TEAM-36'; }
  toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
});

// Shared with the laptop scene and the scroll choreography.
let sculptureScroll = 0;
