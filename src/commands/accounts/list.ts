import {Command, Flags} from '@oclif/core'

import {shortId} from '../../cli/format.js'
import {accent, muted, success} from '../../cli/terminal-style.js'
import {resolvePaths} from '../../config/paths.js'
import {AccountLabelRepository} from '../../modules/accounts/account-label-repository.js'
import {AccountRepository} from '../../modules/accounts/account-repository.js'
import {ActiveAccountRepository} from '../../modules/accounts/active-account-repository.js'

export default class AccountsList extends Command {
  static description = 'List Claude Desktop accounts with locally stored Code sessions'
  static flags = {
    'data-dir': Flags.string({description: 'Claude Desktop data directory'}),
    json: Flags.boolean({description: 'Print machine-readable JSON'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(AccountsList)
    const paths = resolvePaths({desktopDataDir: flags['data-dir']})
    const accounts = await new AccountRepository(paths.codeSessionsDir).list()
    const [labels, activeAccountId] = await Promise.all([
      new AccountLabelRepository(paths.accountLabelsPath).getAll(),
      new ActiveAccountRepository(paths.desktopConfigPath).getId(),
    ])

    if (flags.json) {
      this.log(JSON.stringify(accounts, null, 2))
      return
    }

    if (accounts.length === 0) {
      this.log(`No Claude Desktop Code accounts found in ${paths.codeSessionsDir}`)
      return
    }

    for (const account of accounts) {
      const label = labels.get(account.id) ?? 'Unnamed Claude account'
      const marker = account.id === activeAccountId ? '  current' : ''
      this.log(`${accent('●')} ${label}${marker ? ` ${success('CURRENT')}` : ''}`)
      this.log(muted(`  ${account.sessionCount} local session(s) · ID ${shortId(account.id)}`))
      for (const organization of account.organizations) {
        this.log(muted(`  workspace · ${organization.sessionCount} session(s) · ID ${shortId(organization.id)}`))
      }
    }
  }
}
