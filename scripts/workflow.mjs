// Explicit, sequential local gates. No deployment or implicit package installation.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.error || result.status !== 0)
    throw new Error(`Local command failed: ${command} (exit ${result.status ?? 'unavailable'})`)
}

const tasks = {
  quality: [
    ['check'],
    ['test:deployment'],
    ['--filter', 'api', 'typecheck'],
    ['--filter', 'api', 'exec', 'vitest', 'run', '--maxWorkers=2'],
    ['--filter', 'app', 'typecheck'],
    ['books:test'],
    ['--filter', 'wiki', 'typecheck'],
    ['--filter', 'site', 'types:check'],
  ],
  build: [
    ['build:web'],
    ['books:build'],
    ['--filter', 'wiki', 'build'],
    ['--filter', 'site', 'build'],
    ['deploy:dry-run'],
  ],
  web: [['--filter', 'app', 'exec', 'expo', 'export', '--platform', 'web']],
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const task = process.argv[2]
    if (!Object.hasOwn(tasks, task)) throw new Error('Choose quality, build or web')
    for (const args of tasks[task])
      run('pnpm', args, {
        env: {
          ...process.env,
          CI: '1',
          EXPO_NO_DOTENV: '1',
          EXPO_NO_TELEMETRY: '1',
          WRANGLER_SEND_METRICS: 'false',
          ...(task === 'web' ? { EXPO_PUBLIC_API_URL: '', EXPO_PUBLIC_WIKI_URL: '/wiki/' } : {}),
        },
      })
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
