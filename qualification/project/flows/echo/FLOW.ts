import { handle } from '@jigging/flow'

await handle(async (run) => {
  const input = run.input as { taskDigest?: string; delayMs?: number }
  const candidate = run.attachments.source?.artifact
  if (!candidate) throw new Error('Expected held source')
  await run.call({
    operationId: 'save-progress',
    slot: 'progress',
    input: {
      sequence: 1,
      evidence: { completed: ['captured'] },
      files: { 'checkpoint.txt': 'accepted progress\n' },
      artifacts: { candidate: candidate.reference },
    },
  })
  if (input.delayMs)
    await new Promise((resolve) => setTimeout(resolve, Math.min(input.delayMs!, 60_000)))
  return {
    outcome: 'done',
    output: {
      version: 1,
      taskDigest: input.taskDigest ?? 'qualification',
      disposition: 'review',
      summary: 'Synthetic packet; no model or software-quality claim.',
      trace: [],
    },
    artifactResults: { candidate },
  }
})
