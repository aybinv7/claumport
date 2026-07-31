import type {Option} from '@clack/prompts'

import * as prompts from '@clack/prompts'
import {stdin, stdout} from 'node:process'

export type Choice<T> = {
  disabled?: boolean
  hint?: string
  label: string
  value: T
}

export async function selectOne<T>(question: string, choices: Choice<T>[]): Promise<T> {
  if (choices.length === 0) throw new Error(`No choices available for ${question}`)
  if (choices.every((choice) => choice.disabled)) throw new Error(`No selectable choices available for ${question}`)
  if (choices.length === 1) return choices[0].value
  if (!stdin.isTTY || !stdout.isTTY) throw new Error(`${question} requires a flag in non-interactive mode`)

  const options = choices.map((choice) => ({
    disabled: choice.disabled,
    hint: choice.hint,
    label: choice.label,
    value: choice.value,
  })) as Option<T>[]
  const answer = await (choices.length > 8 ? prompts.autocomplete : prompts.select)({
    message: question,
    options,
    ...(choices.length > 8 ? {maxItems: 8, placeholder: 'Type to filter…'} : {}),
  })
  if (prompts.isCancel(answer)) throw new Error('Cancelled. Nothing changed.')
  return answer as T
}

export async function selectMany<T>(question: string, choices: Choice<T>[]): Promise<T[]> {
  if (choices.length === 0) throw new Error(`No choices available for ${question}`)
  if (choices.every((choice) => choice.disabled)) throw new Error(`No selectable choices available for ${question}`)
  if (choices.length === 1 && !choices[0].disabled) return [choices[0].value]
  if (!stdin.isTTY || !stdout.isTTY) throw new Error(`${question} requires flags in non-interactive mode`)

  const answer = await prompts.multiselect({
    message: question,
    options: choices.map((choice) => ({
      disabled: choice.disabled,
      hint: choice.hint,
      label: choice.label,
      value: choice.value,
    })) as Option<T>[],
    required: true,
  })
  if (prompts.isCancel(answer)) throw new Error('Cancelled. Nothing changed.')
  return answer as T[]
}

export async function confirm(question: string): Promise<boolean> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error(`${question} requires --yes in non-interactive mode`)
  const answer = await prompts.confirm({initialValue: false, message: question})
  if (prompts.isCancel(answer)) throw new Error('Cancelled. Nothing changed.')
  return answer
}

export async function askText(question: string, placeholder?: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error(`${question} requires a flag in non-interactive mode`)
  const answer = await prompts.text({
    message: question,
    placeholder,
    validate(value) {
      return value?.trim().length === 0 ? 'Enter a value.' : undefined
    },
  })
  if (prompts.isCancel(answer)) throw new Error('Cancelled. Nothing changed.')
  return answer.trim()
}

export async function chooseDirectory(question: string, initialValue?: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error(`${question} requires --target in non-interactive mode`)
  const answer = await prompts.path({directory: true, initialValue, message: question})
  if (prompts.isCancel(answer)) throw new Error('Cancelled. Nothing changed.')
  return answer
}
