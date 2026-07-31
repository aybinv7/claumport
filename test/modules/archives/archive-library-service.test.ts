import {expect} from 'chai'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import type {DesktopCodeSession} from '../../../src/modules/sessions/session-types.js'

import {normalizeDroppedPath} from '../../../src/cli/archive-selection.js'
import {ArchiveLibraryService} from '../../../src/modules/archives/archive-library-service.js'
import {SessionExportService} from '../../../src/modules/archives/session-export-service.js'

describe('archive library service', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'claumport-library-'))
  })

  afterEach(async () => {
    await rm(root, {force: true, recursive: true})
  })

  it('copies an external archive into the library without replacing an existing file', async () => {
    const sourceDirectory = join(root, 'received')
    const libraryDirectory = join(root, 'library')
    const sourcePath = join(sourceDirectory, 'shared.claumport')
    await mkdir(sourceDirectory, {recursive: true})
    const metadataPath = join(sourceDirectory, 'session.json')
    const transcriptPath = join(sourceDirectory, 'session.jsonl')
    await mkdir(libraryDirectory, {recursive: true})
    await Promise.all([
      writeFile(metadataPath, JSON.stringify({sessionId: 'session'})),
      writeFile(transcriptPath, '{}\n'),
      writeFile(join(libraryDirectory, 'shared.claumport'), 'existing'),
    ])
    await new SessionExportService().export({
      outputPath: sourcePath,
      session: createSession(metadataPath, transcriptPath),
      sourceAccountId: 'source-account',
    })

    const archives = await new ArchiveLibraryService(libraryDirectory).add(sourcePath)

    expect(archives).to.have.length(1)
    expect(archives[0].archivePath).to.equal(join(libraryDirectory, 'shared-2.claumport'))
    expect(await readFile(join(libraryDirectory, 'shared.claumport'), 'utf8')).to.equal('existing')
  })

  it('normalizes paths inserted by terminal drag and drop', () => {
    expect(normalizeDroppedPath(String.raw`  "C:\Users\Me\Downloads\shared session.claumport"  `)).to.equal(
      String.raw`C:\Users\Me\Downloads\shared session.claumport`,
    )
    expect(normalizeDroppedPath(String.raw`'C:\shared.claumport'`)).to.equal(String.raw`C:\shared.claumport`)
  })
})

function createSession(filePath: string, transcriptPath: string): DesktopCodeSession {
  return {
    archived: false,
    cliSessionId: 'cli-session',
    filePath,
    organizationId: 'organization',
    resumable: true,
    sessionId: 'session',
    title: 'Shared session',
    transcriptPath,
    transcriptUnavailable: false,
  }
}
