import {randomUUID} from 'node:crypto'
import {constants} from 'node:fs'
import {copyFile, link, mkdir, rm} from 'node:fs/promises'
import {basename, dirname, extname, join, parse, resolve} from 'node:path'

import type {SessionArchiveDescriptor} from './archive-types.js'

import {inspectArchiveSessions} from './archive-format.js'

export class ArchiveLibraryService {
  public constructor(private readonly archivesDir: string) {}

  public async add(sourcePath: string): Promise<SessionArchiveDescriptor[]> {
    const normalizedSource = resolve(sourcePath)
    if (extname(normalizedSource).toLowerCase() !== '.claumport') {
      throw new Error(`Archive must use the .claumport extension: ${normalizedSource}`)
    }

    await inspectArchiveSessions(normalizedSource)
    await mkdir(this.archivesDir, {recursive: true})
    if (resolve(dirname(normalizedSource)).toLowerCase() === resolve(this.archivesDir).toLowerCase()) {
      return inspectArchiveSessions(normalizedSource)
    }

    const temporaryPath = join(this.archivesDir, `.${basename(normalizedSource)}.${randomUUID()}.tmp`)
    let destinationPath: string
    try {
      await copyFile(normalizedSource, temporaryPath, constants.COPYFILE_EXCL)
      destinationPath = await this.publish(temporaryPath, basename(normalizedSource))
    } finally {
      await rm(temporaryPath, {force: true})
    }

    return inspectArchiveSessions(destinationPath)
  }

  private async publish(temporaryPath: string, filename: string, sequence = 1): Promise<string> {
    const parts = parse(filename)
    const candidate = sequence === 1 ? join(this.archivesDir, filename) : join(this.archivesDir, `${parts.name}-${sequence}${parts.ext}`)
    try {
      await link(temporaryPath, candidate)
      return candidate
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
      return this.publish(temporaryPath, filename, sequence + 1)
    }
  }
}
