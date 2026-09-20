
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolvePython } from './_python.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const isWin = process.platform === 'win32';

const children = [];
let shuttingDown = false;

function run(name, cmd, args, cwd, color) {
  const child = spawn(cmd, args, { cwd, shell: isWin, env: process.env });
  children.push(child);

  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on('exit', (code) => {
    if (!shuttingDown) {
      process.stdout.write(prefix + `exited with code ${code}. Shutting down the other process.\n`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill(isWin ? undefined : 'SIGTERM');
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const backendDir = join(root, 'backend');
if (!existsSync(join(backendDir, 'main.py'))) {
  console.error('Cannot find backend/main.py — run this from the project root.');
  process.exit(1);
}

const py = resolvePython();
if (py.missingDeps) {
  console.error(
    '\nThe backend dependencies are not installed for any Python on PATH.\n' +
    'Install them first:  npm run backend:install\n'
  );
  process.exit(1);
}

run(
  'backend',
  py.cmd,
  [...py.pre, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
  backendDir,
  '36',
);
run('frontend', isWin ? 'npm.cmd' : 'npm', ['run', 'dev'], root, '35');

process.stdout.write(
  '\nKSHETRA dev environment starting…\n' +
  '  frontend  http://localhost:5173\n' +
  '  backend   http://127.0.0.1:8000  (health: /health)\n' +
  'Press Ctrl+C to stop both.\n\n',
);
