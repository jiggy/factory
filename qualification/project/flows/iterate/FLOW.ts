import { handle } from '@jigging/flow'

await handle(async (run) => {
  const evaluations = []
  let candidate
  for (const value of [41, 42]) {
    const produced = await run.call({
      operationId: `candidate-${value}`,
      slot: 'produce',
      input: { value },
      attachments: { deliverables: { create: true } },
    })
    if (produced.outcome !== 'done' || !produced.artifacts?.deliverables)
      throw new Error('Missing candidate')
    if (candidate)
      await run.release({ operationId: `release-candidate-${value}`, artifact: candidate })
    candidate = produced.artifacts.deliverables
    const result = await run.call({
      operationId: `evaluate-${value}`,
      slot: 'evaluate',
      input: {},
      attachments: { candidate: { read: candidate }, deliverables: { create: true } },
    })
    evaluations.push(result.output)
    if (result.artifacts?.deliverables)
      await run.release({
        operationId: `release-report-${value}`,
        artifact: result.artifacts.deliverables,
      })
  }
  if (!candidate) throw new Error('Missing final candidate')
  return { outcome: 'done', output: { evaluations }, artifactResults: { candidate } }
})
