import { resolve, join } from 'node:path'
import { createAttemptClient } from '@jigging/jig/client'
import { Controller } from './controller.ts'
import { diagnostic, FactoryError } from './errors.ts'
import { exists, record } from './files.ts'

const help = `Factory — file-native, agent-directed work

  bun run factory init WORKSPACE
  bun run factory status WORKSPACE
  bun run factory reconcile WORKSPACE
  bun run factory run WORKSPACE [CARD_ID]
  bun run factory recover WORKSPACE
  bun run factory cancel WORKSPACE CARD_ID
  bun run factory accept WORKSPACE CARD_ID "human acceptance note"
  bun run factory requeue WORKSPACE CARD_ID "new-execution authorization"

Write Markdown in board/inbox, move authorized work to ready.
Status is read-only. Reconcile assigns identities without starting work.
Configure source selection in WORKSPACE/factory.json and review the Jig project.
Acceptance never merges or releases code. Recovery never replays execution.
Set JIG_EXECUTABLE to an installed host path, or run with node_modules/.bin in PATH.
`

export async function main(args: string[]) {
  const [command, workspace, id, note] = args
  if (!command || command === '--help') {
    console.log(help)
    return
  }
  if (!workspace)
    throw new FactoryError(
      'WORKSPACE_REQUIRED',
      'Supply a workspace directory. Use --help for commands.',
    )
  const root = resolve(workspace)
  const client = (project: string) =>
    createAttemptClient({
      executable:
        process.env.JIG_EXECUTABLE ?? resolve(import.meta.dir, '../node_modules/.bin/jig'),
      cwd: project,
    })
  const controller = new Controller(root, client)
  if (command === 'init') {
    await controller.initialize()
    const configPath = join(root, 'factory.json')
    if (!(await exists(configPath))) {
      await record(configPath, {
        project: process.cwd(),
        source: process.cwd(),
        selection: [],
        target: 'binding:factory',
        durationMs: 300_000,
      })
    }
    console.log(
      'Workspace created. Set exact source file selection in factory.json; write Markdown in board/inbox.',
    )
  } else if (command === 'status') console.log(JSON.stringify(await controller.status(), null, 2))
  else if (command === 'reconcile')
    console.log(JSON.stringify(await controller.reconcile(), null, 2))
  else if (command === 'run') {
    const abort = new AbortController()
    const stop = () => abort.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      console.log(JSON.stringify(await controller.run(id, abort.signal)))
    } finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
    }
  } else if (command === 'recover') console.log(JSON.stringify(await controller.recover(), null, 2))
  else if (command === 'cancel' && id) console.log(JSON.stringify(await controller.cancel(id)))
  else if (command === 'accept' && id && note) {
    await controller.accept(id, note)
    console.log('Human acceptance recorded. No Git mutation performed.')
  } else if (command === 'requeue' && id && note) {
    await controller.requeue(id, note)
    console.log('New execution explicitly authorized.')
  } else
    throw new FactoryError('INVALID_COMMAND', 'Unknown command or missing arguments. Use --help.')
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(JSON.stringify(diagnostic(error)))
    process.exitCode = 1
  }
}
