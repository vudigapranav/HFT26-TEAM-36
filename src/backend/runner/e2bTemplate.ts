// Builds the E2B sandbox template for RUNNER=e2b. Run once per E2B account (needs E2B_API_KEY in the repo-root .env):
//   pnpm --filter @torquecode/backend e2b:template
// Python version and the pinned pytest packages are read from the Docker runner's Dockerfile, so both runners grade
// with the same toolchain. The harness hardcodes /harness, /work and /grade; they are owned by the non-root runner
// user, whose shell is bash because E2B starts every command through a shell.
import { readFile } from 'node:fs/promises';
import { Template, defaultBuildLogger } from 'e2b';
import { DEFAULT_E2B_TEMPLATE } from './e2bRunner.js';

const dockerfile = await readFile(new URL('./images/python/Dockerfile', import.meta.url), 'utf8');
const python = dockerfile.match(/^ARG PYTHON_VERSION=(\S+)/m)?.[1];
const pins = [...dockerfile.matchAll(/\b([A-Za-z0-9_.-]+==[A-Za-z0-9_.-]+)/g)].map(match => match[1]!);
if (!python || pins.length === 0) throw new Error('runner Dockerfile changed: expected ARG PYTHON_VERSION and pinned pip packages');

const template = Template()
  .fromImage(`python:${python}-slim`)
  .setEnvs({ PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', PIP_NO_CACHE_DIR: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' })
  .runCmd([
    `pip install --no-deps ${pins.join(' ')}`,
    'python -m pytest --version',
    'id -u runner >/dev/null 2>&1 || useradd --uid 10001 --user-group --create-home --shell /bin/bash runner',
    'mkdir -p /harness /work /grade && chown runner:runner /harness /work /grade',
  ], { user: 'root' })
  .setUser('runner')
  .setWorkdir('/work');

const name = process.env.E2B_TEMPLATE || DEFAULT_E2B_TEMPLATE;
console.log(`Building E2B template "${name}" from python:${python}-slim with ${pins.join(', ')}`);
const info = await Template.build(template, name, { cpuCount: 2, memoryMB: 1024, onBuildLogs: defaultBuildLogger() });
console.log(JSON.stringify({ template: info.name, template_id: info.templateId, build_id: info.buildId }));
