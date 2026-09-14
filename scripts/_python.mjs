/**
 * Find a Python interpreter that can actually run the KSHETRA backend
 * (i.e. one where `uvicorn` is importable). Different machines expose Python as
 * `python`, `python3`, or the Windows `py` launcher, and only some of them have
 * the backend dependencies installed.
 */
import { spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';

export function resolvePython() {
  const candidates = isWin
    ? ['python', 'py', 'python3', 'py -3']
    : ['python3', 'python'];

  for (const entry of candidates) {
    const [cmd, ...pre] = entry.split(' ');
    try {
      const probe = spawnSync(cmd, [...pre, '-c', 'import uvicorn'], {
        stdio: 'ignore',
      });
      if (!probe.error && probe.status === 0) return { cmd, pre };
    } catch {
      /* try next */
    }
  }

  // Nothing had uvicorn — return the first interpreter that at least runs, so the
  // caller can surface a clear "pip install -r backend/requirements.txt" message.
  for (const entry of candidates) {
    const [cmd, ...pre] = entry.split(' ');
    try {
      const probe = spawnSync(cmd, [...pre, '--version'], { stdio: 'ignore' });
      if (!probe.error && probe.status === 0) return { cmd, pre, missingDeps: true };
    } catch {
      /* try next */
    }
  }

  return { cmd: isWin ? 'python' : 'python3', pre: [], missingDeps: true };
}
