import {Args, Command, Flags} from '@oclif/core'

import type {SessionArchiveDescriptor} from '../../modules/archives/archive-types.js'

import {askArchivePath, chooseArchiveImportSource, chooseArchiveProjects, chooseArchives, chooseArchiveTarget} from '../../cli/archive-selection.js'
import {shortId} from '../../cli/format.js'
import {confirm, showNote} from '../../cli/prompts.js'
import {chooseAccount, chooseOrganization, resolveAccount} from '../../cli/session-selection.js'
import {resolvePaths} from '../../config/paths.js'
import {AccountLabelRepository} from '../../modules/accounts/account-label-repository.js'
import {AccountRepository} from '../../modules/accounts/account-repository.js'
import {ActiveAccountRepository} from '../../modules/accounts/active-account-repository.js'
import {inspectArchiveSessions} from '../../modules/archives/archive-format.js'
import {ArchiveLibraryService} from '../../modules/archives/archive-library-service.js'
import {type ArchiveProject, groupArchivesByProject} from '../../modules/archives/archive-projects.js'
import {ArchiveRepository} from '../../modules/archives/archive-repository.js'
import {SessionArchiveImportService} from '../../modules/archives/session-archive-import-service.js'

export default class SessionsImport extends Command {
  static args = {
    archive: Args.string({description: 'Portable .claumport archive; omit for guided source selection'}),
  }
  static description = 'Import a portable session archive into the active Claude Desktop account'
  static flags = {
    account: Flags.string({char: 'a', description: 'Destination account UUID or unique prefix'}),
    'allow-duplicate': Flags.boolean({description: 'Import an archive already imported into this account and folder'}),
    'claude-dir': Flags.string({description: 'Claude Code configuration directory'}),
    'data-dir': Flags.string({description: 'Claude Desktop data directory'}),
    'dry-run': Flags.boolean({description: 'Validate archive and show plan without changing files'}),
    json: Flags.boolean({description: 'Print machine-readable JSON'}),
    organization: Flags.string({char: 'o', description: 'Destination organization UUID'}),
    source: Flags.string({description: 'Interactive archive source', options: ['file', 'library']}),
    target: Flags.string({char: 't', description: 'Local project folder for imported session'}),
    title: Flags.string({description: 'Imported session title'}),
    yes: Flags.boolean({char: 'y', description: 'Import without confirmation'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionsImport)
    const paths = resolvePaths({claudeConfigDir: flags['claude-dir'], desktopDataDir: flags['data-dir']})
    const accounts = await new AccountRepository(paths.codeSessionsDir).list()
    if (accounts.length === 0) this.error('No Claude Desktop accounts found')
    const activeAccountId = await new ActiveAccountRepository(paths.desktopConfigPath).getId()
    const labels = await new AccountLabelRepository(paths.accountLabelsPath).getAll()
    const activeAccount = activeAccountId ? accounts.find((account) => account.id === activeAccountId) : undefined
    const account = flags.account
      ? resolveAccount(flags.account, accounts)
      : activeAccount ?? (await chooseAccount('Choose destination account', accounts, labels, activeAccountId))
    const organization = await chooseOrganization('Destination organization', account, flags.organization)
    const service = new SessionArchiveImportService(paths.codeSessionsDir, paths.operationsDir, paths.projectsDir)
    const archiveProjects = args.archive
      ? groupArchivesByProject(await inspectArchiveSessions(args.archive))
      : await this.chooseArchiveSource(paths.archivesDir, activeAccountId, flags.source)
    if (flags.target && archiveProjects.length > 1) this.error('--target can only be used when importing one project')
    if (flags.title && archiveProjects.reduce((count, project) => count + project.archives.length, 0) > 1) {
      this.error('--title can only be used when importing one session')
    }

    const requests = await chooseImportTargets(archiveProjects, flags.target)
    const plans = await createPlans(service, requests, account.id, organization.id)

    if (flags['dry-run']) {
      this.log(JSON.stringify(plans, null, 2))
      return
    }

    if (!flags.yes) {
      showNote(
        summarizeTargets(plans).map(({count, targetDirectory}) => `${count} session(s) → ${targetDirectory}`).join('\n'),
        `Import ${plans.length} session(s) into ${labels.get(account.id) ?? `account ${shortId(account.id)}`}`,
      )
      this.warn('Import creates a fresh session identity. Existing project files are not modified.')
      const accepted = await confirm('Continue with import?')
      if (!accepted) {
        this.log('Cancelled. Nothing changed.')
        return
      }
    }

    const operations = await executePlans(service, plans, {allowDuplicate: flags['allow-duplicate'], title: flags.title})
    if (flags.json) this.log(JSON.stringify(operations, null, 2))
    else {
      this.log(`Imported ${operations.length} session(s) into ${labels.get(account.id) ?? `account ${shortId(account.id)}`}.`)
      for (const summary of summarizeTargets(operations)) this.log(`  ${summary.count} session(s) → ${summary.targetDirectory}`)
    }
  }

  private async chooseArchiveSource(archivesDir: string, currentAccountId?: string, requestedSource?: string): Promise<ArchiveProject[]> {
    const archives = await new ArchiveRepository(archivesDir).list()
    if (requestedSource === 'library' && archives.length === 0) {
      this.error(`Archive library is empty: ${archivesDir}. Import a file instead.`)
    }

    const source = requestedSource === 'file' || requestedSource === 'library'
      ? requestedSource
      : await chooseArchiveImportSource(archivesDir, archives.length)
    if (source === 'file') {
      const added = await new ArchiveLibraryService(archivesDir).add(await askArchivePath())
      this.log(`Added archive to ${archivesDir}`)
      return groupArchivesByProject(added)
    }

    const projects = await chooseArchiveProjects('Select projects to import', groupArchivesByProject(archives), currentAccountId)
    return chooseArchivesFromProjects(projects, currentAccountId)
  }
}

function summarizeTargets(items: {targetDirectory: string}[]): {count: number; targetDirectory: string}[] {
  const targets = new Map<string, number>()
  for (const item of items) targets.set(item.targetDirectory, (targets.get(item.targetDirectory) ?? 0) + 1)
  return [...targets].map(([targetDirectory, count]) => ({count, targetDirectory}))
}

async function chooseArchivesFromProjects(
  projects: ArchiveProject[],
  currentAccountId?: string,
): Promise<ArchiveProject[]> {
  return chooseProjectArchives(projects, currentAccountId, 0, [])
}

async function chooseProjectArchives(
  projects: ArchiveProject[],
  currentAccountId: string | undefined,
  index: number,
  selected: ArchiveProject[],
): Promise<ArchiveProject[]> {
  const project = projects[index]
  if (!project) return selected
  const archives = await chooseArchives(`Select sessions to import · ${project.name}`, project.archives, currentAccountId)
  return chooseProjectArchives(projects, currentAccountId, index + 1, [...selected, {...project, archives}])
}

async function chooseImportTargets(
  projects: ArchiveProject[],
  target?: string,
): Promise<{archive: SessionArchiveDescriptor; targetDirectory: string}[]> {
  return chooseProjectTargets(projects, target, 0, [])
}

async function chooseProjectTargets(
  projects: ArchiveProject[],
  target: string | undefined,
  index: number,
  selected: {archive: SessionArchiveDescriptor; targetDirectory: string}[],
): Promise<{archive: SessionArchiveDescriptor; targetDirectory: string}[]> {
  const project = projects[index]
  if (!project) return selected
  const targetDirectory = target ?? (await chooseArchiveTarget(project))
  const additions = project.archives.map((archive) => ({archive, targetDirectory}))
  return chooseProjectTargets(projects, target, index + 1, [...selected, ...additions])
}

async function createPlans(
  service: SessionArchiveImportService,
  requests: {archive: SessionArchiveDescriptor; targetDirectory: string}[],
  destinationAccountId: string,
  destinationOrganizationId: string,
): Promise<Awaited<ReturnType<SessionArchiveImportService['createPlan']>>[]> {
  return createPlanAt(service, {
    destinationAccountId,
    destinationOrganizationId,
    plans: [],
    requests,
  })
}

async function createPlanAt(
  service: SessionArchiveImportService,
  state: {
    destinationAccountId: string
    destinationOrganizationId: string
    plans: Awaited<ReturnType<SessionArchiveImportService['createPlan']>>[]
    requests: {archive: SessionArchiveDescriptor; targetDirectory: string}[]
  },
  index = 0,
): Promise<Awaited<ReturnType<SessionArchiveImportService['createPlan']>>[]> {
  const request = state.requests[index]
  if (!request) return state.plans
  const plan = await service.createPlan({...request, destinationAccountId: state.destinationAccountId, destinationOrganizationId: state.destinationOrganizationId})
  return createPlanAt(service, {...state, plans: [...state.plans, plan]}, index + 1)
}

async function executePlans(
  service: SessionArchiveImportService,
  plans: Awaited<ReturnType<SessionArchiveImportService['createPlan']>>[],
  options: {allowDuplicate?: boolean; title?: string},
): Promise<Awaited<ReturnType<SessionArchiveImportService['execute']>>[]> {
  return executePlanAt(service, {operations: [], options, plans})
}

async function executePlanAt(
  service: SessionArchiveImportService,
  state: {
    operations: Awaited<ReturnType<SessionArchiveImportService['execute']>>[]
    options: {allowDuplicate?: boolean; title?: string}
    plans: Awaited<ReturnType<SessionArchiveImportService['createPlan']>>[]
  },
  index = 0,
): Promise<Awaited<ReturnType<SessionArchiveImportService['execute']>>[]> {
  const plan = state.plans[index]
  if (!plan) return state.operations
  const operation = await service.execute(plan, state.options)
  return executePlanAt(service, {...state, operations: [...state.operations, operation]}, index + 1)
}
