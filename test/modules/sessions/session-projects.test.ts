import {expect} from 'chai'

import type {DesktopCodeSession} from '../../../src/modules/sessions/session-types.js'

import {groupSessionsByProject} from '../../../src/modules/sessions/session-projects.js'

describe('groupSessionsByProject', () => {
  it('groups sessions by working directory and orders groups by recent activity', () => {
    const projects = groupSessionsByProject([
      session({cwd: String.raw`C:\code\alpha`, lastActivityAt: 2, sessionId: 'alpha-old'}),
      session({cwd: String.raw`C:\code\beta`, lastActivityAt: 4, sessionId: 'beta'}),
      session({cwd: String.raw`C:\code\alpha`, lastActivityAt: 3, sessionId: 'alpha-new'}),
    ])

    expect(projects.map((project) => project.name)).to.deep.equal(['beta', 'alpha'])
    expect(projects[1].sessions.map((item) => item.sessionId)).to.deep.equal(['alpha-new', 'alpha-old'])
  })
})

function session(overrides: Partial<DesktopCodeSession>): DesktopCodeSession {
  return {
    archived: false,
    filePath: 'metadata.json',
    organizationId: 'organization',
    resumable: true,
    sessionId: 'session',
    title: 'Session',
    transcriptUnavailable: false,
    ...overrides,
  }
}
