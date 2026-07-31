import {basename, join} from 'node:path'

import type {DesktopCodeSession, RawDesktopCodeSession} from './session-types.js'

import {mapConcurrent} from '../../shared/concurrency.js'
import {collectFilesByStem, filesNamed, immediateDirectories, readJson} from '../../shared/filesystem.js'

export class SessionRepository {
  public constructor(
    private readonly codeSessionsDir: string,
    private readonly projectsDir: string,
  ) {}

  public async list(accountId: string, organizationId?: string): Promise<DesktopCodeSession[]> {
    const accountPath = join(this.codeSessionsDir, accountId)
    const organizationIds = organizationId ? [organizationId] : await this.organizationIds(accountPath)
    const transcriptPaths = await collectFilesByStem(this.projectsDir, '.jsonl')
    const entries = await Promise.all(
      organizationIds.map(async (id) => {
        const organizationPath = join(accountPath, id)
        const paths = await filesNamed(organizationPath, (name) => name.startsWith('local_') && name.endsWith('.json'))
        return mapConcurrent(paths, 16, async (path) => this.readSession(path, id, transcriptPaths))
      }),
    )

    return entries
      .flat()
      .sort((left, right) => (right.lastActivityAt ?? right.createdAt ?? 0) - (left.lastActivityAt ?? left.createdAt ?? 0))
  }

  private async organizationIds(accountPath: string): Promise<string[]> {
    return (await immediateDirectories(accountPath)).map((path) => basename(path))
  }

  private async readSession(
    path: string,
    organizationId: string,
    transcriptPaths: Map<string, string>,
  ): Promise<DesktopCodeSession> {
    const raw = await readJson<RawDesktopCodeSession>(path)
    const fallbackId = basename(path, '.json')
    const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : fallbackId
    const cliSessionId = typeof raw.cliSessionId === 'string' ? raw.cliSessionId : undefined
    const transcriptUnavailable = raw.transcriptUnavailable === true
    const transcriptPath = transcriptPaths.get(sessionId) ?? (cliSessionId ? transcriptPaths.get(cliSessionId) : undefined)

    return {
      archived: raw.isArchived === true,
      cliSessionId,
      createdAt: numberValue(raw.createdAt),
      cwd: stringValue(raw.cwd) ?? stringValue(raw.originCwd),
      filePath: path,
      lastActivityAt: numberValue(raw.lastActivityAt),
      organizationId,
      resumable: !transcriptUnavailable && transcriptPath !== undefined,
      sessionId,
      title: stringValue(raw.title) ?? 'Untitled session',
      transcriptPath,
      transcriptUnavailable,
    }
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}
