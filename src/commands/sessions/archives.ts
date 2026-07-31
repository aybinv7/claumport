import {Command, Flags} from '@oclif/core'
import {basename} from 'node:path'

import type {SessionArchiveDescriptor} from '../../modules/archives/archive-types.js'

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

    const files = groupByFile(archives)
    this.log(muted(`${files.size} archive file(s) · ${archives.length} session(s)`))
    for (const [path, sessions] of files) {
      const newest = sessions[0]
      this.log(`\n${basename(path)}`)
      this.log(muted(`${sessions.length} session(s) · ${formatTimestamp(Date.parse(newest.manifest.exportedAt))}`))
      for (const session of sessions) {
        this.log(`  ${session.manifest.source.title}`)
        this.log(muted(`  ${session.manifest.source.deviceName} · ${shortId(session.manifest.archiveId)}`))
      }

      this.log(muted(compactPath(path)))
    }
  }
}

function groupByFile(archives: SessionArchiveDescriptor[]): Map<string, SessionArchiveDescriptor[]> {
  const files = new Map<string, SessionArchiveDescriptor[]>()
  for (const archive of archives) {
    const sessions = files.get(archive.archivePath)
    if (sessions) sessions.push(archive)
    else files.set(archive.archivePath, [archive])
  }

  return files
}
