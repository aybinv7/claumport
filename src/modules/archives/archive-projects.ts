import {basename} from 'node:path'

import type {SessionArchiveDescriptor} from './archive-types.js'

export type ArchiveProject = {
  archives: SessionArchiveDescriptor[]
  id: string
  name: string
  path?: string
}

export function groupArchivesByProject(archives: SessionArchiveDescriptor[]): ArchiveProject[] {
  const groups = new Map<string, ArchiveProject>()
  for (const archive of archives) {
    const path = archive.manifest.source.originalCwd?.trim()
    const id = path?.toLocaleLowerCase() ?? '__unknown__'
    const existing = groups.get(id)
    if (existing) {
      existing.archives.push(archive)
      continue
    }

    groups.set(id, {
      archives: [archive],
      id,
      name: path ? basename(path) || path : 'Unknown project',
      path,
    })
  }

  return [...groups.values()]
    .map((project) => ({
      ...project,
      archives: project.archives.sort((left, right) => right.manifest.exportedAt.localeCompare(left.manifest.exportedAt)),
    }))
    .sort((left, right) => right.archives[0].manifest.exportedAt.localeCompare(left.archives[0].manifest.exportedAt))
}
