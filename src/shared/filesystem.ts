import {constants} from 'node:fs'
import {access, mkdir, readdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function immediateDirectories(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, {withFileTypes: true})
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name))
  } catch (error) {
    if (isMissingPath(error)) return []
    throw error
  }
}

export async function filesNamed(path: string, predicate: (name: string) => boolean): Promise<string[]> {
  try {
    const entries = await readdir(path, {withFileTypes: true})
    return entries.filter((entry) => entry.isFile() && predicate(entry.name)).map((entry) => join(path, entry.name))
  } catch (error) {
    if (isMissingPath(error)) return []
    throw error
  }
}

export async function collectFileStems(path: string, extension: string): Promise<Set<string>> {
  return new Set((await collectFilesByStem(path, extension)).keys())
}

export async function collectFilesByStem(path: string, extension: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  async function visit(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, {withFileTypes: true})
    } catch (error) {
      if (isMissingPath(error)) return
      throw error
    }

    const directories: string[] = []
    for (const entry of entries) {
      const child = join(current, entry.name)
      if (entry.isDirectory()) directories.push(child)
      else if (entry.isFile() && entry.name.endsWith(extension)) files.set(entry.name.slice(0, -extension.length), child)
    }

    await Promise.all(directories.map(async (directory) => visit(directory)))
  }

  await visit(path)
  return files
}

export async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw) as T
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), {recursive: true})
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {flag: 'wx', mode: 0o600})
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, {force: true})
    throw error
  }
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
