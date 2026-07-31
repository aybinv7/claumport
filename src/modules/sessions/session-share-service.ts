import {randomUUID} from 'node:crypto'
import {link, mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'

import type {DesktopCodeSession, ShareOperation, SharePlan} from './session-types.js'

import {pathExists, writeJsonAtomic} from '../../shared/filesystem.js'

export class SessionShareService {
  public constructor(
    private readonly codeSessionsDir: string,
    private readonly operationsDir: string,
  ) {}

  public async execute(plan: SharePlan): Promise<ShareOperation> {
    const conflicts = plan.items.filter((item) => item.status === 'conflict')
    if (conflicts.length > 0) {
      throw new Error(`Refusing to overwrite ${conflicts.length} conflicting destination session file(s)`)
    }

    const operationId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`
    const createdFiles: string[] = []

    async function copyAt(index: number): Promise<void> {
      if (index >= plan.items.length) return
      const item = plan.items[index]
      if (item.status === 'copy') {
        await copyFileExclusive(item.session.filePath, item.destinationPath)
        createdFiles.push(item.destinationPath)
      }

      return copyAt(index + 1)
    }

    try {
      await copyAt(0)
      const operation: ShareOperation = {
        completedAt: new Date().toISOString(),
        createdFiles,
        destinationAccountId: plan.destinationAccountId,
        destinationOrganizationId: plan.destinationOrganizationId,
        operationId,
        skippedSessionIds: plan.items.filter((item) => item.status === 'exists').map((item) => item.session.sessionId),
        sourceAccountId: plan.sourceAccountId,
        sourceOrganizationId: plan.sourceOrganizationId,
      }
      await writeJsonAtomic(join(this.operationsDir, `${operationId}.json`), operation)
      return operation
    } catch (error) {
      await Promise.all(createdFiles.map(async (path) => rm(path, {force: true})))
      throw error
    }
  }

  public async plan(options: {
    destinationAccountId: string
    destinationOrganizationId: string
    sessions: DesktopCodeSession[]
    sourceAccountId: string
    sourceOrganizationId: string
  }): Promise<SharePlan> {
    const destinationDirectory = join(
      this.codeSessionsDir,
      options.destinationAccountId,
      options.destinationOrganizationId,
    )
    const items = await Promise.all(
      options.sessions.map(async (session) => {
        const destinationPath = join(destinationDirectory, basename(session.filePath))
        if (!(await pathExists(destinationPath))) return {destinationPath, session, status: 'copy' as const}
        const [source, destination] = await Promise.all([readFile(session.filePath), readFile(destinationPath)])
        return {destinationPath, session, status: source.equals(destination) ? ('exists' as const) : ('conflict' as const)}
      }),
    )

    return {
      destinationAccountId: options.destinationAccountId,
      destinationOrganizationId: options.destinationOrganizationId,
      items,
      sourceAccountId: options.sourceAccountId,
      sourceOrganizationId: options.sourceOrganizationId,
    }
  }
}

async function copyFileExclusive(sourcePath: string, destinationPath: string): Promise<void> {
  await mkdir(dirname(destinationPath), {recursive: true})
  const temporaryPath = join(dirname(destinationPath), `.${basename(destinationPath)}.${process.pid}.${randomUUID()}.tmp`)
  const content = await readFile(sourcePath)

  try {
    await writeFile(temporaryPath, content, {flag: 'wx', mode: 0o600})
    await link(temporaryPath, destinationPath)
  } finally {
    await rm(temporaryPath, {force: true})
  }
}
