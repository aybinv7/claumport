import {spawn} from 'node:child_process'
import {dirname} from 'node:path'
import {platform} from 'node:process'

export function revealFile(path: string): void {
  const command = platform === 'win32' ? 'explorer.exe' : platform === 'darwin' ? 'open' : 'xdg-open'
  const args = platform === 'win32' ? [`/select,${path}`] : platform === 'darwin' ? ['-R', path] : [dirname(path)]
  const process = spawn(command, args, {detached: true, stdio: 'ignore'})
  process.unref()
}
