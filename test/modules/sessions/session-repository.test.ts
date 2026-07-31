import {expect} from 'chai'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {SessionRepository} from '../../../src/modules/sessions/session-repository.js'

describe('SessionRepository', () => {
  let root: string
  let sessionsRoot: string
  let projectsRoot: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'claumport-sessions-'))
    sessionsRoot = join(root, 'desktop')
    projectsRoot = join(root, 'projects')
    await Promise.all([
      mkdir(join(sessionsRoot, 'account', 'organization'), {recursive: true}),
      mkdir(join(projectsRoot, 'project'), {recursive: true}),
    ])
  })

  afterEach(async () => {
    await rm(root, {force: true, recursive: true})
  })

  it('marks metadata resumable only when a local transcript exists', async () => {
    const organization = join(sessionsRoot, 'account', 'organization')
    await Promise.all([
      writeFile(
        join(organization, 'local_visible.json'),
        JSON.stringify({cliSessionId: 'transcript-a', lastActivityAt: 20, sessionId: 'local_visible', title: 'Visible'}),
      ),
      writeFile(
        join(organization, 'local_missing.json'),
        JSON.stringify({lastActivityAt: 10, sessionId: 'local_missing', title: 'Missing'}),
      ),
      writeFile(join(projectsRoot, 'project', 'transcript-a.jsonl'), '{}\n'),
    ])

    const sessions = await new SessionRepository(sessionsRoot, projectsRoot).list('account', 'organization')

    expect(sessions.map((session) => [session.title, session.resumable])).to.deep.equal([
      ['Visible', true],
      ['Missing', false],
    ])
  })
})
