import {readJson} from '../../shared/filesystem.js'

type DesktopConfig = {
  lastKnownAccountUuid?: unknown
}

export class ActiveAccountRepository {
  public constructor(private readonly desktopConfigPath: string) {}

  public async getId(): Promise<string | undefined> {
    try {
      const config = await readJson<DesktopConfig>(this.desktopConfigPath)
      return typeof config.lastKnownAccountUuid === 'string' ? config.lastKnownAccountUuid : undefined
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`Invalid Claude Desktop config: ${this.desktopConfigPath}`)
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
      throw error
    }
  }
}
