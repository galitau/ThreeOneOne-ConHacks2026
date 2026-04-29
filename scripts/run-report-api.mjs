import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const isWindows = process.platform === 'win32';
const pythonCandidates = isWindows
  ? [resolve(root, '.venv', 'Scripts', 'python.exe'), 'python']
  : [resolve(root, '.venv', 'bin', 'python'), 'python3', 'python'];

const pythonCommand = pythonCandidates.find((candidate) => candidate === 'python' || candidate === 'python3' || existsSync(candidate)) ?? 'python';

const child = spawn(pythonCommand, ['report_api.py'], {
  cwd: root,
  stdio: 'inherit',
  shell: isWindows,
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});