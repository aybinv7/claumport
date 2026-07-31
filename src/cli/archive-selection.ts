import type {ArchiveProject} from '../modules/archives/archive-projects.js'
import type {SessionArchiveDescriptor} from '../modules/archives/archive-types.js'

import {compactPath, formatTimestamp} from './format.js'
import {selectMany, selectOne} from './prompts.js'

export async function chooseArchive(
  question: string,
  archives: SessionArchiveDescriptor[],
  currentAccountId?: string,
): Promise<SessionArchiveDescriptor> {
  return selectOne(
    question,
    archives.map((archive) => ({
      disabled: archive.manifest.source.accountId === currentAccountId,
      hint: `${formatTimestamp(Date.parse(archive.manifest.exportedAt))} · ${compactPath(archive.manifest.source.originalCwd)}${archive.manifest.source.accountId === currentAccountId ? ' · current account export' : ''}`,
      label: archive.manifest.source.title,
      value: archive,
    })),
  )
}

export async function chooseArchiveProjects(
  question: string,
  projects: ArchiveProject[],
  currentAccountId?: string,
): Promise<ArchiveProject[]> {
  const all = '__all_archive_projects__'
  const selectable = projects.filter((project) => project.archives.some((archive) => !isCurrentAccountArchive(archive, currentAccountId)))
  const selection = await selectMany<ArchiveProject | typeof all>(question, [
    {disabled: selectable.length === 0, hint: `${selectable.length} importable project(s)`, label: 'All importable projects', value: all},
    ...projects.map((project) => ({
      disabled: !project.archives.some((archive) => !isCurrentAccountArchive(archive, currentAccountId)),
      hint: `${project.archives.length} archive(s) · ${compactPath(project.path)}`,
      label: project.name,
      value: project,
    })),
  ])
  return selection.includes(all) ? selectable : selection.filter((item): item is ArchiveProject => item !== all)
}

export async function chooseArchives(
  question: string,
  archives: SessionArchiveDescriptor[],
  currentAccountId?: string,
): Promise<SessionArchiveDescriptor[]> {
  const all = '__all_archives__'
  const selectable = archives.filter((archive) => !isCurrentAccountArchive(archive, currentAccountId))
  const selection = await selectMany<SessionArchiveDescriptor | typeof all>(question, [
    {disabled: selectable.length === 0, hint: `${selectable.length} importable archive(s)`, label: 'All importable sessions', value: all},
    ...archives.map((archive) => ({
      disabled: isCurrentAccountArchive(archive, currentAccountId),
      hint: `${formatTimestamp(Date.parse(archive.manifest.exportedAt))}${isCurrentAccountArchive(archive, currentAccountId) ? ' · current account export' : ''}`,
      label: archive.manifest.source.title,
      value: archive,
    })),
  ])
  return selection.includes(all) ? selectable : selection.filter((item): item is SessionArchiveDescriptor => item !== all)
}

function isCurrentAccountArchive(archive: SessionArchiveDescriptor, currentAccountId?: string): boolean {
  return archive.manifest.source.accountId === currentAccountId
}
