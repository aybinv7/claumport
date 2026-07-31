import {createHash, randomUUID} from 'node:crypto'
import {createReadStream, createWriteStream} from 'node:fs'
import {link, mkdir, open, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'
import {Writable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

import type {SessionArchiveDescriptor, SessionArchiveManifest, SessionBundleManifest} from './archive-types.js'

const MAGIC = Buffer.from('CLAUMPORT/1\n', 'ascii')
const LENGTH_BYTES = 4
const MAX_MANIFEST_BYTES = 1024 * 1024

export async function inspectArchive(archivePath: string): Promise<SessionArchiveDescriptor> {
  const sessions = await inspectArchiveSessions(archivePath)
  if (sessions.length !== 1) throw new Error('Expected one session but archive contains multiple sessions')
  return sessions[0]
}

export async function inspectArchiveSessions(archivePath: string): Promise<SessionArchiveDescriptor[]> {
  const handle = await open(archivePath, 'r')
  try {
    const prefix = Buffer.alloc(MAGIC.length + LENGTH_BYTES)
    const prefixRead = await handle.read(prefix, 0, prefix.length, 0)
    if (prefixRead.bytesRead !== prefix.length || !prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error(`Not a claumport session archive: ${archivePath}`)
    }

    const manifestLength = prefix.readUInt32BE(MAGIC.length)
    if (manifestLength === 0 || manifestLength > MAX_MANIFEST_BYTES) {
      throw new Error(`Invalid archive manifest size: ${manifestLength}`)
    }

    const manifestBytes = Buffer.alloc(manifestLength)
    const manifestRead = await handle.read(manifestBytes, 0, manifestLength, prefix.length)
    if (manifestRead.bytesRead !== manifestLength) throw new Error('Archive manifest is truncated')
    const manifest = parseManifest(manifestBytes.toString('utf8'))
    const transcriptOffset = prefix.length + manifestLength
    const archiveStat = await handle.stat()
    const sessions = manifest.format === 'claumport.session' ? [manifest] : manifest.sessions
    const totalBytes = sessions.reduce((total, session) => total + session.transcript.bytes, 0)
    if (archiveStat.size !== transcriptOffset + totalBytes) {
      throw new Error('Archive transcript size does not match manifest')
    }

    let offset = transcriptOffset
    return sessions.map((session) => {
      const descriptor = {archivePath, manifest: session, transcriptOffset: offset}
      offset += session.transcript.bytes
      return descriptor
    })
  } finally {
    await handle.close()
  }
}

export async function writeBundle(
  outputPath: string,
  manifest: SessionBundleManifest,
  transcriptPaths: string[],
  options: {overwrite?: boolean} = {},
): Promise<void> {
  await writePayloadArchive(outputPath, manifest, transcriptPaths, options)
}

export async function writeArchive(
  outputPath: string,
  manifest: SessionArchiveManifest,
  transcriptPath: string,
  options: {overwrite?: boolean} = {},
): Promise<void> {
  await writePayloadArchive(outputPath, manifest, [transcriptPath], options)
}

async function writePayloadArchive(
  outputPath: string,
  manifest: SessionArchiveManifest | SessionBundleManifest,
  transcriptPaths: string[],
  options: {overwrite?: boolean},
): Promise<void> {
  const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8')
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('Archive manifest exceeds size limit')
  const prefix = Buffer.alloc(MAGIC.length + LENGTH_BYTES)
  MAGIC.copy(prefix)
  prefix.writeUInt32BE(manifestBytes.length, MAGIC.length)
  const finalPath = outputPath.endsWith('.claumport') ? outputPath : `${outputPath}.claumport`
  const temporaryPath = join(dirname(finalPath), `.${basename(finalPath)}.${randomUUID()}.tmp`)
  await mkdir(dirname(finalPath), {recursive: true})

  try {
    await writeFile(temporaryPath, Buffer.concat([prefix, manifestBytes]), {flag: 'wx', mode: 0o600})
    await appendTranscripts(temporaryPath, transcriptPaths)
    await (options.overwrite ? replaceFile(temporaryPath, finalPath) : link(temporaryPath, finalPath))
  } finally {
    await rm(temporaryPath, {force: true})
  }
}

async function appendTranscripts(path: string, transcriptPaths: string[], index = 0): Promise<void> {
  const transcriptPath = transcriptPaths[index]
  if (!transcriptPath) return
  await pipeline(createReadStream(transcriptPath), createWriteStream(path, {flags: 'a'}))
  return appendTranscripts(path, transcriptPaths, index + 1)
}

async function replaceFile(temporaryPath: string, finalPath: string): Promise<void> {
  try {
    await rename(temporaryPath, finalPath)
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error.code !== 'EEXIST' && error.code !== 'EPERM')) throw error
    await rm(finalPath, {force: true})
    await rename(temporaryPath, finalPath)
  }
}

export async function hashFile(path: string): Promise<{bytes: number; sha256: string}> {
  const hash = createHash('sha256')
  let bytes = 0
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      bytes += chunk.length
      callback()
    },
  })
  await pipeline(createReadStream(path), sink)
  return {bytes, sha256: hash.digest('hex')}
}

export async function readMetadata(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
}

function parseManifest(raw: string): SessionArchiveManifest | SessionBundleManifest {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Archive manifest is not valid JSON')
  }

  if (!isRecord(value) || value.version !== 1 || (value.format !== 'claumport.session' && value.format !== 'claumport.bundle')) {
    throw new Error('Unsupported claumport archive format or version')
  }

  if (typeof value.archiveId !== 'string') {
    throw new TypeError('Archive session metadata is invalid')
  }

  if (value.format === 'claumport.session') return validSessionManifest(value) ? value as SessionArchiveManifest : invalidManifest()
  if (!Array.isArray(value.sessions) || value.sessions.length === 0 || !value.sessions.every((session) => validSessionManifest(session))) return invalidManifest()
  return value as SessionBundleManifest
}

function validSessionManifest(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isRecord(value.transcript) && typeof value.transcript.bytes === 'number' && typeof value.transcript.sha256 === 'string' && isRecord(value.source) && typeof value.source.title === 'string'
}

function invalidManifest(): never {
  throw new Error('Archive transcript metadata is invalid')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
