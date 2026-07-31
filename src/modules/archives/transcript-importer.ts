import {createHash, randomUUID} from 'node:crypto'
import {createReadStream, createWriteStream} from 'node:fs'
import {link, mkdir, rm} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'
import {Transform, type TransformCallback} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {StringDecoder} from 'node:string_decoder'

import type {SessionArchiveDescriptor} from './archive-types.js'

type TranscriptRecord = Record<string, unknown>

export async function importTranscript(options: {
  archive: SessionArchiveDescriptor
  destinationPath: string
  sessionId: string
  targetDirectory: string
}): Promise<number> {
  const temporaryPath = join(dirname(options.destinationPath), `.${basename(options.destinationPath)}.${randomUUID()}.tmp`)
  await mkdir(dirname(options.destinationPath), {recursive: true})
  const transformer = new TranscriptTransform(options.sessionId, options.targetDirectory)
  const end = options.archive.transcriptOffset + options.archive.manifest.transcript.bytes - 1

  try {
    await pipeline(
      createReadStream(options.archive.archivePath, {end, start: options.archive.transcriptOffset}),
      transformer,
      createWriteStream(temporaryPath, {flags: 'wx', mode: 0o600}),
    )
    if (transformer.sourceDigest() !== options.archive.manifest.transcript.sha256) {
      throw new Error('Archive transcript checksum mismatch')
    }

    await link(temporaryPath, options.destinationPath)
    return transformer.recordCount
  } finally {
    await rm(temporaryPath, {force: true})
  }
}

class TranscriptTransform extends Transform {
  public recordCount = 0
  private readonly decoder = new StringDecoder('utf8')
  private readonly hash = createHash('sha256')
  private pending = ''
  private sealedDigest?: string
  private readonly uuidMap = new Map<string, string>()

  public constructor(
    private readonly sessionId: string,
    private readonly targetDirectory: string,
  ) {
    super()
  }

  public override _flush(callback: TransformCallback): void {
    try {
      this.pending += this.decoder.end()
      if (this.pending.length > 0) this.pushRecord(this.pending)
      callback()
    } catch (error) {
      callback(error instanceof Error ? error : new Error('Transcript transform failed'))
    }
  }

  public override _transform(chunk: Buffer, _encoding: string, callback: TransformCallback): void {
    try {
      this.hash.update(chunk)
      this.pending += this.decoder.write(chunk)
      const lines = this.pending.split('\n')
      this.pending = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim().length > 0) this.pushRecord(line)
      }

      callback()
    } catch (error) {
      callback(error instanceof Error ? error : new Error('Transcript transform failed'))
    }
  }

  public sourceDigest(): string {
    if (!this.sealedDigest) this.sealedDigest = this.hash.digest('hex')
    return this.sealedDigest
  }

  private freshUuid(source: string): string {
    const existing = this.uuidMap.get(source)
    if (existing) return existing
    const generated = randomUUID()
    this.uuidMap.set(source, generated)
    return generated
  }

  private pushRecord(line: string): void {
    let record: unknown
    try {
      record = JSON.parse(line)
    } catch {
      throw new Error(`Archive transcript contains invalid JSON at record ${this.recordCount + 1}`)
    }

    if (!isRecord(record)) throw new Error(`Archive transcript record ${this.recordCount + 1} is not an object`)
    const cloned: TranscriptRecord = {...record, sessionId: this.sessionId}
    if ('cwd' in record) cloned.cwd = this.targetDirectory
    for (const field of ['uuid', 'parentUuid', 'logicalParentUuid', 'leafUuid', 'sourceToolAssistantUUID']) {
      const value = cloned[field]
      if (typeof value === 'string') cloned[field] = this.freshUuid(value)
    }

    this.recordCount += 1
    this.push(`${JSON.stringify(cloned)}\n`)
  }
}

function isRecord(value: unknown): value is TranscriptRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
