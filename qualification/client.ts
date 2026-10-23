import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, relative, resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { AttemptClientError, createAttemptClient, type PrepareRequest } from '@jigging/jig/client'
import { directory, record } from '../src/files.ts'
import { Controller } from '../src/controller.ts'
import { FactoryError } from '../src/errors.ts'
import { qualificationCode } from './diagnostics.ts'

const project = resolve(import.meta.dir, 'project')
const executable =
  process.env.JIG_EXECUTABLE ?? resolve(import.meta.dir, '../node_modules/.bin/jig')
const evidence = resolve('.tmp', `qualification-${randomUUID()}`)
await directory(evidence, true)
const checks: string[] = []
const client = createAttemptClient({ executable, cwd: project })
const exec = promisify(execFile)
const dependencies = (
  JSON.parse(await readFile(resolve(import.meta.dir, '../package.json'), 'utf8')) as {
    dependencies: { '@jigging/jig': string; '@jigging/flow': string }
  }
).dependencies
let active: Awaited<ReturnType<typeof client.submit>> | undefined
let stage = 'version'
const report = (status: string, code?: string) => ({
  evidence: 'installed-public-host',
  status,
  stage,
  jig: dependencies['@jigging/jig'],
  flow: dependencies['@jigging/flow'],
  executableSelection: process.env.JIG_EXECUTABLE ? 'operator-selected' : 'application-default',
  artifacts: relative(process.cwd(), evidence),
  checks,
  ...(code ? { code } : {}),
  liveAgent: 'not-run',
})
try {
  const version = await exec(executable, ['--version'], { maxBuffer: 65_536, timeout: 10_000 })
  if (version.stdout.trim() !== dependencies['@jigging/jig']) {
    throw new FactoryError(
      'QUALIFICATION_VERSION_MISMATCH',
      'Select the pinned installed Jig executable.',
    )
  }
  stage = 'review'
  const review = await exec(executable, ['review', '--yes', '--allow-authority-changes'], {
    cwd: project,
    maxBuffer: 2_097_152,
    timeout: 120_000,
  })
  await writeFile(join(evidence, 'review.txt'), review.stdout + review.stderr, { mode: 0o600 })
  stage = 'inspect'
  const inspected = (await client.inspect({ target: 'flow:flows/echo' })) as { approval: string }
  assert.equal(typeof inspected.approval, 'string')
  checks.push('approved target inspection')
  const source = join(evidence, 'source')
  await mkdir(source)
  await writeFile(join(source, 'note.txt'), 'immutable input\n')

  async function prepare(delayMs = 0, target = 'flow:flows/echo', files = true) {
    const request: PrepareRequest = {
      expectedApproval: inspected.approval,
      target,
      input: { delayMs },
      files: files ? [{ port: 'source', source, selection: ['note.txt'] }] : [],
      constraints: { durationMs: 120_000, resultBytes: 1_048_576, artifactBytes: 33_554_432 },
      outputIntent: { packet: true, receive: ['candidate'] },
    }
    const prepared = await client.prepare(request)
    await record(join(evidence, `prepared-${randomUUID()}.json`), prepared)
    return prepared
  }
  stage = 'preparation'
  const prepared = await prepare(1_000)
  assert.equal((await client.lookup({ ticket: prepared.ticket })).dispatch, 'not-dispatched')
  checks.push('prepare and lookup dispatch no work')
  stage = 'submission'
  active = await client.submit({ ticket: prepared.ticket, request: prepared.canonicalRequest })
  assert.equal(active.role, 'owner')
  const observer = await client.submit({
    ticket: prepared.ticket,
    request: prepared.canonicalRequest,
  })
  assert.equal(observer.role, 'observer')
  assert.equal(observer.receipt.runId, active.receipt.runId)
  observer.close()
  assert.equal(await observer.completion, undefined)
  await assert.rejects(
    client.submit({
      ticket: prepared.ticket,
      request: { ...prepared.canonicalRequest, input: { changed: true } },
    }),
    (error) => error instanceof AttemptClientError && error.code === 'REQUEST_CONFLICT',
  )
  const terminal = await active.completion
  assert.equal(terminal?.terminal?.status, 'succeeded')
  assert.equal(terminal.cleanup, 'confirmed')
  active.close()
  active = undefined
  checks.push('duplicate observer, conflict rejection and owner completion')

  stage = 'retained-export'
  const retained = await client.result({ ticket: prepared.ticket })
  assert.equal(retained.observation.receipt?.runId, observer.receipt.runId)
  const destination = join(evidence, 'final')
  await client.export({
    ticket: prepared.ticket,
    destination,
    source: 'final',
    artifactResult: 'candidate',
  })
  assert.equal(await readFile(join(destination, 'files/note.txt'), 'utf8'), 'immutable input\n')
  await assert.rejects(
    client.export({ ticket: prepared.ticket, destination, artifactResult: 'candidate' }),
  )
  assert.equal(
    (await client.lookup({ ticket: prepared.ticket })).receipt?.runId,
    observer.receipt.runId,
  )
  checks.push('retained export and destination collision without re-execution')

  stage = 'owner-loss'
  const interrupted = await prepare(60_000)
  active = await client.submit({
    ticket: interrupted.ticket,
    request: interrupted.canonicalRequest,
  })
  for (let i = 0; i < 60; i++) {
    if (
      (await client.result({ ticket: interrupted.ticket })).checkpoint?.availability === 'available'
    )
      break
    if (i === 59) throw new Error('Checkpoint unavailable within qualification bound')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  active.close()
  await active.completion.catch(() => undefined)
  active = undefined
  let lost = await client.result({ ticket: interrupted.ticket })
  for (let i = 0; i < 60 && lost.observation.cleanup !== 'confirmed'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    lost = await client.result({ ticket: interrupted.ticket })
  }
  assert.equal(lost.observation.cleanup, 'confirmed')
  assert.notEqual(lost.observation.terminal?.status, 'succeeded')
  assert.equal(lost.checkpoint?.availability, 'available')
  const checkpointDestination = join(evidence, 'checkpoint')
  await client.export({
    ticket: interrupted.ticket,
    destination: checkpointDestination,
    source: 'checkpoint',
  })
  assert.equal(
    await readFile(join(checkpointDestination, 'files/checkpoint.txt'), 'utf8'),
    'accepted progress\n',
  )
  checks.push('owner loss revokes execution; retained checkpoint exports without resumption')

  stage = 'evaluation'
  const iterative = await prepare(0, 'binding:iterate', false)
  const iteration = await client.submit({
    ticket: iterative.ticket,
    request: iterative.canonicalRequest,
  })
  active = iteration
  assert.equal((await iteration.completion)?.terminal?.status, 'succeeded')
  const evaluated = await client.result({ ticket: iterative.ticket })
  await record(join(evidence, 'evaluation.json'), evaluated)
  const evaluations = (
    evaluated.output as { evaluations: { phases: { phase: string; exitCode: number | null }[] }[] }
  ).evaluations
  assert.equal(evaluations.length, 2)
  assert.equal(evaluations[0]!.phases.find((phase) => phase.phase === 'compile')?.exitCode, 0)
  assert.notEqual(evaluations[0]!.phases.find((phase) => phase.phase === 'test')?.exitCode, 0)
  assert.equal(evaluations[1]!.phases.find((phase) => phase.phase === 'compile')?.exitCode, 0)
  assert.equal(evaluations[1]!.phases.find((phase) => phase.phase === 'test')?.exitCode, 0)
  const finalCandidate = join(evidence, 'revised')
  await client.export({
    ticket: iterative.ticket,
    destination: finalCandidate,
    artifactResult: 'candidate',
  })
  assert.equal(
    await readFile(join(finalCandidate, 'files/src/main.ts'), 'utf8'),
    'export const answer = 42;\n',
  )
  iteration.close()
  active = undefined
  checks.push('held candidate → evaluation → revision → evaluation → forwarded artifact')

  stage = 'board-workflow'
  const workspace = join(evidence, 'workspace')
  const controller = new Controller(workspace, () => client)
  await controller.initialize()
  await record(join(workspace, 'factory.json'), {
    project,
    source,
    selection: ['note.txt'],
    target: 'flow:flows/echo',
    durationMs: 120_000,
  })
  await writeFile(join(workspace, 'board/ready/task.md'), '# Synthetic board workflow\n')
  assert.equal((await controller.run()).disposition, 'review')
  const [card] = await controller.status()
  assert.equal(card?.lane, 'review')
  assert.ok(card?.id)
  await controller.accept(
    card.id,
    'Accepted synthetic qualification packet; no software-quality claim.',
  )
  assert.equal((await controller.status())[0]?.lane, 'done')
  checks.push(
    'real controller: Markdown → prepared transaction → Run → review → explicit acceptance',
  )
  stage = 'complete'
  await record(join(evidence, 'report.json'), report('passed'))
  console.log(JSON.stringify(report('passed'), null, 2))
} catch (error) {
  const code = qualificationCode(error)
  // Preserve details privately; never write Prepared/input/tickets to diagnostics.
  await writeFile(
    join(evidence, 'failure.txt'),
    error instanceof Error ? (error.stack ?? error.message) : 'Unknown failure',
    { mode: 0o600 },
  )
  await record(join(evidence, 'report.json'), report('failed', code))
  console.error(JSON.stringify(report('failed', code), null, 2))
  process.exitCode = 1
} finally {
  active?.close()
}
