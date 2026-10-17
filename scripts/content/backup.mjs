import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertSafePath, ensureDirectory, readSafeFile, resolveWorkspace, writeImmutable } from './workspace.mjs'
import { assertObjectMatches, bucketForLane, cliError, createR2Storage, mapConcurrent, parseContentArgs, readRemoteRelease, sha256 } from './storage.mjs'

export function catalogMedia(catalog, postCount) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.posts) || catalog.posts.length !== postCount) {
    throw new Error('Remote catalog has an invalid entry count or schema.')
  }
  const media = new Map()
  for (const post of catalog.posts) {
    if (!Array.isArray(post.media)) throw new Error('Remote catalog entry has invalid media metadata.')
    for (const item of post.media) {
      const match = /^\/api\/(media\/([a-f0-9]{64})\.(webp|mp4|webm|jpg|jpeg|png|gif|avif))$/.exec(item?.path)
      if (!match) throw new Error('Remote catalog references an invalid media path.')
      media.set(match[1], { key: match[1], sha256: match[2] })
    }
  }
  return [...media.values()]
}

export async function backupContent({ lane, workspace, storage } = {}) {
  const bucket = bucketForLane(lane)
  workspace = await resolveWorkspace(workspace)
  const ownedStorage = !storage
  storage ??= await createR2Storage(lane)
  if (storage.bucket && storage.bucket !== bucket) throw new Error('R2 storage bucket does not match the selected lane.')
  try {
    const release = await readRemoteRelease(storage)
    const media = catalogMedia(release.catalog, release.pointer.postCount)
    const snapshot = path.join(workspace, 'backups', lane, `${release.pointer.sha256}-${sha256(release.pointerBytes).slice(0, 16)}`)
    await ensureDirectory(snapshot)
    await mapConcurrent(media, async (file) => {
      const metadata = await storage.head(file.key)
      if (!metadata || !Number.isSafeInteger(metadata.size) || metadata.size < 0) throw new Error(`Remote media is missing: ${file.key}.`)
      assertObjectMatches(metadata, { ...file, size: metadata.size })
      const target = path.join(snapshot, file.key)
      assertSafePath(target)
      let bytes = existsSync(target) ? await readSafeFile(target) : undefined
      if (!bytes) bytes = await storage.get(file.key)
      if (bytes.length !== metadata.size || sha256(bytes) !== file.sha256) throw new Error(`Backup media verification failed: ${file.key}.`)
      await ensureDirectory(path.dirname(target))
      await writeImmutable(target, bytes)
    })
    const catalogPath = path.join(snapshot, release.pointer.catalogKey)
    await ensureDirectory(path.dirname(catalogPath))
    await writeImmutable(catalogPath, release.catalogBytes)
    // Written last: the pointer is a completion marker for this immutable snapshot.
    await writeImmutable(path.join(snapshot, 'current.json'), release.pointerBytes)
    return { lane, bucket, snapshot, postCount: release.pointer.postCount, mediaCount: media.length }
  } finally {
    if (ownedStorage) storage.close()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await backupContent(parseContentArgs(process.argv.slice(2)))
    console.log(`Backed up ${result.postCount} entries and ${result.mediaCount} media files from ${result.lane}: ${result.snapshot}`)
  } catch (error) { cliError(error) }
}
