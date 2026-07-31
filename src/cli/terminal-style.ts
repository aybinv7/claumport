import {ux} from '@oclif/core'
import {stdout} from 'node:process'

type Color = 'cyan' | 'gray' | 'green' | 'yellow'

export function accent(value: string): string {
  return color('cyan', value)
}

export function muted(value: string): string {
  return color('gray', value)
}

export function success(value: string): string {
  return color('green', value)
}

export function warning(value: string): string {
  return color('yellow', value)
}

function color(tone: Color, value: string): string {
  return stdout.isTTY ? ux.colorize(tone, value) : value
}
