// Fake docker CLI for deterministic runner tests: node fake-docker.mjs <modeFile> <docker args...>
// The mode file is re-read on every call, so a test can change daemon state between calls.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [modeFile, command, ...args] = process.argv.slice(2);
const mode = readFileSync(modeFile, 'utf8').trim();
const startedMarker = `${modeFile}.started`;
const DAEMON_DOWN = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?';
const value = flag => args[args.indexOf(flag) + 1];
const mountSource = target => args.filter((_a, i) => args[i - 1] === '--mount')
  .map(spec => Object.fromEntries(spec.split(',').map(part => part.split('='))))
  .find(spec => spec.target === target)?.source;
const hang = () => setInterval(() => {}, 1000);

function writeReport(failFirst) {
  const work = mountSource('/work');
  const out = mountSource('/out');
  const cases = [];
  for (const file of readdirSync(join(work, 'tests')).filter(name => /^test_.*\.py$/.test(name)).sort()) {
    for (const [, name] of readFileSync(join(work, 'tests', file), 'utf8').matchAll(/^def (test_\w+)/gm)) {
      const failure = failFirst && cases.length === 0 ? '<failure message="assert">AssertionError</failure>' : '';
      cases.push(`<testcase classname="tests.${file.slice(0, -3)}" name="${name}" time="0.001">${failure}</testcase>`);
    }
  }
  writeFileSync(join(out, 'results.xml'), `<?xml version="1.0"?><testsuites><testsuite name="pytest">${cases.join('')}</testsuite></testsuites>`);
}

if (command === 'version') {
  if (mode === 'down' || mode === 'dies-mid-run') { console.error(DAEMON_DOWN); process.exit(1); }
  if (mode === 'version-hangs') hang();
  else if (mode === 'run-hangs-daemon-dies' && existsSync(startedMarker)) { console.error(DAEMON_DOWN); process.exit(1); }
  else { console.log('29.8.0'); process.exit(0); }
} else if (command === 'run') {
  if (mode === 'down') { console.error(`docker: ${DAEMON_DOWN}`); process.exit(1); }
  writeFileSync(value('--cidfile'), 'fakecontainerid0123456789\n');
  if (mode === 'dies-mid-run') {
    console.error('error during connect: Post "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.47/containers/create": EOF');
    process.exit(1);
  }
  if (mode === 'run-hangs-daemon-dies') { writeFileSync(startedMarker, ''); hang(); }
  else if (mode === 'candidate-exit-1') process.exit(1);
  else if (mode === 'pass') { writeReport(false); process.exit(0); }
  else if (mode === 'fail-with-noise') {
    writeReport(true);
    console.error('WARNING: Your kernel does not support swap limit capabilities (/var/run/docker.sock)');
    console.error('candidate stderr line');
    process.exit(1);
  }
} else if (command === 'kill') {
  process.exit(mode === 'run-hangs-daemon-dies' ? 1 : 0);
} else {
  process.exit(0); // rm -f, etc.
}
