import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

export const ACCOUNT_ID = 'ddb45a91c623b716978d580d88298be1'
export const BUCKETS = Object.freeze({
  dev: 'personal-fitness-content-dev',
  main: 'personal-fitness-content-production',
})
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const POINTER_CACHE_CONTROL = 'no-cache, no-store, must-revalidate'

export function bucketForLane(lane) {
  if (!Object.hasOwn(BUCKETS, lane)) throw new Error('Specify exactly one lane: dev or main.')
  return BUCKETS[lane]
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function validateObjectKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 1024 || key.startsWith('/') ||
    key.includes('\\') || /[\x00-\x1f\x7f?#]/.test(key) ||
    key.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Invalid content object key.')
  }
  return key
}

export function parseContentArgs(args, { laneRequired = true } = {}) {
  let lane
  let workspace
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--workspace' && args[index + 1] && !args[index + 1].startsWith('--')) {
      if (workspace) throw new Error('Specify --workspace only once.')
      workspace = args[++index]
    } else if (!lane && (value === 'dev' || value === 'main') && laneRequired) {
      lane = value
    } else {
      throw new Error(`Unexpected argument: ${value}.`)
    }
  }
  if (laneRequired) bucketForLane(lane)
  return { lane, workspace }
}

export function loadCredentials(env = process.env, platform = process.platform, keychainRead = execFileSync) {
  if (env.R2_ACCESS_KEY_ID || env.R2_SECRET_ACCESS_KEY) {
    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
      throw new Error('Set both R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.')
    }
    return { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }
  }
  if (platform === 'darwin') {
    try {
      const raw = keychainRead('/usr/bin/security', [
        'find-generic-password', '-a', 'personal-fitness-site',
        '-s', 'personal-fitness-content-r2', '-w',
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      const value = JSON.parse(raw)
      if (typeof value.accessKeyId === 'string' && value.accessKeyId &&
        typeof value.secretAccessKey === 'string' && value.secretAccessKey) {
        return { accessKeyId: value.accessKeyId, secretAccessKey: value.secretAccessKey }
      }
    } catch {
      // Never include Keychain command output or a credential in an error.
    }
  }
  throw new Error('R2 credentials are unavailable. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY, or use the approved personal-fitness-content-r2 macOS Keychain item.')
}

export async function createR2Storage(lane, options = {}) {
  const bucket = bucketForLane(lane)
  const credentials = options.credentials ?? loadCredentials()
  const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials,
    maxAttempts: 5,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return {
    bucket,
    async head(key) {
      validateObjectKey(key)
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return { size: result.ContentLength, sha256: result.Metadata?.sha256, etag: result.ETag }
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey' || error?.name === 'NotFound') return null
        throw error
      }
    },
    async get(key) {
      validateObjectKey(key)
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      if (!result.Body) throw new Error(`Remote object has no body: ${key}.`)
      return Buffer.from(await result.Body.transformToByteArray())
    },
    async put(key, bytes, { contentType, cacheControl, immutable = false, ifMatch, ifNoneMatch = false } = {}) {
      validateObjectKey(key)
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.length,
        ContentMD5: createHash('md5').update(bytes).digest('base64'),
        ContentType: contentType,
        CacheControl: cacheControl,
        Metadata: { sha256: sha256(bytes) },
        ...(immutable || ifNoneMatch ? { IfNoneMatch: '*' } : {}),
        ...(ifMatch ? { IfMatch: ifMatch } : {}),
      }))
    },
    close() { client.destroy() },
  }
}

export async function mapConcurrent(values, operation, limit = 8) {
  const results = new Array(values.length)
  let next = 0
  let failure
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (!failure) {
      const index = next++
      if (index >= values.length) return
      try { results[index] = await operation(values[index], index) } catch (error) { failure ??= error }
    }
  }))
  if (failure) throw failure
  return results
}

export function assertObjectMatches(actual, expected) {
  if (!actual || actual.size !== expected.size || actual.sha256 !== expected.sha256) {
    throw new Error(`Immutable object verification failed: ${expected.key}. Existing remote objects are never overwritten.`)
  }
}

export async function uploadImmutable(storage, file, bytes) {
  validateObjectKey(file.key)
  if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new Error(`Local content changed during publish: ${file.key}.`)
  const existing = await storage.head(file.key)
  if (existing) {
    assertObjectMatches(existing, file)
    return 'existing'
  }
  try {
    await storage.put(file.key, bytes, {
      contentType: file.contentType,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      immutable: true,
    })
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 412 && error?.name !== 'PreconditionFailed') throw error
    // Another publisher may have finished the same content-addressed object.
  }
  assertObjectMatches(await storage.head(file.key), file)
  return 'uploaded'
}

export function validatePointer(pointer) {
  if (!pointer || pointer.schemaVersion !== 1 || !/^releases\/[a-f0-9]{64}\/catalog\.json$/.test(pointer.catalogKey) ||
    !/^[a-f0-9]{64}$/.test(pointer.sha256) || pointer.catalogKey !== `releases/${pointer.sha256}/catalog.json` ||
    !Number.isSafeInteger(pointer.postCount) || pointer.postCount < 0 ||
    typeof pointer.publishedAt !== 'string' || Number.isNaN(Date.parse(pointer.publishedAt))) {
    throw new Error('Remote content pointer is invalid.')
  }
  return pointer
}

export async function readRemoteRelease(storage) {
  const pointerBytes = await storage.get('current.json')
  const pointer = validatePointer(JSON.parse(pointerBytes.toString('utf8')))
  const catalogBytes = await storage.get(pointer.catalogKey)
  if (sha256(catalogBytes) !== pointer.sha256) throw new Error('Remote catalog checksum does not match current.json.')
  return { pointer, pointerBytes, catalogBytes, catalog: JSON.parse(catalogBytes.toString('utf8')) }
}

export function cliError(error) {
  // SDK and subprocess errors can embed request details; only emit curated messages.
  const message = error instanceof Error && error.constructor === Error ? error.message : 'Content operation failed. Check bucket permissions and network access, then retry.'
  console.error(message)
  process.exitCode = 1
}
