import type {ArchiveProject} from '../modules/archives/archive-projects.js'
import type {SessionArchiveDescriptor} from '../modules/archives/archive-types.js'

import {pathExists} from '../shared/filesystem.js'
import {compactPath, formatTimestamp} from './format.js'
import {askText, chooseDirectory, selectMany, selectOne, showNote} from './prompts.js'

export type ArchiveImportSource = 'file' | 'library'

export type DuplicateArchiveAction = 'override' | 'rename' | 'skip'

export async function chooseDuplicateAction(title: string): Promise<DuplicateArchiveAction> {
  return selectOne<DuplicateArchiveAction>(`"${title}" was already imported into this account and folder`, [
    {hint: 'Import again with the same title', label: 'Override — import as a duplicate', value: 'override'},
    {hint: 'Import again under a different title', label: 'Import with a new name', value: 'rename'},
    {hint: 'Leave this session out of the batch', label: 'Skip this session', value: 'skip'},
  ])
}

export async function chooseArchiveImportSource(archivesDir: string, archiveCount: number): Promise<ArchiveImportSource> {
  return selectOne<ArchiveImportSource>('Where is the archive?', [
    {
      hint: 'Drag and drop a .claumport file here, or paste its full path',
      label: 'Choose a file from this device',
      value: 'file',
    },
    ...(archiveCount > 0
      ? [{hint: `${archiveCount} saved archive(s) in ${compactPath(archivesDir)}`, label: 'Archive library', value: 'library' as const}]
      : []),
  ])
}

export async function askArchivePath(): Promise<string> {
  const value = await askText('Drop a .claumport file here or paste its full path', String.raw`C:\path\session.claumport`)
  return normalizeDroppedPath(value)
}

export function normalizeDroppedPath(value: string): string {
  const trimmed = value.trim()
  const wrapped = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  return wrapped ? trimmed.slice(1, -1).trim() : trimmed
}

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
  if (selectable.length === 1) return selectable
  const selection = await selectMany<ArchiveProject | typeof all>(question, [
    {disabled: selectable.length === 0, hint: `${selectable.length} importable project(s)`, label: 'All importable projects', value: all},
    ...projects.map((project) => ({
      disabled: !project.archives.some((archive) => !isCurrentAccountArchive(archive, currentAccountId)),
      hint: `${project.archives.length} session(s) · source ${compactPath(project.path)}`,
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
  if (selectable.length === 1) return selectable
  const selection = await selectMany<SessionArchiveDescriptor | typeof all>(question, [
    {disabled: selectable.length === 0, hint: `${selectable.length} importable archive(s)`, label: 'All importable sessions', value: all},
    ...archives.map((archive) => ({
      disabled: isCurrentAccountArchive(archive, currentAccountId),
      hint: `${formatTimestamp(Date.parse(archive.manifest.exportedAt))} · ${archive.manifest.source.deviceName}${isCurrentAccountArchive(archive, currentAccountId) ? ' · current account export' : ''}`,
      label: archive.manifest.source.title,
      value: archive,
    })),
  ])
  return selection.includes(all) ? selectable : selection.filter((item): item is SessionArchiveDescriptor => item !== all)
}

export async function chooseImportRoot(projectCount: number): Promise<string> {
  showNote(
    `Each of the ${projectCount} source projects gets its own subfolder under the folder you choose next.`,
    'Destination · all projects',
  )
  return chooseDirectory('Local root folder for imported projects')
}

export async function chooseArchiveTarget(project: ArchiveProject): Promise<string> {
  const sourcePath = project.path?.trim()
  showNote(
    [
      `Source project: ${sourcePath ?? 'Path was not recorded'}`,
      'Select the local project folder where these sessions should appear.',
      'Only session history is imported. Project files are never changed.',
    ].join('\n'),
    `Destination · ${project.name}`,
  )
  if (sourcePath && (await pathExists(sourcePath))) {
    const destination = await selectOne<'other' | 'source'>('Use the detected local project folder?', [
      {hint: 'Folder exists on this device', label: compactPath(sourcePath), value: 'source'},
      {hint: 'Browse or paste another folder', label: 'Choose another folder', value: 'other'},
    ])
    if (destination === 'source') return sourcePath
  }

  return chooseDirectory(`Local project folder for ${project.name}`)
}

function isCurrentAccountArchive(archive: SessionArchiveDescriptor, currentAccountId?: string): boolean {
  return archive.manifest.source.accountId === currentAccountId
}
