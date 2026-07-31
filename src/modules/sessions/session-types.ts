export type DesktopCodeSession = {
  archived: boolean
  cliSessionId?: string
  createdAt?: number
  cwd?: string
  filePath: string
  lastActivityAt?: number
  organizationId: string
  resumable: boolean
  sessionId: string
  title: string
  transcriptPath?: string
  transcriptUnavailable: boolean
}

export type SessionProject = {
  id: string
  name: string
  path?: string
  sessions: DesktopCodeSession[]
}

export type ImportPlan = {
  destinationAccountId: string
  destinationCliSessionId: string
  destinationMetadataPath: string
  destinationOrganizationId: string
  destinationProjectDir: string
  destinationSessionId: string
  destinationTranscriptPath: string
  sourceSession: DesktopCodeSession
  targetDirectory: string
}

export type ImportOperation = {
  completedAt: string
  destinationAccountId: string
  destinationOrganizationId: string
  destinationProjectDir: string
  destinationSessionId: string
  destinationTranscriptPath: string
  operationId: string
  sourceSessionId: string
  targetDirectory: string
}

export type RawDesktopCodeSession = {
  cliSessionId?: unknown
  createdAt?: unknown
  cwd?: unknown
  isArchived?: unknown
  lastActivityAt?: unknown
  originCwd?: unknown
  sessionId?: unknown
  title?: unknown
  transcriptUnavailable?: unknown
}

export type ShareOperation = {
  completedAt: string
  createdFiles: string[]
  destinationAccountId: string
  destinationOrganizationId: string
  operationId: string
  skippedSessionIds: string[]
  sourceAccountId: string
  sourceOrganizationId: string
}

export type SharePlanItem = {
  destinationPath: string
  session: DesktopCodeSession
  status: 'conflict' | 'copy' | 'exists'
}

export type SharePlan = {
  destinationAccountId: string
  destinationOrganizationId: string
  items: SharePlanItem[]
  sourceAccountId: string
  sourceOrganizationId: string
}
