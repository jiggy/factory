import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

test('CI invokes declared package scripts', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const commands = [...workflow.matchAll(/\bbun run ([\w:-]+)/g)].map((match) => match[1]!)
  expect(commands.length).toBeGreaterThan(0)
  for (const command of commands) {
    expect(typeof manifest.scripts[command]).toBe('string')
  }
})
