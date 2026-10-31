import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadSeedBank } from '../../api/seed-bank.js';
import { createValidationEngine } from '../../generation/validate.js';
import { createDockerRunner } from '../../runner/dockerRunner.js';
import type { PrivateTask } from '../../contracts/internal.js';

const ready = spawnSync('docker', ['image','inspect','torquecode-runner-python:dev'], {stdio:'ignore',timeout:5000}).status===0;
const validate = createValidationEngine(createDockerRunner());
async function check(task: PrivateTask) {
  const result=await validate({task,claimed_topics:task.dsa_topics},{signal:AbortSignal.timeout(120000)});
  if(result.kind!=='ok')throw Error('Validation unavailable');
  return result.value;
}
describe.skipIf(!ready)('independent correctness regressions (real Docker)',()=>{
  it('rejects a second-largest reference that creates its own maximum answer key',async()=>{
    const bank=await loadSeedBank();const task=structuredClone(bank.novice![0]!) as PrivateTask & {family_id?:string};
    task.family_id='second_largest_v1';task.task_id='wrong-second-largest';task.source='generated';
    task.title='Second-largest distinct integer';
    task.statement_md='Return the second-largest DISTINCT integer in nums, or None when fewer than two distinct integers exist. For [1, 2, 3], return 2. Only app/summary.py is editable.';
    task.reference_files[0]!.content='def second_largest(nums):\n    return max(nums, default=None)\n';
    task.files[0]!.content='def second_largest(nums):\n    return None\n';
    task.tests=[{path:'tests/test_visible.py',visibility:'visible',ids:['tests/test_visible.py::test_distinct'],content:'from app.summary import second_largest\ndef test_distinct():\n    assert second_largest([1, 2, 3]) == 3\n'},
      {path:'tests/test_hidden.py',visibility:'hidden',ids:['tests/test_hidden.py::test_empty'],content:'from app.summary import second_largest\ndef test_empty():\n    assert second_largest([]) == None\n'}];
    task.visible_tests=[{id:task.tests[0]!.ids[0]!,path:task.tests[0]!.path,content:task.tests[0]!.content}];
    task.f2p_ids=[task.tests[0]!.ids[0]!];task.p2p_ids=[task.tests[1]!.ids[0]!];
    const receipt=await check(task);
    expect(receipt.valid).toBe(false);
    expect(receipt.gates.find(g=>g.gate==='differential')?.status).toBe('fail');
  },120000);
  it('rejects a false prose example instead of awarding examples pass',async()=>{
    const task=structuredClone((await loadSeedBank()).novice![0]!);
    task.statement_md=task.statement_md.replace('[2, 3, 9] returns 9','[2, 3, 9] returns 8');
    const receipt=await check(task);
    expect(receipt.valid).toBe(false);
    expect(receipt.gates.find(g=>g.gate==='examples')?.status).toBe('fail');
  },120000);
  it('does not certify an unreviewed DP implementation as an arrays-only reference',async()=>{
    const task=structuredClone((await loadSeedBank()).novice![0]!);
    task.reference_files[0]!.content='def peak_requests(counts):\n    dp = [0] * (len(counts) + 1)\n    for i in range(len(counts)):\n        dp[i + 1] = max(dp[i], counts[i])\n    return dp[-1]\n';
    const receipt=await check(task);
    expect(receipt.valid).toBe(false);
    expect(receipt.gates.find(g=>g.gate==='topics')?.status).toBe('fail');
  },120000);
});
