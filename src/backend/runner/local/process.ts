import { spawn } from 'node:child_process';

// Decoding an incomplete/invalid UTF-8 sequence may expand it to U+FFFD.
// Bound the final encoded text too, without splitting a Unicode code point.
function decodeWithinBudget(buffer: Buffer, budget: number): string {
  const text = buffer.toString('utf8');
  let bytes = 0;
  let end = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > budget) break;
    bytes += size;
    end += character.length;
  }
  return text.slice(0, end);
}

// Trusted developer commands only. This is process supervision, NOT isolation.
export async function runTrustedProcess(command: string, args: string[], options: {
  cwd: string; env: NodeJS.ProcessEnv; signal: AbortSignal; timeout_ms: number; output_bytes: number;
}): Promise<{ code: number | null; stdout: string; stderr: string; timed_out: boolean; output_limited: boolean }> {
  options.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let bytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let outputLimited = false;
    const kill = () => {
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL'); }
      }
    };
    const abort = () => kill();
    options.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; kill(); }, options.timeout_ms);
    const capture = (destination: Buffer[]) => (chunk: Buffer) => {
      const remaining = Math.max(0, options.output_bytes - bytes);
      destination.push(chunk.subarray(0, remaining));
      bytes += Math.min(remaining, chunk.length);
      if (chunk.length > remaining) { outputLimited = true; kill(); }
    };
    child.stdout.on('data', capture(stdout));
    child.stderr.on('data', capture(stderr));
    const cleanup = () => { clearTimeout(timer); options.signal.removeEventListener('abort', abort); kill(); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', code => {
      cleanup();
      if (options.signal.aborted) { reject(options.signal.reason ?? new Error('Aborted')); return; }
      const output = decodeWithinBudget(Buffer.concat(stdout), options.output_bytes);
      const errors = decodeWithinBudget(Buffer.concat(stderr), options.output_bytes - Buffer.byteLength(output));
      resolve({ code, stdout: output, stderr: errors, timed_out: timedOut, output_limited: outputLimited });
    });
    // Close the race between the initial check and listener registration.
    if (options.signal.aborted) kill();
  });
}
