import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('session commands', () => {
  let root: string
  let claudeDirectory: string
  let dataDirectory: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'claumport-commands-'))
    claudeDirectory = join(root, '.claude')
    dataDirectory = join(root, 'Claude')
    const source = join(dataDirectory, 'claude-code-sessions', 'source-account', 'organization')
    const target = join(dataDirectory, 'claude-code-sessions', 'target-account', 'organization')
    const project = join(claudeDirectory, 'projects', 'project')
    await Promise.all([mkdir(source, {recursive: true}), mkdir(target, {recursive: true}), mkdir(project, {recursive: true})])
    await Promise.all([
      writeFile(
        join(source, 'local_session.json'),
        JSON.stringify({cliSessionId: 'transcript', sessionId: 'local_session', title: 'Fixture session'}),
      ),
      writeFile(join(project, 'transcript.jsonl'), '{}\n'),
      writeFile(join(dataDirectory, 'config.json'), JSON.stringify({lastKnownAccountUuid: 'target-account'})),
    ])
  })

  afterEach(async () => {
    await rm(root, {force: true, recursive: true})
  })

  it('lists discovered accounts', async () => {
    const {stdout} = await runCommand(`accounts list --data-dir "${dataDirectory}"`)

    expect(stdout).to.contain('Unnamed Claude account')
    expect(stdout).to.contain('ID source-a…ount')
    expect(stdout).to.contain('ID target-a…ount')
  })

  it('lists resumable sessions', async () => {
    const {stdout} = await runCommand(
      `sessions list --account source --organization organization --data-dir "${dataDirectory}" --claude-dir "${claudeDirectory}"`,
    )

    expect(stdout).to.contain('Fixture session')
    expect(stdout).to.contain('READY')
  })

  it('creates a dry-run sharing plan without copying', async () => {
    const {stdout} = await runCommand(
      `sessions share --from source --to target --from-organization organization --to-organization organization --session local_session --dry-run --data-dir "${dataDirectory}" --claude-dir "${claudeDirectory}"`,
    )

    expect(stdout).to.contain('"status": "copy"')
  })

  it('exports a portable archive then creates an active-account import plan', async () => {
    const archive = join(root, 'fixture.claumport')
    const target = join(root, 'test import')
    const exported = await runCommand(
      `sessions export --account source --organization organization --session local_session --output "${archive}" --data-dir "${dataDirectory}" --claude-dir "${claudeDirectory}"`,
    )
    const imported = await runCommand(
      `sessions import "${archive}" --organization organization --target "${target}" --dry-run --data-dir "${dataDirectory}" --claude-dir "${claudeDirectory}"`,
    )

    expect(exported.stdout).to.contain('Exported 1 session(s) in one bundle')
    expect(imported.stdout).to.contain('"targetDirectory"')
    expect(imported.stdout).to.contain('target-account')
  })
})
