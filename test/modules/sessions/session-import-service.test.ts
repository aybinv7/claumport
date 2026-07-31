import {expect} from 'chai'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import type {DesktopCodeSession} from '../../../src/modules/sessions/session-types.js'

import {SessionImportService} from '../../../src/modules/sessions/session-import-service.js'

describe('SessionImportService', () => {
  let root: string
  let sourceDirectory: string
  let sessionsDirectory: string
  let projectsDirectory: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'claumport-import-'))
    sourceDirectory = join(root, 'source')
    sessionsDirectory = join(root, 'sessions')
    projectsDirectory = join(root, 'projects')
    await Promise.all([mkdir(sourceDirectory, {recursive: true}), mkdir(sessionsDirectory, {recursive: true})])
  })

  afterEach(async () => {
    await rm(root, {force: true, recursive: true})
  })

  it('creates independent transcript identity and fresh Desktop metadata', async () => {
    const metadataPath = join(sourceDirectory, 'local_source.json')
    const transcriptPath = join(sourceDirectory, 'source-cli.jsonl')
    await Promise.all([
      writeFile(metadataPath, JSON.stringify({cliSessionId: 'source-cli', cwd: 'source', sessionId: 'local_source'})),
      writeFile(
        transcriptPath,
        [
          JSON.stringify({cwd: 'source', parentUuid: null, sessionId: 'source-cli', timestamp: '2026-01-01T00:00:00.000Z', type: 'user', uuid: 'first'}),
          JSON.stringify({cwd: 'source', leafUuid: 'second', logicalParentUuid: 'first', parentUuid: 'first', sessionId: 'source-cli', timestamp: '2026-01-01T00:00:01.000Z', type: 'assistant', uuid: 'second'}),
        ].join('\n'),
      ),
    ])
    const source = createSession(metadataPath, transcriptPath)
    const service = new SessionImportService(sessionsDirectory, join(root, 'operations'), projectsDirectory)
    const targetDirectory = join(root, 'test import')
    const plan = service.createPlan({
      destinationAccountId: 'target-account',
      destinationOrganizationId: 'organization',
      sourceSession: source,
      targetDirectory,
    })

    const operation = await service.execute(plan, 'Imported test')
    const records = (await readFile(operation.destinationTranscriptPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    const metadata = JSON.parse(await readFile(plan.destinationMetadataPath, 'utf8')) as Record<string, unknown>

    expect(records.map((record) => record.sessionId)).to.deep.equal([plan.destinationCliSessionId, plan.destinationCliSessionId])
    expect(records.map((record) => record.cwd)).to.deep.equal([targetDirectory, targetDirectory])
    expect(records[0].uuid).to.not.equal('first')
    expect(records[1].uuid).to.not.equal('second')
    expect(records[1].parentUuid).to.equal(records[0].uuid)
    expect(records[1].logicalParentUuid).to.equal(records[0].uuid)
    expect(records[1].leafUuid).to.equal(records[1].uuid)
    expect(metadata.sessionId).to.equal(plan.destinationSessionId)
    expect(metadata.cliSessionId).to.equal(plan.destinationCliSessionId)
    expect(metadata.cwd).to.equal(targetDirectory)
    expect(metadata.title).to.equal('Imported test')
  })
})

function createSession(filePath: string, transcriptPath: string): DesktopCodeSession {
  return {
    archived: false,
    cliSessionId: 'source-cli',
    filePath,
    organizationId: 'organization',
    resumable: true,
    sessionId: 'local_source',
    title: 'Source session',
    transcriptPath,
    transcriptUnavailable: false,
  }
}
