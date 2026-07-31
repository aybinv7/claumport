import {Command, Flags} from '@oclif/core'

import {compactPath, formatTimestamp, shortId} from '../../cli/format.js'
import {accent, muted} from '../../cli/terminal-style.js'
import {resolvePaths} from '../../config/paths.js'
import {ArchiveRepository} from '../../modules/archives/archive-repository.js'

export default class SessionsArchives extends Command {
  static description = 'List portable session archives saved in the Claumport library'
  static flags = {
    json: Flags.boolean({description: 'Print machine-readable JSON'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(SessionsArchives)
    const paths = resolvePaths()
    const archives = await new ArchiveRepository(paths.archivesDir).list()

    if (flags.json) {
      this.log(JSON.stringify({archives, archivesDir: paths.archivesDir}, null, 2))
      return
    }

    this.log(`${accent('◆')} Archive library`)
    this.log(muted(paths.archivesDir))
    if (archives.length === 0) {
      this.log('No valid archives saved yet. Run: claumport sessions export')
      return
    }

    for (const archive of archives) {
      this.log(`\n${archive.manifest.source.title}`)
      this.log(muted(`${formatTimestamp(Date.parse(archive.manifest.exportedAt))} · ${shortId(archive.manifest.archiveId)}`))
      this.log(muted(compactPath(archive.archivePath)))
    }
  }
}
