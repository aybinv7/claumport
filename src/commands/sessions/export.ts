import {Command, Flags} from '@oclif/core'
import {basename, dirname, extname, join, resolve} from 'node:path'
import {stdout} from 'node:process'

import {fileLink} from '../../cli/file-link.js'
import {confirm} from '../../cli/prompts.js'
import {chooseAccount, chooseOrganization, chooseProjects, chooseSessions, resolveAccount, resolveSession} from '../../cli/session-selection.js'
import {muted, success, warning} from '../../cli/terminal-style.js'
import {resolvePaths} from '../../config/paths.js'
import {AccountLabelRepository} from '../../modules/accounts/account-label-repository.js'
import {AccountRepository} from '../../modules/accounts/account-repository.js'
import {ActiveAccountRepository} from '../../modules/accounts/active-account-repository.js'
import {SessionExportService} from '../../modules/archives/session-export-service.js'
import {groupSessionsByProject} from '../../modules/sessions/session-projects.js'
import {SessionRepository} from '../../modules/sessions/session-repository.js'
import {pathExists} from '../../shared/filesystem.js'
import {revealFile} from '../../shared/reveal-file.js'

type ExportedSession = Awaited<ReturnType<typeof chooseSessions>>[number]

type ExportRequest = {
  archivePath: string
  overwrite: boolean
  session: ExportedSession
}

type ExportRequestState = {
  archivesDir: string
  index: number
  output?: string
  overwrite?: boolean
  requests: ExportRequest[]
  reserved: Set<string>
  sessions: ExportedSession[]
}

export default class SessionsExport extends Command {
  static description = 'Export a local Claude Code session to a portable .claumport archive'
  static flags = {
    account: Flags.string({char: 'a', description: 'Source account UUID or unique prefix'}),
    all: Flags.boolean({description: 'Export every resumable session from selected account and workspace'}),
    'claude-dir': Flags.string({description: 'Claude Code configuration directory'}),
    'data-dir': Flags.string({description: 'Claude Desktop data directory'}),
    json: Flags.boolean({description: 'Print machine-readable JSON'}),
    organization: Flags.string({char: 'o', description: 'Source organization UUID'}),
    output: Flags.string({description: 'Output .claumport path'}),
    overwrite: Flags.boolean({description: 'Replace an existing archive with the same name'}),
    reveal: Flags.boolean({description: 'Open Explorer with exported archive selected'}),
    session: Flags.string({char: 's', description: 'Session UUID or unique prefix; repeat for multiple sessions', multiple: true}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(SessionsExport)
    const paths = resolvePaths({claudeConfigDir: flags['claude-dir'], desktopDataDir: flags['data-dir']})
    const accounts = await new AccountRepository(paths.codeSessionsDir).list()
    if (accounts.length === 0) this.error('No Claude Desktop accounts found')
    const [labels, activeAccountId] = await Promise.all([
      new AccountLabelRepository(paths.accountLabelsPath).getAll(),
      new ActiveAccountRepository(paths.desktopConfigPath).getId(),
    ])
    const account = flags.account
      ? resolveAccount(flags.account, accounts)
      : await chooseAccount('Choose source account', accounts, labels, activeAccountId)
    const organization = await chooseOrganization('Source organization', account, flags.organization)
    const sessions = (await new SessionRepository(paths.codeSessionsDir, paths.projectsDir).list(account.id, organization.id)).filter(
      (session) => session.resumable,
    )
    if (flags.all && flags.session?.length) this.error('Use either --all or --session, not both')
    const selected = flags.all
      ? sessions
      : flags.session?.length
        ? flags.session.map((reference) => resolveSession(reference, sessions))
        : await chooseSessionsFromProjects(await chooseProjects('Choose project(s) to export', groupSessionsByProject(sessions)))
    if (selected.length === 0) this.error('No resumable sessions selected')
    const requests = await resolveExportRequests([selected[0]], flags.output ?? join(paths.archivesDir, bundleName(selected)), flags.overwrite, paths.archivesDir)
    const request = requests[0]
    const manifest = await new SessionExportService().exportBundle({outputPath: request.archivePath, overwrite: request.overwrite, sessions: selected, sourceAccountId: account.id})

    if (flags.json) this.log(JSON.stringify({archivePath: request.archivePath, manifest, sessions: selected.length}, null, 2))
    else {
      this.log(success(`✓ Exported ${selected.length} session(s) in one bundle`))
      this.log(muted(fileLink(request.archivePath)))

      this.warn(warning('Archive contains full prompts, code, tool output, and possibly secrets. Share it as sensitive data.'))

      if (flags.reveal || (stdout.isTTY && (await confirm('Open exported archive in Explorer?')))) revealFile(request.archivePath)
    }
  }
}

async function chooseSessionsFromProjects(projects: ReturnType<typeof groupSessionsByProject>): Promise<ReturnType<typeof resolveSelected>> {
  return chooseProjectSessions(projects, 0, [])
}

async function chooseProjectSessions(
  projects: ReturnType<typeof groupSessionsByProject>,
  index: number,
  selected: ReturnType<typeof resolveSelected>,
): Promise<ReturnType<typeof resolveSelected>> {
  const project = projects[index]
  if (!project) return selected
  const sessions = await chooseSessions(`Choose session(s) from ${project.name}`, project.sessions)
  return chooseProjectSessions(projects, index + 1, resolveSelected([...selected, ...sessions]))
}

function resolveSelected(sessions: Awaited<ReturnType<typeof chooseSessions>>): Awaited<ReturnType<typeof chooseSessions>> {
  return [...new Map(sessions.map((session) => [session.sessionId, session])).values()]
}

async function resolveExportRequests(
  sessions: ExportedSession[],
  output: string | undefined,
  overwrite: boolean | undefined,
  archivesDir: string,
): Promise<ExportRequest[]> {
  return resolveExportRequestAt({archivesDir, index: 0, output, overwrite, requests: [], reserved: new Set(), sessions})
}

async function resolveExportRequestAt(state: ExportRequestState): Promise<ExportRequest[]> {
  const session = state.sessions[state.index]
  if (!session) return state.requests
  const proposedPath = archivePath(resolve(state.output ?? join(state.archivesDir, archiveName(session.title, session.sessionId))))
  const collision = state.reserved.has(proposedPath) || (await pathExists(proposedPath))
  const shouldOverwrite = collision && (state.overwrite || (stdout.isTTY && (await confirm(`Archive exists: ${basename(proposedPath)}. Replace it?`))))
  const destinationPath = shouldOverwrite ? proposedPath : collision ? await uniqueArchivePath(proposedPath, state.reserved) : proposedPath
  return resolveExportRequestAt({
    ...state,
    index: state.index + 1,
    requests: [...state.requests, {archivePath: destinationPath, overwrite: shouldOverwrite, session}],
    reserved: new Set([destinationPath, ...state.reserved]),
  })
}

async function uniqueArchivePath(path: string, reserved: ReadonlySet<string>): Promise<string> {
  const extension = extname(path)
  const stem = basename(path, extension)
  const folder = dirname(path)
  return uniqueArchivePathAt({extension, folder, index: 2, reserved, stem})
}

async function uniqueArchivePathAt(state: {
  extension: string
  folder: string
  index: number
  reserved: ReadonlySet<string>
  stem: string
}): Promise<string> {
  const candidate = join(state.folder, `${state.stem}-${state.index}${state.extension}`)
  if (!state.reserved.has(candidate) && !(await pathExists(candidate))) return candidate
  return uniqueArchivePathAt({...state, index: state.index + 1})
}

function archivePath(path: string): string {
  return path.endsWith('.claumport') ? path : `${path}.claumport`
}

function archiveName(title: string, sessionId: string): string {
  const safeTitle = title
    .normalize('NFKD')
    .replaceAll(/[^a-zA-Z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 60)
  return `${safeTitle || 'session'}-${sessionId.slice(-8)}.claumport`
}

function bundleName(sessions: ExportedSession[]): string {
  return sessions.length === 1 ? archiveName(sessions[0].title, sessions[0].sessionId) : `claumport-bundle-${new Date().toISOString().replaceAll(':', '-')}.claumport`
}
