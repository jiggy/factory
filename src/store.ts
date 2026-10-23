import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { Prepared } from '@jigging/jig/client'
import type { Card } from './board.ts'
import {
  directory,
  entries,
  exists,
  isMissing,
  record,
  requireDirectory,
  syncDirectory,
  textFile,
} from './files.ts'
import { FactoryError } from './errors.ts'
import type { AttemptFacts, Decision } from './analysis.ts'

export interface Transaction {
  version: 1
  sequence: number
  attemptId: string
  createdAt: string
  task: Card
  prepared: Prepared
  project: string
  configurationDigest: string
}

export class Store {
  constructor(readonly root: string) {}
  get privateRoot() {
    return join(this.root, '.factory')
  }
  attemptPath(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id))
      throw new FactoryError('INVALID_ATTEMPT', 'Select a valid application attempt ID.')
    return join(this.privateRoot, 'attempts', id)
  }
  async init() {
    const hadPrivateRoot = await exists(this.privateRoot)
    await directory(this.privateRoot, true)
    if (!hadPrivateRoot) await syncDirectory(this.root)
    const hadAttempts = await exists(join(this.privateRoot, 'attempts'))
    await directory(join(this.privateRoot, 'attempts'), true)
    if (!hadAttempts) await syncDirectory(this.privateRoot)
  }
  async event(attemptId: string, kind: string, facts: unknown) {
    if (!/^[a-z-]+$/.test(kind)) throw new Error('Invalid event kind')
    await record(join(this.attemptPath(attemptId), `${Date.now()}-${randomUUID()}-${kind}.json`), {
      kind,
      at: new Date().toISOString(),
      facts,
    })
  }
  async persist(transaction: Transaction) {
    await directory(this.attemptPath(transaction.attemptId), true)
    await syncDirectory(join(this.privateRoot, 'attempts'))
    // One record atomically contains both the full Prepared and the captured task.
    // A failed/partial write cannot cause submission: persist must finish first.
    await record(join(this.attemptPath(transaction.attemptId), 'transaction.json'), transaction)
  }
  async transactions(): Promise<Transaction[]> {
    if (!(await exists(this.privateRoot))) return []
    await requireDirectory(this.privateRoot, true)
    if (!(await exists(join(this.privateRoot, 'attempts')))) return []
    await requireDirectory(join(this.privateRoot, 'attempts'), true)
    const result: Transaction[] = []
    for (const id of await entries(join(this.privateRoot, 'attempts'))) {
      const path = join(this.attemptPath(id), 'transaction.json')
      if (!(await exists(path)))
        throw new FactoryError(
          'INCOMPLETE_TRANSACTION',
          'An attempt transaction is incomplete. Inspect private evidence; no work will be dispatched.',
        )
      const parsed: unknown = JSON.parse(await textFile(path, 2_097_152))
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (parsed as Transaction).version !== 1 ||
        !Number.isSafeInteger((parsed as Transaction).sequence) ||
        (parsed as Transaction).sequence < 1 ||
        (parsed as Transaction).attemptId !== id ||
        !(parsed as Transaction).prepared?.ticket ||
        !(parsed as Transaction).task?.id
      ) {
        throw new FactoryError(
          'INVALID_TRANSACTION',
          'An attempt transaction cannot be validated. Do not replay it.',
        )
      }
      result.push(parsed as Transaction)
    }
    result.sort((a, b) => a.sequence - b.sequence)
    if (result.some((transaction, index) => transaction.sequence !== index + 1)) {
      throw new FactoryError(
        'INVALID_TRANSACTION_ORDER',
        'Attempt history has missing or duplicate sequence facts. Preserve evidence; do not replay.',
      )
    }
    return result
  }
  async facts(): Promise<AttemptFacts[]> {
    const facts: AttemptFacts[] = []
    for (const transaction of await this.transactions()) {
      const id = transaction.attemptId
      const [hasDecision, hasAcceptance, requeued] = await Promise.all([
        this.has(id, 'disposition.json'),
        this.has(id, 'acceptance.json'),
        this.has(id, 'requeue.json'),
      ])
      const [decision, acceptance] = await Promise.all([
        hasDecision ? this.read<Decision>(id, 'disposition.json') : undefined,
        hasAcceptance ? this.read<{ taskDigest: string }>(id, 'acceptance.json') : undefined,
      ])
      facts.push({
        sequence: transaction.sequence,
        attemptId: id,
        task: {
          id: transaction.task.id,
          name: transaction.task.name,
          digest: transaction.task.digest,
        },
        ...(decision
          ? { decision: { taskDigest: decision.taskDigest, disposition: decision.disposition } }
          : {}),
        ...(acceptance ? { acceptedDigest: acceptance.taskDigest } : {}),
        requeued,
      })
    }
    return facts
  }
  async activeController(): Promise<boolean> {
    let owner: { pid: number }
    try {
      owner = JSON.parse(await textFile(join(this.privateRoot, 'controller.lock'))) as {
        pid: number
      }
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) {
      throw new FactoryError(
        'INVALID_CONTROLLER_LOCK',
        'Controller ownership cannot be validated. Preserve state before recovery.',
      )
    }
    try {
      process.kill(owner.pid, 0)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return true
      throw error
    }
  }
  async has(attemptId: string, name: string) {
    return exists(join(this.attemptPath(attemptId), name))
  }
  async save(attemptId: string, name: string, value: unknown) {
    if (!/^[a-z-]+\.json$/.test(name)) throw new Error('Invalid record name')
    await record(join(this.attemptPath(attemptId), name), value)
  }
  async read<T>(attemptId: string, name: string): Promise<T> {
    return JSON.parse(await textFile(join(this.attemptPath(attemptId), name), 16_777_216)) as T
  }
  async locked<T>(action: () => Promise<T>, recoverDeadOwner = false): Promise<T> {
    await this.init()
    const path = join(this.privateRoot, 'controller.lock')
    if (await exists(path)) {
      const old = JSON.parse(await textFile(path)) as { pid: number; nonce: string }
      let alive = true
      try {
        process.kill(old.pid, 0)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false
        else throw error
      }
      if (alive || !recoverDeadOwner) {
        throw new FactoryError(
          'CONTROLLER_LOCKED',
          'Another controller owns this workspace, or recovery is required. Stop the owner or use recover after it exits.',
        )
      }
      await unlink(path)
    }
    const nonce = randomUUID()
    await record(path, { pid: process.pid, nonce })
    try {
      return await action()
    } finally {
      const current = JSON.parse(await textFile(path)) as { nonce: string }
      if (current.nonce === nonce) {
        await unlink(path)
        await syncDirectory(this.privateRoot)
      }
    }
  }
}
