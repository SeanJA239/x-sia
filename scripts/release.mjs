// This tool NEVER deploys, migrates remote data, logs in, or reads secret values/files.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { root, run } from './workflow.mjs'

export function validateRelease(env) {
  const requireMatch = (key, pattern) => {
    const value = env[key] ?? ''
    if (!pattern.test(value) || /TODO|REQUIRED|example|placeholder/i.test(value))
      throw new Error(`Missing or invalid release input: ${key}`)
    return value
  }
  requireMatch('DEPLOY_ENV', /^production$/)
  const account = requireMatch('CLOUDFLARE_ACCOUNT_ID', /^[a-f0-9]{32}$/i)
  const database = requireMatch(
    'CLOUDFLARE_DATABASE_ID',
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
  )
  if (/^0+$/.test(account) || /^0+$/.test(database.replaceAll('-', '')))
    throw new Error('Release resource IDs must not be dummy IDs')
  const worker = requireMatch('CLOUDFLARE_WORKER_NAME', /^[a-z][a-z0-9-]{2,62}$/)
  const databaseName = requireMatch('CLOUDFLARE_DATABASE_NAME', /^[a-z][a-z0-9-]{2,62}$/)
  const bucket = requireMatch('CLOUDFLARE_R2_BUCKET', /^[a-z][a-z0-9-]{2,62}$/)
  const origin = requireMatch('API_ORIGIN', /^https:\/\/[a-z0-9.-]+(?::443)?$/i)
  const hostname = new URL(origin).hostname
  if (
    !hostname.includes('.') ||
    /^[\d.]+$/.test(hostname) ||
    /\.(localhost|local|internal|invalid|test)$/.test(hostname)
  )
    throw new Error('API_ORIGIN must be a public HTTPS Worker origin')
  // Attestations are non-secret metadata. They are NOT proof from Cloudflare.
  requireMatch('SIGN_SECRET_PROVISIONED', /^production$/)
  requireMatch('MIGRATIONS_REVIEWED', /^production$/)
  for (const name of ['PORTAL_IMAGE', 'WIKI_IMAGE', 'SITE_IMAGE'])
    requireMatch(name, /^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/)
  return { account, database, databaseName, worker, bucket }
}

async function template() {
  return JSON.parse(
    await readFile(path.join(root, 'docker/wrangler.production.example.json'), 'utf8'),
  )
}
async function dryRun() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'x-sia-worker-'))
  const output = path.join(root, '.artifacts/worker')
  try {
    const config = await template()
    config.main = path.join(root, 'apps/api/src/index.ts')
    config.env.production.name = 'x-sia-api-dry-run'
    delete config.env.production.account_id
    Object.assign(config.env.production.d1_databases[0], {
      database_name: 'x-sia-db',
      database_id: '00000000-0000-0000-0000-000000000000',
      migrations_dir: path.join(root, 'apps/api/migrations'),
    })
    config.env.production.r2_buckets[0].bucket_name = 'x-sia-dry-run'
    const configPath = path.join(temporary, 'wrangler.json')
    await writeFile(configPath, JSON.stringify(config, null, 2))
    await rm(output, { recursive: true, force: true })
    await mkdir(output, { recursive: true })
    // Isolated cwd/config/HOME; no .dev.vars, .env or ambient Cloudflare credentials.
    run(
      path.join(root, 'apps/api/node_modules/.bin/wrangler'),
      ['deploy', '--dry-run', '--env', 'production', '--config', configPath, '--outdir', output],
      {
        cwd: temporary,
        env: {
          PATH: process.env.PATH,
          HOME: temporary,
          XDG_CONFIG_HOME: temporary,
          CI: '1',
          WRANGLER_SEND_METRICS: 'false',
          CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
        },
      },
    )
    await cp(path.join(root, 'apps/api/migrations'), path.join(output, 'migrations'), {
      recursive: true,
    })
    await cp(
      path.join(root, 'docker/wrangler.production.example.json'),
      path.join(output, 'wrangler.production.example.json'),
    )
    console.log('Worker dry-run complete: .artifacts/worker (not deployed)')
  } catch (error) {
    await rm(output, { recursive: true, force: true })
    throw error
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const action = process.argv[2]
    if (action === 'dry-run') await dryRun()
    else if (action === 'check') {
      validateRelease(process.env)
      console.log(
        'Non-secret release inputs validated; remote secrets/resources are NOT verified. No deployment.',
      )
    } else {
      // Even a fully populated environment cannot accidentally turn this into a deployment.
      throw new Error(
        'Public deployment is disabled. Use deploy:dry-run / deploy:check and the owner runbook.',
      )
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
