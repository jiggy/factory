import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

for (const recipe of ['recipes/typescript', 'qualification/project/recipe']) {
  test(`${recipe} declares test types without overriding native file policy`, async () => {
    const root = new URL(`../${recipe}/`, import.meta.url)
    const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
    const configuration = JSON.parse(await readFile(new URL('tsconfig.json', root), 'utf8'))
    expect(manifest.devDependencies.typescript).toBe('5.7.3')
    expect(manifest.devDependencies['@types/bun']).toBe('1.3.3')
    expect(Object.keys(configuration)).toEqual(['compilerOptions'])
    expect(configuration.compilerOptions.types).toEqual(['bun'])
    expect(configuration.compilerOptions.strict).toBe(true)
    expect(configuration.compilerOptions.skipLibCheck).toBe(true)
    expect(configuration.compilerOptions).not.toHaveProperty('rootDir')
    expect(configuration.compilerOptions).not.toHaveProperty('outDir')
  })
}
