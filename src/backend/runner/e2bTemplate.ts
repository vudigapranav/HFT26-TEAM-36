// Builds the E2B sandbox template for RUNNER=e2b from the Docker runner image definition, so both runners grade
// with the same Python and pinned pytest. Run once per E2B account (needs E2B_API_KEY):
//   pnpm --filter @torquecode/backend e2b:template
// The harness hardcodes /harness, /work and /grade; they are created here and owned by the non-root runner user.
import { readFile } from 'node:fs/promises';
import { Template, defaultBuildLogger } from 'e2b';
import { DEFAULT_E2B_TEMPLATE } from './e2bRunner.js';

const dockerfile = await readFile(new URL('./images/python/Dockerfile', import.meta.url), 'utf8');
const finalUser = /^USER 10001:10001\s*$/m;
if (!finalUser.test(dockerfile)) throw new Error('runner Dockerfile changed: expected a final "USER 10001:10001" line');
const definition = dockerfile.replace(finalUser,
  'USER root\nRUN mkdir -p /harness /work /grade && chown runner:runner /harness /work /grade\nUSER runner\nWORKDIR /work');

const name = process.env.E2B_TEMPLATE || DEFAULT_E2B_TEMPLATE;
const info = await Template.build(Template().fromDockerfile(definition), name, {
  cpuCount: 2, memoryMB: 1024, onBuildLogs: defaultBuildLogger(),
});
console.log(JSON.stringify({ template: info.name, template_id: info.templateId, build_id: info.buildId }));
