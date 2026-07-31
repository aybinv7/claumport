import {homedir, platform} from 'node:os'
import {join} from 'node:path'

export type ClaumportPaths = {
  accountLabelsPath: string
  archivesDir: string
  claudeConfigDir: string
  codeSessionsDir: string
  desktopConfigPath: string
  desktopDataDir: string
  operationsDir: string
  projectsDir: string
}

export function resolvePaths(options: {claudeConfigDir?: string; desktopDataDir?: string} = {}): ClaumportPaths {
  const home = homedir()
  const claudeConfigDir = options.claudeConfigDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(home, '.claude')
  const desktopDataDir = options.desktopDataDir ?? defaultDesktopDataDir(home)

  return {
    accountLabelsPath: join(home, '.claumport', 'accounts.json'),
    archivesDir: join(home, '.claumport', 'exports'),
    claudeConfigDir,
    codeSessionsDir: join(desktopDataDir, 'claude-code-sessions'),
    desktopConfigPath: join(desktopDataDir, 'config.json'),
    desktopDataDir,
    operationsDir: join(home, '.claumport', 'operations'),
    projectsDir: join(claudeConfigDir, 'projects'),
  }
}

function defaultDesktopDataDir(home: string): string {
  if (platform() === 'win32') {
    return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Claude')
  }

  if (platform() === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Claude')
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'Claude')
}
