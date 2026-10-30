// Fake docker CLI for deterministic runner tests: node fake-docker.mjs <modeFile> <docker args...>
// The mode file is re-read on every call, so a test can change daemon state between calls.
// `run` plays either the trusted grader (/harness/grade.py) or the candidate worker
// (/harness/worker.py), speaking the real R3 line protocol through the host relay.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const [modeFile, command, ...args] = process.argv.slice(2);
const mode = readFileSync(modeFile, 'utf8').trim();
const startedMarker = `${modeFile}.started`;
const DAEMON_DOWN = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?';
const value = flag => args[args.indexOf(flag) + 1];
const mountSource = target => args.filter((_a, i) => args[i - 1] === '--mount')
  .map(spec => Object.fromEntries(spec.split(',').map(part => part.split('='))))
  .find(spec => spec.target === target)?.source;
const hang = () => setInterval(() => {}, 1000);
const role = args.includes('/harness/grade.py') ? 'grader' : 'worker';
const emit = message => process.stdout.write(`${JSON.stringify(message)}\n`);

function expectedIds() {
  const grade = mountSource('/grade');
  const ids = [];
  for (const file of readdirSync(join(grade, 'tests')).filter(name => /^test_.*\.py$/.test(name)).sort()) {
    for (const [, name] of readFileSync(join(grade, 'tests', file), 'utf8').matchAll(/^def (test_\w+)/gm)) ids.push(`tests/${file}::${name}`);
  }
  return ids;
}
const report = (statusFor, exitCode) => {
  emit({ type: 'report', exit_code: exitCode, tests: expectedIds().map((id, i) => ({ id, status: statusFor(i), duration_ms: 1 })) });
  process.exit(exitCode);
};

if (command === 'version') {
  if (mode === 'down' || mode === 'dies-mid-run') { console.error(DAEMON_DOWN); process.exit(1); }
  if (mode === 'version-hangs') hang();
  else if (mode === 'run-hangs-daemon-dies' && existsSync(startedMarker)) { console.error(DAEMON_DOWN); process.exit(1); }
  else { console.log('29.8.0'); process.exit(0); }
} else if (command === 'run') {
  if (mode === 'down') { console.error(`docker: ${DAEMON_DOWN}`); process.exit(1); }
  writeFileSync(value('--cidfile'), `fake${role}containerid0123456789\n`);
  if (mode === 'dies-mid-run') {
    console.error('error during connect: Post "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.47/containers/create": EOF');
    process.exit(1);
  }
  if (mode === 'run-hangs-daemon-dies') { writeFileSync(startedMarker, ''); hang(); }
  else if (role === 'worker') {
    emit({ id: 0, ok: true, kind: 'ready' });
    const lines = createInterface({ input: process.stdin });
    lines.on('line', line => {
      const request = JSON.parse(line);
      if (mode === 'candidate-exit-1') process.exit(1);
      if (mode === 'worker-garbage') { process.stdout.write('not json at all\n'); return; }
      if (mode === 'worker-wrong-id') { emit({ id: request.id + 7, ok: true, value: 1 }); return; }
      emit({ id: request.id, ok: true, value: 1 });
    });
    lines.on('close', () => process.exit(0));
  } else if (mode === 'pass') report(() => 'pass', 0);
  else if (mode === 'fail-with-noise') {
    console.error('WARNING: Your kernel does not support swap limit capabilities (/var/run/docker.sock)');
    console.error('grader pytest line');
    report(i => (i === 0 ? 'fail' : 'pass'), 1);
  } else {
    // Grader that calls the candidate once, then reports based on the relayed reply.
    emit({ id: 1, op: 'call', module: 'app.words', name: 'count_unique', args: [['a']], kwargs: { __t: 'dict', v: [] } });
    const lines = createInterface({ input: process.stdin });
    lines.once('line', line => {
      const reply = JSON.parse(line);
      writeFileSync(`${modeFile}.reply`, line);
      report(() => (reply.ok ? 'pass' : 'error'), reply.ok ? 0 : 1);
    });
  }
} else if (command === 'kill') {
  process.exit(mode === 'run-hangs-daemon-dies' ? 1 : 0);
} else {
  process.exit(0); // rm -f, etc.
}
