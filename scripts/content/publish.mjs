import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildContent } from './build.mjs'
import { ensureDirectory, readSafeFile, writeImmutable } from './workspace.mjs'
import {
  assertObjectMatches, bucketForLane, cliError, createR2Storage, mapConcurrent,
  parseContentArgs, POINTER_CACHE_CONTROL, readRemoteRelease, sha256,
  uploadImmutable, validateObjectKey, validatePointer,
} from './storage.mjs'

export async function publishContent({ lane, workspace, storage, build = buildContent, now = new Date(), onProgress } = {}) {
  const bucket = bucketForLane(lane)
  const release = await build({ workspace, now })
  const pointer = validatePointer(release.pointer)
  if (release.catalogKey !== pointer.catalogKey || release.manifest.catalogKey !== pointer.catalogKey ||
    release.manifest.schemaVersion !== 1 || release.manifest.postCount !== pointer.postCount) {
    throw new Error('Built release catalog does not match its pointer.')
  }
  const files = release.manifest.files
  const catalog = files.find((file) => file.key === pointer.catalogKey)
  if (!catalog || catalog.sha256 !== pointer.sha256 || files.filter((file) => file.key === pointer.catalogKey).length !== 1) {
    throw new Error('Built release catalog checksum does not match its pointer.')
  }
  const unique = new Set()
  for (const file of files) {
    validateObjectKey(file.key)
    const mediaMatch = /^media\/([a-f0-9]{64})\.(webp|mp4|webm|jpg|jpeg|png|gif|avif)$/.exec(file.key)
    if (unique.has(file.key) || (file.key !== pointer.catalogKey && (!mediaMatch || mediaMatch[1] !== file.sha256))) {
      throw new Error('Built release has duplicate or unexpected objects.')
    }
    unique.add(file.key)
    const relative = path.relative(release.workspace, file.path)
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error('Built content file is outside the external workspace.')
    }
  }
  const ownedStorage = !storage
  storage ??= await createR2Storage(lane)
  if (storage.bucket && storage.bucket !== bucket) throw new Error('R2 storage bucket does not match the selected lane.')
  try {
    const previousPointer = await storage.head('current.json')
    if (previousPointer && !previousPointer.etag) throw new Error('Remote current.json has no version identifier; publish cannot safely replace it.')
    const report = (phase, completed) => {
      if (completed % 200 === 0 || completed === files.length) onProgress?.({ phase, completed, total: files.length })
    }
    let uploaded = 0
    const media = files.filter((file) => file.key !== pointer.catalogKey)
    const results = await mapConcurrent(media, async (file) => {
      const result = await uploadImmutable(storage, file, await readSafeFile(file.path))
      report('upload', ++uploaded)
      return result
    })
    await uploadImmutable(storage, catalog, await readSafeFile(catalog.path))
    report('upload', ++uploaded)
    // Verify the complete release before making it visible to readers.
    let verifiedObjects = 0
    await mapConcurrent(files, async (file) => {
      assertObjectMatches(await storage.head(file.key), file)
      report('verify', ++verifiedObjects)
    })
    const pointerBytes = Buffer.from(`${JSON.stringify(pointer, null, 2)}\n`)
    try {
      await storage.put('current.json', pointerBytes, {
        contentType: 'application/json; charset=utf-8',
        cacheControl: POINTER_CACHE_CONTROL,
        ...(previousPointer ? { ifMatch: previousPointer.etag } : { ifNoneMatch: true }),
      })
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 412 || error?.name === 'PreconditionFailed') {
        throw new Error('Another publisher changed current.json during this publish. Retry to publish this release safely.')
      }
      throw error
    }
    const verified = await readRemoteRelease(storage)
    if (sha256(verified.pointerBytes) !== sha256(pointerBytes) || verified.pointer.catalogKey !== pointer.catalogKey ||
      verified.pointer.sha256 !== pointer.sha256) throw new Error('Remote current.json changed before publish verification completed. No local success receipt was written.')
    const receipt = {
      schemaVersion: 1, lane, bucket, pointer,
      verifiedAt: new Date().toISOString(),
      objectCount: files.length,
      uploadedMedia: results.filter((result) => result === 'uploaded').length,
      existingMedia: results.filter((result) => result === 'existing').length,
    }
    const receiptDir = path.join(release.workspace, 'receipts', lane)
    await ensureDirectory(receiptDir)
    const receiptPath = path.join(receiptDir, `${pointer.sha256}-${randomUUID()}.json`)
    await writeImmutable(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    return { ...receipt, receiptPath }
  } finally {
    if (ownedStorage) storage.close()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseContentArgs(process.argv.slice(2))
    const receipt = await publishContent({ ...args, onProgress: ({ phase, completed, total }) => {
      console.log(`${phase === 'upload' ? 'Uploaded or reused' : 'Verified release'} ${completed}/${total} objects.`)
    } })
    console.log(`Published ${receipt.pointer.postCount} entries to ${receipt.lane}; verified ${receipt.objectCount} objects. Receipt: ${receipt.receiptPath}`)
  } catch (error) { cliError(error) }
}
