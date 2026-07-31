import {Command} from '@oclif/core'

import {selectOne} from '../cli/prompts.js'

type MainAction = 'accounts' | 'archives' | 'exit' | 'sessions'
type AccountsAction = 'back' | 'label'
type SessionsAction = 'archives' | 'back' | 'export' | 'import' | 'list'

export default class Menu extends Command {
  static description = 'Open guided Claumport session manager'

  public async run(): Promise<void> {
    await this.openMenu()
  }

  private async openAccounts(): Promise<void> {
    await this.config.runCommand('accounts:list')
    const action = await selectOne<AccountsAction>('Accounts', [
      {hint: 'Give an account a friendly name', label: 'Name an account', value: 'label'},
      {label: 'Back', value: 'back'},
    ])
    if (action === 'label') await this.config.runCommand('accounts:label')
  }

  private async openMenu(): Promise<void> {
    const action = await selectOne<MainAction>('What would you like to do?', [
      {hint: 'View, name, and switch between local Claude accounts', label: 'Accounts', value: 'accounts'},
      {hint: 'Browse projects, export sessions, or import an archive', label: 'Sessions', value: 'sessions'},
      {hint: 'View saved portable session archives', label: 'Archive library', value: 'archives'},
      {hint: 'Close Claumport', label: 'Exit', value: 'exit'},
    ])
    if (action === 'exit') return
    if (action === 'accounts') await this.openAccounts()
    if (action === 'archives') await this.config.runCommand('sessions:archives')
    if (action === 'sessions') await this.openSessions()
    await this.openMenu()
  }

  private async openSessions(): Promise<void> {
    const action = await selectOne<SessionsAction>('Sessions', [
      {hint: 'Grouped by local Claude Code project', label: 'Browse sessions', value: 'list'},
      {hint: 'Choose project, then session', label: 'Export session', value: 'export'},
      {hint: 'Use a saved archive or drop a .claumport file', label: 'Import session', value: 'import'},
      {hint: 'View saved portable archives', label: 'Archive library', value: 'archives'},
      {label: 'Back', value: 'back'},
    ])
    if (action === 'list') await this.config.runCommand('sessions:list')
    if (action === 'export') await this.config.runCommand('sessions:export')
    if (action === 'import') await this.config.runCommand('sessions:import')
    if (action === 'archives') await this.config.runCommand('sessions:archives')
  }
}
