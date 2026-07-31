import {execFile} from 'node:child_process'
import {platform} from 'node:os'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

export async function isClaudeDesktopRunning(): Promise<boolean> {
  try {
    if (platform() === 'win32') {
      const {stdout} = await execFileAsync('tasklist.exe', ['/FI', 'IMAGENAME eq Claude.exe', '/FO', 'CSV', '/NH'])
      return stdout.toLowerCase().includes('claude.exe')
    }

    if (platform() === 'darwin') {
      await execFileAsync('pgrep', ['-x', 'Claude'])
      return true
    }

    const {stdout} = await execFileAsync('pgrep', ['-af', 'claude'])
    return stdout.toLowerCase().includes('claude')
  } catch {
    return false
  }
}
