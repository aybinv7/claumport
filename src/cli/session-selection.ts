import type {ClaudeAccount, ClaudeOrganization} from '../modules/accounts/account-types.js'
import type {DesktopCodeSession, SessionProject} from '../modules/sessions/session-types.js'

import {compactPath, formatTimestamp, shortId} from './format.js'
import {selectMany, selectOne} from './prompts.js'

export async function chooseAccount(
  question: string,
  accounts: ClaudeAccount[],
  labels: ReadonlyMap<string, string> = new Map(),
  activeAccountId?: string,
): Promise<ClaudeAccount> {
  return selectOne(
    question,
    accounts.map((account) => ({
      hint: `${account.id === activeAccountId ? 'Current account · ' : ''}${account.sessionCount} local session(s) · ID ${shortId(account.id)}`,
      label: labels.get(account.id) ?? 'Unnamed Claude account',
      value: account,
    })),
  )
}

export async function chooseOrganization(
  question: string,
  account: ClaudeAccount,
  explicit?: string,
): Promise<ClaudeOrganization> {
  if (explicit) return resolveOrganization(account, explicit)
  if (account.organizations.length === 1) return account.organizations[0]
  return selectOne(
    question,
    account.organizations.map((organization) => ({
      hint: `${organization.sessionCount} local session(s) · ID ${shortId(organization.id)}`,
      label: 'Claude workspace',
      value: organization,
    })),
  )
}

export async function chooseSession(question: string, sessions: DesktopCodeSession[]): Promise<DesktopCodeSession> {
  return selectOne(
    question,
    sessions.map((session) => ({
      hint: `${formatTimestamp(session.lastActivityAt ?? session.createdAt)} · ${compactPath(session.cwd)}`,
      label: session.title,
      value: session,
    })),
  )
}

export async function chooseProject(question: string, projects: SessionProject[]): Promise<SessionProject> {
  return selectOne(
    question,
    projects.map((project) => ({
      hint: `${project.sessions.length} session(s) · ${compactPath(project.path)}`,
      label: project.name,
      value: project,
    })),
  )
}

export async function chooseProjects(question: string, projects: SessionProject[]): Promise<SessionProject[]> {
  const all = '__all_projects__'
  const selection = await selectMany<SessionProject | typeof all>(question, [
    {hint: `${projects.length} project(s)`, label: 'All projects', value: all},
    ...projects.map((project) => ({
      hint: `${project.sessions.length} session(s) · ${compactPath(project.path)}`,
      label: project.name,
      value: project,
    })),
  ])
  return selection.includes(all) ? projects : selection.filter((item): item is SessionProject => item !== all)
}

export async function chooseSessions(question: string, sessions: DesktopCodeSession[]): Promise<DesktopCodeSession[]> {
  const all = '__all_sessions__'
  const selection = await selectMany<DesktopCodeSession | typeof all>(question, [
    {hint: `${sessions.length} session(s)`, label: 'All sessions in this project', value: all},
    ...sessions.map((session) => ({
      hint: `${formatTimestamp(session.lastActivityAt ?? session.createdAt)} · ${compactPath(session.cwd)}`,
      label: session.title,
      value: session,
    })),
  ])
  return selection.includes(all) ? sessions : selection.filter((item): item is DesktopCodeSession => item !== all)
}

export function resolveAccount(reference: string, accounts: ClaudeAccount[]): ClaudeAccount {
  const matches = accounts.filter((account) => account.id === reference || account.id.startsWith(reference))
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) throw new Error(`Account not found: ${reference}`)
  throw new Error(`Account reference is ambiguous: ${reference}`)
}

export function resolveOrganization(account: ClaudeAccount, reference: string): ClaudeOrganization {
  const matches = account.organizations.filter(
    (organization) => organization.id === reference || organization.id.startsWith(reference),
  )
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) throw new Error(`Organization not found for ${account.id}: ${reference}`)
  throw new Error(`Organization reference is ambiguous: ${reference}`)
}

export function resolveSession(reference: string, sessions: DesktopCodeSession[]): DesktopCodeSession {
  const matches = sessions.filter(
    (session) =>
      session.sessionId === reference ||
      session.cliSessionId === reference ||
      session.sessionId.startsWith(reference) ||
      session.cliSessionId?.startsWith(reference),
  )
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) throw new Error(`Resumable session not found: ${reference}`)
  throw new Error(`Session reference is ambiguous: ${reference}`)
}
