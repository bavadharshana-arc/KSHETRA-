/**
 * Start just the FastAPI backend (uvicorn) with whichever Python has the deps.
 *
 *   npm run backend
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolvePython } from './_python.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const backendDir = join(root, 'backend');
const isWin = process.platform === 'win32';

if (!existsSync(join(backendDir, 'main.py'))) {
  console.error('Cannot find backend/main.py — run this from the project root.');
  process.exit(1);
}

const py = resolvePython();
if (py.missingDeps) {
  console.error(
    '\nThe backend dependencies are not installed for any Python on PATH.\n' +
    'Install them with:  npm run backend:install\n' +
    '(equivalent to: python -m pip install -r backend/requirements.txt)\n'
  );
  process.exit(1);
}

const args = [...py.pre, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'];
const child = spawn(py.cmd, args, { cwd: backendDir, stdio: 'inherit', shell: isWin, env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
