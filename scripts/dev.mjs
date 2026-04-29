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

const processes = [];

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWindows,
  });

  child.on('exit', (code, signal) => {
    if (signal || code !== 0) {
      console.error(`${label} exited with ${signal ?? code}.`);
      shutdown(signal ?? code ?? 1);
    }
  });

  processes.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }

  process.exit(typeof code === 'number' ? code : 0);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('npm', ['run', 'dev:client'], 'Vite');
start(pythonCommand, ['report_api.py'], 'Report API');