import {expect} from 'chai'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import type {DesktopCodeSession} from '../../../src/modules/sessions/session-types.js'

import {SessionShareService} from '../../../src/modules/sessions/session-share-service.js'

describe('SessionShareService', () => {
  let root: string
  let sessionsRoot: string
  let operationsRoot: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'claumport-share-'))
    sessionsRoot = join(root, 'sessions')
    operationsRoot = join(root, 'operations')
  })

  afterEach(async () => {
    await rm(root, {force: true, recursive: true})
  })

  it('copies new metadata and skips an identical destination', async () => {
    const sourceDirectory = join(sessionsRoot, 'source', 'org')
    await mkdir(sourceDirectory, {recursive: true})
    const first = await createSession(sourceDirectory, 'local_first', 'First')
    const second = await createSession(sourceDirectory, 'local_second', 'Second')
    const service = new SessionShareService(sessionsRoot, operationsRoot)
    const initialPlan = await service.plan({
      destinationAccountId: 'target',
      destinationOrganizationId: 'org',
      sessions: [first, second],
      sourceAccountId: 'source',
      sourceOrganizationId: 'org',
    })

    const operation = await service.execute(initialPlan)
    const repeatedPlan = await service.plan({
      destinationAccountId: 'target',
      destinationOrganizationId: 'org',
      sessions: [first, second],
      sourceAccountId: 'source',
      sourceOrganizationId: 'org',
    })

    expect(operation.createdFiles).to.have.length(2)
    expect(repeatedPlan.items.map((item) => item.status)).to.deep.equal(['exists', 'exists'])
    expect(JSON.parse(await readFile(operation.createdFiles[0], 'utf8')).title).to.equal('First')
  })

  it('refuses a conflicting destination without overwriting it', async () => {
    const sourceDirectory = join(sessionsRoot, 'source', 'org')
    const destinationDirectory = join(sessionsRoot, 'target', 'org')
    await Promise.all([mkdir(sourceDirectory, {recursive: true}), mkdir(destinationDirectory, {recursive: true})])
    const session = await createSession(sourceDirectory, 'local_conflict', 'Source')
    const destinationPath = join(destinationDirectory, 'local_conflict.json')
    await writeFile(destinationPath, JSON.stringify({sessionId: 'local_conflict', title: 'Target'}))
    const service = new SessionShareService(sessionsRoot, operationsRoot)
    const plan = await service.plan({
      destinationAccountId: 'target',
      destinationOrganizationId: 'org',
      sessions: [session],
      sourceAccountId: 'source',
      sourceOrganizationId: 'org',
    })

    expect(plan.items[0].status).to.equal('conflict')
    await expectRejected(service.execute(plan), 'Refusing to overwrite')
    expect(JSON.parse(await readFile(destinationPath, 'utf8')).title).to.equal('Target')
  })
})

async function createSession(directory: string, sessionId: string, title: string): Promise<DesktopCodeSession> {
  const filePath = join(directory, `${sessionId}.json`)
  await writeFile(filePath, JSON.stringify({sessionId, title}))
  return {
    archived: false,
    filePath,
    organizationId: 'org',
    resumable: true,
    sessionId,
    title,
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
