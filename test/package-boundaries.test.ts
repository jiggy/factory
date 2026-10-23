import { expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { exists } from '../src/files.ts'

const root = resolve(import.meta.dir, '..')
const application = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
  dependencies: { '@jigging/flow': string }
}

for (const collection of ['flows', 'qualification/project/flows']) {
  for (const entry of await readdir(join(root, collection), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(root, collection, entry.name)
    if (!(await exists(join(path, 'FLOW.ts')))) continue
    const source = await readFile(join(path, 'FLOW.ts'), 'utf8')
    if (!source.includes('@jigging/flow')) continue
    test(`${collection}/${entry.name} declares its SDK without ambient application dependencies`, async () => {
      expect(source).toContain('@jigging/flow')
      const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
        scripts?: Record<string, string>
      }
      expect(manifest.dependencies?.['@jigging/flow']).toBe(
        application.dependencies['@jigging/flow'],
      )
      expect(manifest.scripts?.postinstall).toBeUndefined()
      const lock = await readFile(join(path, 'bun.lock'), 'utf8')
      expect(lock).toContain(`"@jigging/flow": "${application.dependencies['@jigging/flow']}"`)
      expect(lock).toContain('"lockfileVersion": 1')
    })
  }
}
