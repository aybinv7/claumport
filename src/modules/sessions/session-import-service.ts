import {randomUUID} from 'node:crypto'
import {link, mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'

import type {DesktopCodeSession, ImportOperation, ImportPlan} from './session-types.js'

import {pathExists, readJson, writeJsonAtomic} from '../../shared/filesystem.js'
import {projectDirectoryName} from './project-directory.js'

type TranscriptRecord = Record<string, unknown>

type MetadataCloneOptions = {
  cliSessionId: string
  now: number
  sessionId: string
  targetDirectory: string
  title: string
}

type TranscriptTransformOptions = {
  delta: number
  sessionId: string
  targetDirectory: string
  uuidMap: Map<string, string>
}

export class SessionImportService {
  public constructor(
    private readonly codeSessionsDir: string,
    private readonly operationsDir: string,
    private readonly projectsDir: string,
  ) {}

  public createPlan(options: {
    destinationAccountId: string
    destinationOrganizationId: string
    sourceSession: DesktopCodeSession
    targetDirectory: string
  }): ImportPlan {
    if (!options.sourceSession.transcriptPath) throw new Error(`Source transcript is unavailable: ${options.sourceSession.sessionId}`)
    const targetDirectory = resolve(options.targetDirectory)
    const destinationProjectDir = join(this.projectsDir, projectDirectoryName(targetDirectory))
    const destinationCliSessionId = randomUUID()
    const destinationSessionId = `local_${randomUUID()}`

    return {
      destinationAccountId: options.destinationAccountId,
      destinationCliSessionId,
      destinationMetadataPath: join(
        this.codeSessionsDir,
        options.destinationAccountId,
        options.destinationOrganizationId,
        `local_${destinationCliSessionId}.json`,
      ),
      destinationOrganizationId: options.destinationOrganizationId,
      destinationProjectDir,
      destinationSessionId,
      destinationTranscriptPath: join(destinationProjectDir, `${destinationCliSessionId}.jsonl`),
      sourceSession: options.sourceSession,
      targetDirectory,
    }
  }

  public async execute(plan: ImportPlan, title?: string): Promise<ImportOperation> {
    const {transcriptPath} = plan.sourceSession
    if (!transcriptPath) throw new Error(`Source transcript is unavailable: ${plan.sourceSession.sessionId}`)
    if (await pathExists(plan.targetDirectory)) throw new Error(`Target directory already exists: ${plan.targetDirectory}`)
    if (await pathExists(plan.destinationProjectDir)) throw new Error(`Target Claude project already exists: ${plan.destinationProjectDir}`)

    const operationId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`
    const createdPaths: string[] = []

    try {
      const [sourceMetadata, sourceTranscript] = await Promise.all([
        readJson<Record<string, unknown>>(plan.sourceSession.filePath),
        readFile(transcriptPath, 'utf8'),
      ])
      const now = Date.now()
      const clonedTranscript = cloneTranscript(sourceTranscript, plan.destinationCliSessionId, plan.targetDirectory, now)
      const clonedMetadata = cloneMetadata(sourceMetadata, {
        cliSessionId: plan.destinationCliSessionId,
        now,
        sessionId: plan.destinationSessionId,
        targetDirectory: plan.targetDirectory,
        title: title ?? `Imported copy - ${plan.sourceSession.title}`,
      })

      await mkdir(plan.targetDirectory, {recursive: false})
      createdPaths.push(plan.targetDirectory)
      await mkdir(plan.destinationProjectDir, {recursive: true})
      createdPaths.push(plan.destinationProjectDir)
      await writeExclusive(plan.destinationTranscriptPath, clonedTranscript)
      createdPaths.push(plan.destinationTranscriptPath)
      await writeExclusive(plan.destinationMetadataPath, `${JSON.stringify(clonedMetadata, null, 2)}\n`)
      createdPaths.push(plan.destinationMetadataPath)

      const operation: ImportOperation = {
        completedAt: new Date().toISOString(),
        destinationAccountId: plan.destinationAccountId,
        destinationOrganizationId: plan.destinationOrganizationId,
        destinationProjectDir: plan.destinationProjectDir,
        destinationSessionId: plan.destinationSessionId,
        destinationTranscriptPath: plan.destinationTranscriptPath,
        operationId,
        sourceSessionId: plan.sourceSession.sessionId,
        targetDirectory: plan.targetDirectory,
      }
      await writeJsonAtomic(join(this.operationsDir, `${operationId}.json`), operation)
      return operation
    } catch (error) {
      await Promise.all(createdPaths.reverse().map(async (path) => rm(path, {force: true, recursive: true})))
      throw error
    }
  }
}

function cloneMetadata(source: Record<string, unknown>, options: MetadataCloneOptions): Record<string, unknown> {
  return {
    ...source,
    cliSessionId: options.cliSessionId,
    createdAt: options.now,
    cwd: options.targetDirectory,
    isArchived: false,
    lastActivityAt: options.now,
    lastFocusedAt: options.now,
    originCwd: options.targetDirectory,
    sessionId: options.sessionId,
    title: options.title,
    transcriptUnavailable: false,
  }
}

function cloneTranscript(source: string, sessionId: string, targetDirectory: string, now: number): string {
  const lines = source.split(/\r?\n/).filter((line) => line.length > 0)
  const records = lines.map((line, index) => parseRecord(line, index + 1))
  const uuidMap = new Map(
    records
      .map((record) => record.uuid)
      .filter((uuid): uuid is string => typeof uuid === 'string')
      .map((uuid) => [uuid, randomUUID()]),
  )
  const timestamps = records
    .map((record) => record.timestamp)
    .filter((timestamp): timestamp is string => typeof timestamp === 'string')
    .map((timestamp) => Date.parse(timestamp))
    .filter((timestamp) => Number.isFinite(timestamp))
  const delta = timestamps.length === 0 ? 0 : now - Math.max(...timestamps)

  const options = {delta, sessionId, targetDirectory, uuidMap}
  return `${records.map((record) => JSON.stringify(transformRecord(record, options))).join('\n')}\n`
}

function parseRecord(line: string, lineNumber: number): TranscriptRecord {
  try {
    const value = JSON.parse(line) as unknown
    if (!isRecord(value)) throw new Error('record is not an object')
    return value
  } catch (error) {
    throw new Error(`Cannot import invalid transcript line ${lineNumber}: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

function transformRecord(record: TranscriptRecord, options: TranscriptTransformOptions): TranscriptRecord {
  const cloned: TranscriptRecord = {...record, cwd: options.targetDirectory, sessionId: options.sessionId}
  for (const field of ['uuid', 'parentUuid', 'logicalParentUuid', 'leafUuid', 'sourceToolAssistantUUID']) {
    const value = cloned[field]
    if (typeof value === 'string') cloned[field] = options.uuidMap.get(value) ?? value
  }

  if (typeof cloned.timestamp === 'string') {
    const timestamp = Date.parse(cloned.timestamp)
    if (Number.isFinite(timestamp)) cloned.timestamp = new Date(timestamp + options.delta).toISOString()
  }

  return cloned
}

function isRecord(value: unknown): value is TranscriptRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function writeExclusive(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), {recursive: true})
  const temporaryPath = join(dirname(path), `.${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, content, {flag: 'wx', mode: 0o600})
    await link(temporaryPath, path)
  } finally {
    await rm(temporaryPath, {force: true})
  }
}
