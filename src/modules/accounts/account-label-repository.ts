import {pathExists, readJson, writeJsonAtomic} from '../../shared/filesystem.js'

type AccountLabelsFile = {
  labels: Record<string, string>
  version: 1
}

export class AccountLabelRepository {
  public constructor(private readonly path: string) {}

  public async getAll(): Promise<Map<string, string>> {
    if (!(await pathExists(this.path))) return new Map()
    const file = await readJson<Partial<AccountLabelsFile>>(this.path)
    if (file.version !== 1 || !file.labels || typeof file.labels !== 'object') return new Map()
    return new Map(Object.entries(file.labels).filter(([, label]) => typeof label === 'string' && label.trim().length > 0))
  }

  public async set(accountId: string, label: string): Promise<void> {
    const cleanLabel = label.trim()
    if (cleanLabel.length === 0) throw new Error('Account label cannot be empty')
    if (cleanLabel.length > 80) throw new Error('Account label must be 80 characters or fewer')
    const labels = Object.fromEntries(await this.getAll())
    labels[accountId] = cleanLabel
    await writeJsonAtomic(this.path, {labels, version: 1})
  }
}
