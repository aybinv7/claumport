import {expect} from 'chai'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import type {DesktopCodeSession} from '../../../src/modules/sessions/session-types.js'

import {inspectArchive} from '../../../src/modules/archives/archive-format.js'
import {SessionArchiveImportService} from '../../../src/modules/archives/session-archive-import-service.js'
import {SessionExportService} from '../../../src/modules/archives/session-export-service.js'

describe('portable session archive', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'claumport-archive-'))
  })

  afterEach(async () => {
    await rm(root, {force: true, recursive: true})
  })

  it('round-trips a session across devices with fresh identity and rewritten path', async () => {
    const sourceDirectory = join(root, 'source')
    const targetDirectory = join(root, 'existing-project')
    const sessionsDirectory = join(root, 'desktop', 'claude-code-sessions')
    const projectsDirectory = join(root, '.claude', 'projects')
    const operationsDirectory = join(root, 'operations')
    await Promise.all([mkdir(sourceDirectory, {recursive: true}), mkdir(targetDirectory, {recursive: true})])
    const metadataPath = join(sourceDirectory, 'local_source.json')
    const transcriptPath = join(sourceDirectory, 'source-cli.jsonl')
    const archivePath = join(root, 'friend-session.claumport')
    await Promise.all([
      writeFile(metadataPath, JSON.stringify({cliSessionId: 'source-cli', model: 'fixture-model', sessionId: 'local_source'})),
      writeFile(
        transcriptPath,
        [
          JSON.stringify({cwd: 'friend-path', parentUuid: null, sessionId: 'source-cli', type: 'user', uuid: 'first'}),
          JSON.stringify({cwd: 'friend-path', parentUuid: 'first', sessionId: 'source-cli', type: 'assistant', uuid: 'second'}),
        ].join('\n'),
      ),
      writeFile(join(targetDirectory, 'README.md'), 'keep me'),
    ])
    const source = createSession(metadataPath, transcriptPath)
    const manifest = await new SessionExportService().export({
      outputPath: archivePath,
      session: source,
      sourceAccountId: 'friend-account',
    })
    const replacement = await new SessionExportService().export({
      outputPath: archivePath,
      overwrite: true,
      session: source,
      sourceAccountId: 'friend-account',
    })
    const inspected = await inspectArchive(archivePath)
    const importer = new SessionArchiveImportService(sessionsDirectory, operationsDirectory, projectsDirectory)
    const plan = await importer.createPlan({
      archive: inspected,
      destinationAccountId: 'recipient-account',
      destinationOrganizationId: 'recipient-organization',
      targetDirectory,
    })

    const operation = await importer.execute(plan)
    const records = (await readFile(operation.transcriptPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    const metadata = JSON.parse(await readFile(plan.destinationMetadataPath, 'utf8')) as Record<string, unknown>

    expect(inspected.manifest.archiveId).to.equal(replacement.archiveId)
    expect(inspected.manifest.archiveId).to.not.equal(manifest.archiveId)
    expect(inspected.manifest.source.accountId).to.equal('friend-account')
    expect(records.map((record) => record.sessionId)).to.deep.equal([plan.destinationCliSessionId, plan.destinationCliSessionId])
    expect(records.map((record) => record.cwd)).to.deep.equal([targetDirectory, targetDirectory])
    expect(records[1].parentUuid).to.equal(records[0].uuid)
    expect(metadata.sessionId).to.equal(plan.destinationSessionId)
    expect(metadata.model).to.equal('fixture-model')
    expect(await readFile(join(targetDirectory, 'README.md'), 'utf8')).to.equal('keep me')

    const duplicatePlan = await importer.createPlan({
      archive: inspected,
      destinationAccountId: 'recipient-account',
      destinationOrganizationId: 'recipient-organization',
      targetDirectory,
    })
    await expectRejected(importer.execute(duplicatePlan), 'already imported')
  })
})

function createSession(filePath: string, transcriptPath: string): DesktopCodeSession {
  return {
    archived: false,
    cliSessionId: 'source-cli',
    filePath,
    organizationId: 'source-organization',
    resumable: true,
    sessionId: 'local_source',
    title: 'Friend session',
    transcriptPath,
    transcriptUnavailable: false,
  }
}

async function expectRejected(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise
    expect.fail('Expected promise to reject')
  } catch (error) {
    expect(error).to.be.instanceOf(Error)
    expect((error as Error).message).to.contain(message)
  }
}
