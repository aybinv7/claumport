import {basename} from 'node:path'

import type {DesktopCodeSession, SessionProject} from './session-types.js'

export function groupSessionsByProject(sessions: DesktopCodeSession[]): SessionProject[] {
  const groups = new Map<string, SessionProject>()
  for (const session of sessions) {
    const path = session.cwd?.trim()
    const id = path?.toLocaleLowerCase() ?? '__unknown__'
    const existing = groups.get(id)
    if (existing) {
      existing.sessions.push(session)
      continue
    }

    groups.set(id, {
      id,
      name: path ? basename(path) || path : 'Unknown project',
      path,
      sessions: [session],
    })
  }

  return [...groups.values()]
    .map((project) => ({
      ...project,
      sessions: project.sessions.sort(byLatestActivity),
    }))
    .sort((left, right) => byLatestActivity(left.sessions[0], right.sessions[0]))
}

function byLatestActivity(left: DesktopCodeSession, right: DesktopCodeSession): number {
  return (right.lastActivityAt ?? right.createdAt ?? 0) - (left.lastActivityAt ?? left.createdAt ?? 0)
}
