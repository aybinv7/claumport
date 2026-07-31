import {basename} from 'node:path'

import type {ClaudeAccount} from './account-types.js'

import {filesNamed, immediateDirectories} from '../../shared/filesystem.js'

export class AccountRepository {
  public constructor(private readonly codeSessionsDir: string) {}

  public async list(): Promise<ClaudeAccount[]> {
    const accountPaths = await immediateDirectories(this.codeSessionsDir)
    const accounts = await Promise.all(accountPaths.map(async (accountPath) => this.readAccount(accountPath)))
    return accounts.sort((left, right) => right.sessionCount - left.sessionCount || left.id.localeCompare(right.id))
  }

  public async resolve(reference: string): Promise<ClaudeAccount> {
    const accounts = await this.list()
    const exact = accounts.find((account) => account.id === reference)
    if (exact) return exact

    const matches = accounts.filter((account) => account.id.toLowerCase().startsWith(reference.toLowerCase()))
    if (matches.length === 1) return matches[0]
    if (matches.length === 0) throw new Error(`Claude Desktop account not found: ${reference}`)
    throw new Error(`Account reference is ambiguous: ${reference}`)
  }

  private async readAccount(accountPath: string): Promise<ClaudeAccount> {
    const organizationPaths = await immediateDirectories(accountPath)
    const organizations = await Promise.all(
      organizationPaths.map(async (organizationPath) => ({
        id: basename(organizationPath),
        sessionCount: (await filesNamed(organizationPath, (name) => name.startsWith('local_') && name.endsWith('.json')))
          .length,
      })),
    )
    const sortedOrganizations = organizations.sort((left, right) => right.sessionCount - left.sessionCount)

    return {
      id: basename(accountPath),
      organizations: sortedOrganizations,
      sessionCount: sortedOrganizations.reduce((total, organization) => total + organization.sessionCount, 0),
    }
  }
}
