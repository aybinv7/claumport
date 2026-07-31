import type {DesktopCodeSession} from '../sessions/session-types.js'

export type ArchiveDesktopMetadata = {
  chromePermissionMode?: unknown
  completedTurns?: unknown
  effort?: unknown
  model?: unknown
  permissionMode?: unknown
  titleSource?: unknown
}

export type SessionArchiveManifest = {
  archiveId: string
  desktopMetadata: ArchiveDesktopMetadata
  exportedAt: string
  format: 'claumport.session'
  source: {
    accountId?: string
    createdAt?: number
    deviceName: string
    lastActivityAt?: number
    originalCwd?: string
    platform: string
    sessionId: string
    title: string
  }
  transcript: {
    bytes: number
    sha256: string
  }
  version: 1
}

export type SessionArchiveDescriptor = {
  archivePath: string
  manifest: SessionArchiveManifest
  transcriptOffset: number
}

export type SessionBundleManifest = {
  archiveId: string
  exportedAt: string
  format: 'claumport.bundle'
  sessions: SessionArchiveManifest[]
  version: 1
}

export type ArchiveImportPlan = {
  archive: SessionArchiveDescriptor
  destinationAccountId: string
  destinationCliSessionId: string
  destinationMetadataPath: string
  destinationOrganizationId: string
  destinationProjectDir: string
  destinationSessionId: string
  destinationTranscriptPath: string
  targetDirectory: string
}

export type ArchiveImportOperation = {
  archiveId: string
  completedAt: string
  destinationAccountId: string
  destinationOrganizationId: string
  destinationSessionId: string
  operationId: string
  targetDirectory: string
  transcriptPath: string
  type: 'archive-import'
}

export type SessionExportRequest = {
  outputPath: string
  overwrite?: boolean
  session: DesktopCodeSession
  sourceAccountId?: string
}

export type SessionBundleExportRequest = {
  outputPath: string
  overwrite?: boolean
  sessions: DesktopCodeSession[]
  sourceAccountId?: string
}
