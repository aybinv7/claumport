import {randomUUID} from 'node:crypto'
import {mkdir, rm, rmdir} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import type {ArchiveImportOperation, ArchiveImportPlan, SessionArchiveDescriptor} from './archive-types.js'

import {filesNamed, pathExists, readJson, writeJsonAtomic} from '../../shared/filesystem.js'
import {projectDirectoryName} from '../sessions/project-directory.js'
import {importTranscript} from './transcript-importer.js'

export class SessionArchiveImportService {
  public constructor(
    private readonly codeSessionsDir: string,
    private readonly operationsDir: string,
    private readonly projectsDir: string,
  ) {}

  public async createPlan(options: {
    archive: SessionArchiveDescriptor
    destinationAccountId: string
    destinationOrganizationId: string
    targetDirectory: string
  }): Promise<ArchiveImportPlan> {
    const targetDirectory = resolve(options.targetDirectory)
    const destinationCliSessionId = randomUUID()
    const destinationSessionId = `local_${randomUUID()}`
    const destinationProjectDir = join(this.projectsDir, projectDirectoryName(targetDirectory))
    return {
      archive: options.archive,
      destinationAccountId: options.destinationAccountId,
      destinationCliSessionId,
      destinationMetadataPath: join(
        this.codeSessionsDir,
        options.destinationAccountId,
        options.destinationOrganizationId,
        `${destinationSessionId}.json`,
      ),
      destinationOrganizationId: options.destinationOrganizationId,
      destinationProjectDir,
      destinationSessionId,
      destinationTranscriptPath: join(destinationProjectDir, `${destinationCliSessionId}.jsonl`),
      targetDirectory,
    }
  }

  public async execute(
    plan: ArchiveImportPlan,
    options: {allowDuplicate?: boolean; title?: string} = {},
  ): Promise<ArchiveImportOperation> {
    if (!options.allowDuplicate && (await this.wasImported(plan))) {
      throw new Error('This archive was already imported into this account and folder. Use --allow-duplicate to clone it again.')
    }

    if (await pathExists(plan.destinationMetadataPath)) throw new Error('Generated destination metadata already exists')
    if (await pathExists(plan.destinationTranscriptPath)) throw new Error('Generated destination transcript already exists')

    const targetExisted = await pathExists(plan.targetDirectory)
    const projectExisted = await pathExists(plan.destinationProjectDir)
    const operationId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`
    const createdFiles: string[] = []
    try {
      if (!targetExisted) await mkdir(plan.targetDirectory, {recursive: true})
      await mkdir(plan.destinationProjectDir, {recursive: true})
      await importTranscript({
        archive: plan.archive,
        destinationPath: plan.destinationTranscriptPath,
        sessionId: plan.destinationCliSessionId,
        targetDirectory: plan.targetDirectory,
      })
      createdFiles.push(plan.destinationTranscriptPath)
      const now = Date.now()
      await writeJsonAtomic(plan.destinationMetadataPath, {
        ...plan.archive.manifest.desktopMetadata,
        cliSessionId: plan.destinationCliSessionId,
        completedTurns:
          typeof plan.archive.manifest.desktopMetadata.completedTurns === 'number'
            ? plan.archive.manifest.desktopMetadata.completedTurns
            : 0,
        createdAt: now,
        cwd: plan.targetDirectory,
        isArchived: false,
        lastActivityAt: now,
        lastFocusedAt: now,
        originCwd: plan.targetDirectory,
        sessionId: plan.destinationSessionId,
        title: options.title ?? `Imported - ${plan.archive.manifest.source.title}`,
        titleSource: 'user',
        transcriptUnavailable: false,
      })
      createdFiles.push(plan.destinationMetadataPath)
      const operation: ArchiveImportOperation = {
        archiveId: plan.archive.manifest.archiveId,
        completedAt: new Date().toISOString(),
        destinationAccountId: plan.destinationAccountId,
        destinationOrganizationId: plan.destinationOrganizationId,
        destinationSessionId: plan.destinationSessionId,
        operationId,
        targetDirectory: plan.targetDirectory,
        transcriptPath: plan.destinationTranscriptPath,
        type: 'archive-import',
      }
      await writeJsonAtomic(join(this.operationsDir, `${operationId}.json`), operation)
      return operation
    } catch (error) {
      await Promise.all(createdFiles.map(async (path) => rm(path, {force: true})))
      if (!projectExisted) await removeEmptyDirectory(plan.destinationProjectDir)
      if (!targetExisted) await removeEmptyDirectory(plan.targetDirectory)
      throw error
    }
  }

  private async wasImported(plan: ArchiveImportPlan): Promise<boolean> {
    const operationPaths = await filesNamed(this.operationsDir, (name) => name.endsWith('.json'))
    const operations = await Promise.all(
      operationPaths.map(async (path) => {
        try {
          return await readJson<Partial<ArchiveImportOperation>>(path)
        } catch {
          
        }
      }),
    )
    return operations.some(
      (operation) =>
        operation?.type === 'archive-import' &&
        operation.archiveId === plan.archive.manifest.archiveId &&
        operation.destinationAccountId === plan.destinationAccountId &&
        operation.targetDirectory === plan.targetDirectory,
    )
  }
}

async function removeEmptyDirectory(path: string): Promise<void> {
  try {
    await rmdir(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTEMPTY')) return
    throw error
  }
}
