import { isAbsolute, join, resolve } from 'node:path'
import { lstat } from 'node:fs/promises'
import { digest, textFile } from './files.ts'
import { FactoryError } from './errors.ts'

export interface Configuration {
  project: string
  source: string
  selection: string[]
  target: string
  durationMs: number
}
export async function configuration(
  root: string,
): Promise<{ value: Configuration; digest: string }> {
  const text = await textFile(join(root, 'factory.json'), 65_536)
  const data = JSON.parse(text) as Partial<Configuration>
  if (
    typeof data.project !== 'string' ||
    typeof data.source !== 'string' ||
    !Array.isArray(data.selection) ||
    data.selection.length === 0 ||
    data.selection.some(
      (path) =>
        typeof path !== 'string' ||
        !path ||
        isAbsolute(path) ||
        path.split(/[\\/]/).some((part) => part === '..' || part === '.' || !part),
    ) ||
    typeof data.target !== 'string' ||
    !/^(flow:|binding:)[a-zA-Z0-9_./-]+$/.test(data.target) ||
    !Number.isInteger(data.durationMs) ||
    data.durationMs! < 1_000 ||
    data.durationMs! > 600_000
  ) {
    throw new FactoryError(
      'INVALID_CONFIGURATION',
      'Configure project, source, nonempty exact file selection, an explicit target and durationMs (1000–600000) in factory.json.',
    )
  }
  const value = {
    ...data,
    project: resolve(root, data.project),
    source: resolve(root, data.source),
  } as Configuration
  for (const path of [value.project, value.source]) {
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new FactoryError(
        'INVALID_CONFIGURATION',
        'Project and source must be existing real directories.',
      )
    }
  }
  return { value, digest: digest(text) }
}
