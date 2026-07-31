import {Args, Command, Flags} from '@oclif/core'

import {askText} from '../../cli/prompts.js'
import {chooseAccount, resolveAccount} from '../../cli/session-selection.js'
import {resolvePaths} from '../../config/paths.js'
import {AccountLabelRepository} from '../../modules/accounts/account-label-repository.js'
import {AccountRepository} from '../../modules/accounts/account-repository.js'
import {ActiveAccountRepository} from '../../modules/accounts/active-account-repository.js'

export default class AccountsLabel extends Command {
  static args = {
    account: Args.string({description: 'Account UUID or unique UUID prefix'}),
  }
  static description = 'Give a local Claude Desktop account a friendly name'
  static flags = {
    'data-dir': Flags.string({description: 'Claude Desktop data directory'}),
    name: Flags.string({char: 'n', description: 'Friendly account name'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(AccountsLabel)
    const paths = resolvePaths({desktopDataDir: flags['data-dir']})
    const accounts = await new AccountRepository(paths.codeSessionsDir).list()
    if (accounts.length === 0) this.error('No Claude Desktop accounts found')
    const labels = new AccountLabelRepository(paths.accountLabelsPath)
    const savedLabels = await labels.getAll()
    const activeAccountId = await new ActiveAccountRepository(paths.desktopConfigPath).getId()
    const account = args.account
      ? resolveAccount(args.account, accounts)
      : await chooseAccount('Choose account to name', accounts, savedLabels, activeAccountId)
    const name = flags.name ?? (await askText('Account name', savedLabels.get(account.id)))
    await labels.set(account.id, name)
    this.log(`Saved account name: ${name}`)
  }
}
