#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import {execute} from '@oclif/core'

const args = process.argv.slice(2)

await execute({args: args.length === 0 ? ['menu'] : args, development: true, dir: import.meta.url})
