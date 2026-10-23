import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { arch, platform, release } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { FactoryError } from '../src/errors.ts'
import { directory, record } from '../src/files.ts'
import { qualificationCode } from './diagnostics.ts'

// No fixture app, Agent, injected runtime, private state or alternate sandbox.
// The source being reviewed is exactly what the installed public `init` creates.
const executable =
  process.env.JIG_EXECUTABLE ?? resolve(import.meta.dir, '../node_modules/.bin/jig')
const evidence = resolve('.tmp', `host-probe-${randomUUID()}`)
const project = join(evidence, 'project')
const manifest = JSON.parse(
  await readFile(resolve(import.meta.dir, '../package.json'), 'utf8'),
) as {
  dependencies: { '@jigging/jig': string; '@jigging/flow': string }
}
await directory(evidence, true)
const exec = promisify(execFile)
const checks: string[] = []
let stage = 'version'
const report = (status: 'passed' | 'failed', code?: string) => ({
  evidence: 'installed-public-template-smoke',
  status,
  stage,
  checks,
  expectedJig: manifest.dependencies['@jigging/jig'],
  expectedFlow: manifest.dependencies['@jigging/flow'],
  executableSelection: process.env.JIG_EXECUTABLE ? 'operator-selected' : 'application-default',
  host: {
    platform: platform(),
    arch: arch(),
    kernel: release(),
    bubblewrapSelection: process.env.JIG_BWRAP_PATH ? 'explicit' : 'default',
  },
  ...(code ? { code } : {}),
  artifacts: relative(process.cwd(), evidence),
  liveAgent: 'not-run',
})

async function command(name: string, args: string[], cwd = process.cwd()): Promise<string> {
  try {
    const result = await exec(executable, args, { cwd, timeout: 120_000, maxBuffer: 2_097_152 })
    await writeFile(join(evidence, `${name}.stdout.txt`), result.stdout, { mode: 0o600 })
    await writeFile(join(evidence, `${name}.stderr.txt`), result.stderr, { mode: 0o600 })
    return result.stdout
  } catch (error) {
    if (error && typeof error === 'object') {
      const captured = error as { stdout?: unknown; stderr?: unknown }
      for (const stream of ['stdout', 'stderr'] as const) {
        const text = captured[stream]
        if (typeof text === 'string') {
          await writeFile(join(evidence, `${name}.${stream}.txt`), text, { mode: 0o600 })
        }
      }
    }
    throw error
  }
}

try {
  if ((await command('version', ['--version'])).trim() !== manifest.dependencies['@jigging/jig']) {
    throw new FactoryError(
      'QUALIFICATION_VERSION_MISMATCH',
      'Select the pinned installed Jig executable.',
    )
  }
  checks.push('installed version matches the public dependency pin')
  stage = 'init'
  await command('init', ['init', project])
  const flowManifest = JSON.parse(
    await readFile(join(project, 'flows/hello/package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> }
  assert.equal(flowManifest.dependencies?.['@jigging/flow'], manifest.dependencies['@jigging/flow'])
  checks.push('unmodified public template declares the pinned FLOW SDK')
  stage = 'review'
  // This explicitly permits resolution of the generated public template only.
  await command('review', ['review', '--yes', '--allow-resolution-network', '--details'], project)
  checks.push('generated code-only template reviewed')
  stage = 'run'
  const terminal = JSON.parse(
    await command(
      'run',
      ['run', 'flow:flows/hello', '--input', '"Factory qualification"', '--json'],
      project,
    ),
  ) as {
    status?: string
    outcome?: string
    output?: { message?: string }
  }
  assert.equal(terminal.status, 'succeeded')
  assert.equal(terminal.outcome, 'done')
  assert.equal(terminal.output?.message, 'Hello, Factory qualification!')
  checks.push('greeting execution produced its expected result')
  stage = 'complete'
  await record(join(evidence, 'report.json'), report('passed'))
  console.log(JSON.stringify(report('passed'), null, 2))
} catch (error) {
  const result = report('failed', qualificationCode(error))
  await record(join(evidence, 'report.json'), result)
  console.error(JSON.stringify(result, null, 2))
  process.exitCode = 1
}
