import {Command, Flags} from '@oclif/core'

import {compactPath, formatTimestamp, shortId} from '../../cli/format.js'
import {renderTable, truncate} from '../../cli/table.js'
import {accent, muted, success} from '../../cli/terminal-style.js'
import {resolvePaths} from '../../config/paths.js'
import {AccountLabelRepository} from '../../modules/accounts/account-label-repository.js'
import {AccountRepository} from '../../modules/accounts/account-repository.js'
import {ActiveAccountRepository} from '../../modules/accounts/active-account-repository.js'
import {groupSessionsByProject} from '../../modules/sessions/session-projects.js'
import {SessionRepository} from '../../modules/sessions/session-repository.js'

export default class SessionsList extends Command {
  static description = 'List available Claude Code sessions stored on this device across accounts'
  static flags = {
    account: Flags.string({char: 'a', description: 'Account UUID or unique UUID prefix'}),
    all: Flags.boolean({description: 'Include sessions without an available local transcript'}),
    'claude-dir': Flags.string({description: 'Claude Code configuration directory'}),
    'data-dir': Flags.string({description: 'Claude Desktop data directory'}),
    json: Flags.boolean({description: 'Print machine-readable JSON'}),
    organization: Flags.string({char: 'o', description: 'Organization UUID'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(SessionsList)
    const paths = resolvePaths({claudeConfigDir: flags['claude-dir'], desktopDataDir: flags['data-dir']})
    const accountRepository = new AccountRepository(paths.codeSessionsDir)
    const accounts = flags.account ? [await accountRepository.resolve(flags.account)] : await accountRepository.list()
    const activeAccountId = await new ActiveAccountRepository(paths.desktopConfigPath).getId()
    const labels = await new AccountLabelRepository(paths.accountLabelsPath).getAll()
    const repository = new SessionRepository(paths.codeSessionsDir, paths.projectsDir)
    const groups = await Promise.all(
      accounts.map(async (account) => {
        const sessions = await repository.list(account.id, flags.organization)
        return {account, sessions: flags.all ? sessions : sessions.filter((session) => session.resumable)}
      }),
    )

    if (flags.json) {
      this.log(
        JSON.stringify(
          groups.map((group) => ({accountId: group.account.id, active: group.account.id === activeAccountId, sessions: group.sessions})),
          null,
          2,
        ),
      )
      return
    }

    if (groups.every((group) => group.sessions.length === 0)) {
      this.log(flags.all ? 'No local Code sessions found.' : 'No resumable Code sessions found. Use --all for unavailable entries.')
      return
    }

    for (const group of groups) {
      const marker = group.account.id === activeAccountId ? ` ${success('CURRENT')}` : ''
      this.log(
        `\n${accent('●')} ${labels.get(group.account.id) ?? `Account ${shortId(group.account.id)}`}${marker} · ${group.sessions.length} session(s)`,
      )
      for (const project of groupSessionsByProject(group.sessions)) {
        this.log(`\n  ${accent('◆')} ${project.name}`)
        this.log(muted(`    ${compactPath(project.path)}`))
        for (const line of renderTable(
          ['Session', 'Last activity', 'State'],
          project.sessions.map((session) => [
            truncate(session.title, 48),
            formatTimestamp(session.lastActivityAt ?? session.createdAt),
            session.resumable ? 'READY' : 'UNAVAILABLE',
          ]),
        )) {
          this.log(`    ${line}`)
        }
      }
    }
  }
}
