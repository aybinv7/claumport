import {randomUUID} from 'node:crypto'
import {hostname, platform} from 'node:os'

import type {ArchiveDesktopMetadata, SessionArchiveManifest, SessionBundleExportRequest, SessionBundleManifest, SessionExportRequest} from './archive-types.js'

import {hashFile, readMetadata, writeArchive, writeBundle} from './archive-format.js'

const METADATA_KEYS = ['chromePermissionMode', 'completedTurns', 'effort', 'model', 'permissionMode', 'titleSource'] as const

export class SessionExportService {
  public async export(request: SessionExportRequest): Promise<SessionArchiveManifest> {
    const created = await this.createSessionManifest(request.session, request.sourceAccountId)
    const manifest: SessionArchiveManifest = {...created.manifest, archiveId: randomUUID(), exportedAt: new Date().toISOString(), format: 'claumport.session', version: 1}
    await writeArchive(request.outputPath, manifest, created.transcriptPath, {overwrite: request.overwrite})
    return manifest
  }

  public async exportBundle(request: SessionBundleExportRequest): Promise<SessionBundleManifest> {
    if (request.sessions.length === 0) throw new Error('Cannot export an empty bundle')
    const sessions = await Promise.all(request.sessions.map(async (session) => this.createSessionManifest(session, request.sourceAccountId)))
    const exportedAt = new Date().toISOString()
    const manifest: SessionBundleManifest = {archiveId: randomUUID(), exportedAt, format: 'claumport.bundle', sessions: sessions.map((item) => ({...item.manifest, archiveId: randomUUID(), exportedAt, format: 'claumport.session', version: 1})), version: 1}
    await writeBundle(request.outputPath, manifest, sessions.map((item) => item.transcriptPath), {overwrite: request.overwrite})
    return manifest
  }

  private async createSessionManifest(session: SessionExportRequest['session'], sourceAccountId?: string): Promise<{manifest: Omit<SessionArchiveManifest, 'archiveId' | 'exportedAt' | 'format' | 'version'>; transcriptPath: string}> {
    const {transcriptPath} = session
    if (!transcriptPath) throw new Error(`Session transcript is unavailable: ${session.sessionId}`)
    const [transcript, sourceMetadata] = await Promise.all([
      hashFile(transcriptPath),
      readMetadata(session.filePath),
    ])
    return {manifest: {
      desktopMetadata: selectMetadata(sourceMetadata),
      source: {
        accountId: sourceAccountId,
        createdAt: session.createdAt,
        deviceName: hostname(),
        lastActivityAt: session.lastActivityAt,
        originalCwd: session.cwd,
        platform: platform(),
        sessionId: session.sessionId,
        title: session.title,
      },
      transcript,
    }, transcriptPath}
  }
}

function selectMetadata(source: Record<string, unknown>): ArchiveDesktopMetadata {
  const selected: ArchiveDesktopMetadata = {}
  for (const key of METADATA_KEYS) {
    if (key in source) selected[key] = source[key]
  }

  return selected
}
