import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { promisify } from 'node:util'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

// Execute only explicitly named, repository-authored teaching snippets.
// No Linux service, resource-pressure workload, remote host or private log is accessed.
// On Windows explicitly set BOOKS_BASH to the reviewed Git Bash executable.
const bash = process.env.BOOKS_BASH || 'bash'
const python = process.env.BOOKS_PYTHON || 'python'
const environment = { ...process.env, LC_ALL: 'C' }
for (const key of ['BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS']) delete environment[key]
const executeFile = promisify(execFile)
const snippets = new Map()
let workspace
before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'wiki-linux-examples-'))
  for (const chapter of ['process', 'files', 'shell', 'observe']) {
    const source = await readFile(
      new URL(`../content/linux/${chapter}.md`, import.meta.url),
      'utf8',
    )
    const tree = unified().use(remarkParse).parse(source)
    for (const node of tree.children) {
      if (node.type !== 'code') continue
      const id = node.value.match(/^# example: ([a-z-]+)$/m)?.[1]
      if (!id) continue
      assert.ok(!snippets.has(id), `Duplicate example ${id}`)
      snippets.set(id, { language: node.lang, code: `${node.value}\n` })
    }
  }
  for (const [id, { code, language }] of snippets) {
    await writeFile(path.join(workspace, `${id}.${language === 'python' ? 'py' : 'sh'}`), code)
  }
})
after(async () => {
  if (workspace) await rm(workspace, { recursive: true, force: true })
})
async function scratch() {
  return mkdtemp(path.join(workspace, 'case-'))
}
function options(cwd, input = '') {
  return { cwd, input, env: environment, encoding: 'utf8', timeout: 10000, maxBuffer: 128 * 1024 }
}
function run(id, { cwd = workspace, input = '', args = [] } = {}) {
  assert.ok(snippets.has(id), `Missing source example: ${id}`)
  const file = path.join(workspace, `${id}.sh`).replaceAll('\\', '/')
  const result = spawnSync(bash, ['--noprofile', '--norc', file, ...args], options(cwd, input))
  if (result.error) throw result.error
  assert.equal(result.signal, null)
  return result
}
function success(id, output) {
  const result = run(id)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, output)
  assert.equal(result.stderr, '')
}

test('All marked Bash examples have valid Bash syntax', () => {
  assert.equal(snippets.size, 11)
  for (const [id, { language }] of snippets) {
    if (language !== 'bash') continue
    const file = path.join(workspace, `${id}.sh`).replaceAll('\\', '/')
    const result = spawnSync(bash, ['--noprofile', '--norc', '-n', file], options(workspace))
    if (result.error) throw result.error
    assert.equal(result.status, 0, `${id}: ${result.stderr}`)
  }
})
test('Child exit status is collected without being overwritten', () => {
  success('process-child', 'child output\ncollected exit=7\n')
})
test('A child environment change does not mutate the parent environment', () => {
  success('process-environment', 'child=child\nparent=parent\n')
})
test('Quoted empty arguments remain distinct from zero arguments', () => {
  success('shell-argv', 'argc=1\n<annual report.txt>\nargc=1\n<>\nargc=0\n')
})
test('Arrays preserve whitespace, empty elements and literal wildcards', () => {
  success('shell-array', 'first file.txt\n\n*.txt\n')
})
test('Conditional patterns differ from quoted literals', () => {
  success('shell-condition', 'suffix matched\nliteral did not match\n')
})
test('Here-document delimiter quoting controls expansion', () => {
  success('shell-heredoc', '$name is literal here.\nHello, student.\n')
})
test('Pipeline status and stage statuses are captured together', () => {
  success('shell-pipeline-status', 'overall=5 stages=3,5,0\n')
})
test('sort and uniq count the stated records', () => {
  const result = run('shell-counts')
  assert.equal(result.status, 0, result.stderr)
  const rows = result.stdout
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
  assert.deepEqual(rows, [
    ['3', 'info'],
    ['2', 'warn'],
    ['1', 'error'],
  ])
})
test('Log summary handles normal, empty and unterminated final records', () => {
  for (const [input, expected] of [
    ['info\nwarn\ninfo\n', 'info=2\nwarn=1\nerror=0\n'],
    ['', 'info=0\nwarn=0\nerror=0\n'],
    ['info\nerror', 'info=1\nwarn=0\nerror=1\n'],
  ]) {
    const result = run('shell-log-summary', { input })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, expected)
  }
})
test('Invalid records fail without publishing partial summary to stdout', () => {
  for (const input of ['info\nwarning\n', '\n', ' info\n', 'info\r\n', 'warn\\\n']) {
    const result = run('shell-log-summary', { input })
    assert.equal(result.status, 2, result.stderr)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /invalid record at line/)
  }
})
test('Raw descriptor duplication shares offset while a separate open does not', () => {
  const result = spawnSync(python, [path.join(workspace, 'files-offset.py')], options(workspace))
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.replaceAll('\r\n', '\n'), 'ab\ncd\nab\n')
})
test('Publisher creates complete content, rejects replacement and removes its temp file', async () => {
  const cwd = await scratch()
  const result = run('observe-publish', { cwd, input: 'checked\n', args: ['report.txt'] })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(path.join(cwd, 'report.txt'), 'utf8'), 'checked\n')
  const retry = run('observe-publish', { cwd, input: 'replacement\n', args: ['report.txt'] })
  assert.equal(retry.status, 2)
  assert.equal(await readFile(path.join(cwd, 'report.txt'), 'utf8'), 'checked\n')
  assert.deepEqual(await readdir(cwd), ['report.txt'])
})
test('Publisher accepts empty input and option-looking target as specified', async () => {
  const cwd = await scratch()
  const result = run('observe-publish', { cwd, args: ['-report.txt'] })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(path.join(cwd, '-report.txt'), 'utf8'), '')
})
test('Publisher rejects missing arguments, directory target and missing parent', async () => {
  const cwd = await scratch()
  for (const args of [[], [''], ['extra', 'argument'], ['.'], ['directory/']]) {
    assert.equal(run('observe-publish', { cwd, args }).status, 2)
  }
  assert.equal(run('observe-publish', { cwd, args: ['missing/report.txt'] }).status, 3)
  assert.deepEqual(await readdir(cwd), [])
})
test('Two concurrent publishers cannot replace or interleave each other', async () => {
  const cwd = await scratch()
  const file = path.join(workspace, 'observe-publish.sh').replaceAll('\\', '/')
  const attempts = ['candidate-A\n', 'candidate-B\n'].map((content) => {
    const pending = executeFile(bash, ['--noprofile', '--norc', file, 'race.txt'], {
      cwd,
      env: environment,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 128 * 1024,
    })
    return {
      child: pending.child,
      content,
      completion: pending.then(
        () => 0,
        (error) => error.code,
      ),
    }
  })
  try {
    // Hold both inputs open until both scripts passed the existence check.
    // This exercises the actual check/use race without modifying the teaching script.
    const deadline = Date.now() + 4000
    while ((await readdir(cwd)).filter((name) => name.startsWith('race.txt.tmp.')).length < 2) {
      assert.ok(Date.now() < deadline, 'Both publishers must reach the temporary-file stage')
      await new Promise((resolve) => setTimeout(resolve, 15))
    }
    for (const attempt of attempts) attempt.child.stdin.end(attempt.content)
    const statuses = await Promise.all(attempts.map((attempt) => attempt.completion))
    assert.deepEqual(statuses.sort(), [0, 5])
  } finally {
    for (const attempt of attempts) {
      if (!attempt.child.stdin.writableEnded) attempt.child.stdin.end()
    }
    await Promise.all(attempts.map((attempt) => attempt.completion))
  }
  assert.ok(
    ['candidate-A\n', 'candidate-B\n'].includes(await readFile(path.join(cwd, 'race.txt'), 'utf8')),
  )
  assert.deepEqual(await readdir(cwd), ['race.txt'])
})
test('Linux-only: unlink removes a name while an open reader retains the object', {
  skip:
    process.platform !== 'linux'
      ? 'Requires a real Linux kernel; not inferred from Git Bash'
      : false,
}, () => {
  const source = `import os, tempfile
with tempfile.TemporaryDirectory(prefix="wiki-unlink-") as directory:
    path = os.path.join(directory, "sample")
    with open(path, "wb") as output:
        output.write(b"alpha")
    with open(path, "rb", buffering=0) as reader:
        os.unlink(path)
        assert not os.path.exists(path)
        assert reader.read() == b"alpha"
`
  const result = spawnSync(python, ['-c', source], options(workspace))
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
})
