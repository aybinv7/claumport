import {expect} from 'chai'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {AccountRepository} from '../../../src/modules/accounts/account-repository.js'

describe('AccountRepository', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'claumport-accounts-'))
  })

  afterEach(async () => {
    await rm(root, {force: true, recursive: true})
  })

  it('discovers account partitions and counts session metadata', async () => {
    const first = join(root, 'account-a', 'org-a')
    const second = join(root, 'account-b', 'org-b')
    await Promise.all([mkdir(first, {recursive: true}), mkdir(second, {recursive: true})])
    await Promise.all([
      writeFile(join(first, 'local_1.json'), '{}'),
      writeFile(join(first, 'local_2.json'), '{}'),
      writeFile(join(first, 'ignored.txt'), ''),
      writeFile(join(second, 'local_3.json'), '{}'),
    ])

    const accounts = await new AccountRepository(root).list()

    expect(accounts.map((account) => [account.id, account.sessionCount])).to.deep.equal([
      ['account-a', 2],
      ['account-b', 1],
    ])
  })

  it('resolves a unique account prefix', async () => {
    await Promise.all([
      mkdir(join(root, '11111111-account', 'org'), {recursive: true}),
      mkdir(join(root, '22222222-account', 'org'), {recursive: true}),
    ])

    const account = await new AccountRepository(root).resolve('1111')

    expect(account.id).to.equal('11111111-account')
  })
})
