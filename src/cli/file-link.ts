import {resolve} from 'node:path'
import {stdout} from 'node:process'
import {pathToFileURL} from 'node:url'

export function fileLink(path: string): string {
  if (!stdout.isTTY) return path
  const target = pathToFileURL(resolve(path)).href
  return `\u001B]8;;${target}\u001B\\${path}\u001B]8;;\u001B\\`
}
