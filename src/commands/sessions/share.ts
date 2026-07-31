import {Command, Flags} from '@oclif/core'

import type {ClaudeAccount, ClaudeOrganization} from '../../modules/accounts/account-types.js'
import type {DesktopCodeSession} from '../../modules/sessions/session-types.js'

import {compactPath, formatTimestamp, shortId} from '../../cli/format.js'
import {confirm, selectOne} from '../../cli/prompts.js'
import {resolvePaths} from '../../config/paths.js'
import {AccountRepository} from '../../modules/accounts/account-repository.js'
import {SessionRepository} from '../../modules/sessions/session-repository.js'
import {SessionShareService} from '../../modules/sessions/session-share-service.js'
import {isClaudeDesktopRunning} from '../../shared/desktop-process.js'

export default class SessionsShare extends Command {
  static description = 'Share local Claude Code Desktop sessions between accounts'
  static flags = {
    all: Flags.boolean({description: 'Share every eligible session'}),
    'claude-dir': Flags.string({description: 'Claude Code configuration directory'}),
    'data-dir': Flags.string({description: 'Claude Desktop data directory'}),
    'dry-run': Flags.boolean({description: 'Show plan without changing files'}),
    from: Flags.string({description: 'Source account UUID or unique prefix'}),
    'from-organization': Flags.string({description: 'Source organization UUID'}),
    'include-unavailable': Flags.boolean({description: 'Include entries whose local transcript is missing'}),
    json: Flags.boolean({description: 'Print machine-readable JSON'}),
    session: Flags.string({description: 'Session UUID to share; repeat for multiple sessions', multiple: true}),
    to: Flags.string({description: 'Destination account UUID or unique prefix'}),
    'to-organization': Flags.string({description: 'Destination organization UUID'}),
    yes: Flags.boolean({char: 'y', description: 'Apply without confirmation'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(SessionsShare)
    if (flags.all && flags.session?.length) this.error('Use either --all or --session, not both')

    const paths = resolvePaths({claudeConfigDir: flags['claude-dir'], desktopDataDir: flags['data-dir']})
    const accountRepository = new AccountRepository(paths.codeSessionsDir)
    const accounts = await accountRepository.list()
    if (accounts.length < 2) this.error('At least two Claude Desktop accounts are required')

    const source = flags.from
      ? await accountRepository.resolve(flags.from)
      : await chooseAccount('Source account', accounts)
    const destinationCandidates = accounts.filter((account) => account.id !== source.id)
    const destination = flags.to
      ? await accountRepository.resolve(flags.to)
      : await chooseAccount('Destination account', destinationCandidates)
    if (source.id === destination.id) this.error('Source and destination accounts must differ')

    const sourceOrganization = resolveOrganization(
      source,
      flags['from-organization'],
      await chooseOrganizationIfNeeded('Source organization', source, flags['from-organization']),
    )
    const destinationOrganization = resolveOrganization(
      destination,
      flags['to-organization'],
      await chooseOrganizationIfNeeded('Destination organization', destination, flags['to-organization']),
    )
    const repository = new SessionRepository(paths.codeSessionsDir, paths.projectsDir)
    const available = await repository.list(source.id, sourceOrganization.id)
    const eligible = flags['include-unavailable'] ? available : available.filter((session) => session.resumable)
    const sessions = await selectSessions(eligible, flags.all, flags.session)
    if (sessions.length === 0) this.error('No eligible sessions selected')

    const service = new SessionShareService(paths.codeSessionsDir, paths.operationsDir)
    const plan = await service.plan({
      destinationAccountId: destination.id,
      destinationOrganizationId: destinationOrganization.id,
      sessions,
      sourceAccountId: source.id,
      sourceOrganizationId: sourceOrganization.id,
    })

    if (flags['dry-run']) this.log(JSON.stringify(plan, null, 2))
    else if (!flags.json) printPlan(this, plan.items)
    if (flags['dry-run']) return
    if (plan.items.some((item) => item.status === 'conflict')) this.error('Plan contains destination conflicts; nothing changed')
    if (await isClaudeDesktopRunning()) {
      this.error('A Claude Desktop or Claude Code process is running. Close Claude completely before sharing sessions.')
    }

    if (!flags.yes && !(await confirm(`Copy ${plan.items.filter((item) => item.status === 'copy').length} session(s)?`))) {
      this.log('Cancelled. Nothing changed.')
      return
    }

    const operation = await service.execute(plan)
    if (flags.json) this.log(JSON.stringify(operation, null, 2))
    else {
      this.log(`Shared ${operation.createdFiles.length} session(s). Skipped ${operation.skippedSessionIds.length} existing.`)
      this.log(`Operation record: ${paths.operationsDir}`)
    }
  }
}

async function chooseAccount(question: string, accounts: ClaudeAccount[]): Promise<ClaudeAccount> {
  return selectOne(
    question,
    accounts.map((account) => ({label: `${shortId(account.id)} · ${account.sessionCount} session(s)`, value: account})),
  )
}

async function chooseOrganizationIfNeeded(
  question: string,
  account: ClaudeAccount,
  explicit?: string,
): Promise<string | undefined> {
  if (explicit || account.organizations.length === 1) return undefined
  return selectOne(
    question,
    account.organizations.map((organization) => ({
      label: `${shortId(organization.id)} · ${organization.sessionCount} session(s)`,
      value: organization.id,
    })),
  )
}

function resolveOrganization(account: ClaudeAccount, explicit?: string, selected?: string): ClaudeOrganization {
  const id = explicit ?? selected ?? account.organizations[0]?.id
  const organization = account.organizations.find((candidate) => candidate.id === id)
  if (!organization) throw new Error(`Organization not found for account ${account.id}: ${id ?? 'none'}`)
  return organization
}

async function selectSessions(
  sessions: DesktopCodeSession[],
  all?: boolean,
  references?: string[],
): Promise<DesktopCodeSession[]> {
  if (all) return sessions
  if (references?.length) {
    const selected = references.map((reference) => {
      const exact = sessions.find((session) => session.sessionId === reference || session.cliSessionId === reference)
      if (exact) return exact
      const matches = sessions.filter(
        (session) => session.sessionId.startsWith(reference) || session.cliSessionId?.startsWith(reference),
      )
      if (matches.length === 1) return matches[0]
      if (matches.length === 0) throw new Error(`Eligible session not found: ${reference}`)
      throw new Error(`Session reference is ambiguous: ${reference}`)
    })
    return [...new Map(selected.map((session) => [session.sessionId, session])).values()]
  }

  const selection = await selectOne(
    'Session to share',
    [
      {label: `All ${sessions.length} eligible sessions`, value: 'all'},
      ...sessions.map((session) => ({
        label: `${session.title} · ${formatTimestamp(session.lastActivityAt ?? session.createdAt)} · ${compactPath(session.cwd)}`,
        value: session.sessionId,
      })),
    ],
  )
  return selection === 'all' ? sessions : sessions.filter((session) => session.sessionId === selection)
}

function printPlan(command: Command, items: {session: DesktopCodeSession; status: string}[]): void {
  for (const item of items) command.log(`${item.status.padEnd(8)} ${shortId(item.session.sessionId)}  ${item.session.title}`)
}
