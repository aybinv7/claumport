export type ClaudeOrganization = {
  id: string
  sessionCount: number
}

export type ClaudeAccount = {
  id: string
  organizations: ClaudeOrganization[]
  sessionCount: number
}
