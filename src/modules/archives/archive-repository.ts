import type {SessionArchiveDescriptor} from './archive-types.js'

import {filesNamed} from '../../shared/filesystem.js'
import {inspectArchiveSessions} from './archive-format.js'

export class ArchiveRepository {
  public constructor(private readonly archivesDir: string) {}

  public async list(): Promise<SessionArchiveDescriptor[]> {
    const paths = await filesNamed(this.archivesDir, (name) => name.endsWith('.claumport'))
    const archives = await Promise.all(
      paths.map(async (path) => {
        try {
          return await inspectArchiveSessions(path)
        } catch {
          return null
        }
      }),
    )
    return archives
      .filter((archive): archive is SessionArchiveDescriptor[] => archive !== null)
      .flat()
      .sort((left, right) => right.manifest.exportedAt.localeCompare(left.manifest.exportedAt))
  }
}
