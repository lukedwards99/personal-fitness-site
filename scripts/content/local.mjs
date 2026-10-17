import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildContent } from './build.mjs'
import { readSafeFile } from './workspace.mjs'
import { cliError, IMMUTABLE_CACHE_CONTROL, mapConcurrent, parseContentArgs, POINTER_CACHE_CONTROL, sha256 } from './storage.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

export async function hydrateLocalContent({ workspace, build = buildContent, createProxy } = {}) {
  const release = await build({ workspace })
  createProxy ??= (await import('wrangler')).getPlatformProxy
  const proxy = await createProxy({
    configPath: path.join(ROOT, 'wrangler.jsonc'),
    persist: { path: path.join(ROOT, '.wrangler', 'state', 'v3') },
    remoteBindings: false,
    envFiles: [],
  })
  try {
    const bucket = proxy.env.CONTENT
    if (!bucket || typeof bucket.put !== 'function') throw new Error('Local CONTENT R2 binding is missing from wrangler.jsonc.')
    await mapConcurrent(release.manifest.files, async (file) => {
      const existing = await bucket.head(file.key)
      if (existing && existing.size === file.size && existing.customMetadata?.sha256 === file.sha256) return
      const bytes = await readSafeFile(file.path)
      if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new Error(`Local content changed during hydration: ${file.key}.`)
      await bucket.put(file.key, bytes, {
        httpMetadata: { contentType: file.contentType, cacheControl: IMMUTABLE_CACHE_CONTROL },
        customMetadata: { sha256: file.sha256 },
      })
    })
    const pointerBytes = Buffer.from(`${JSON.stringify(release.pointer, null, 2)}\n`)
    await bucket.put('current.json', pointerBytes, {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: POINTER_CACHE_CONTROL },
      customMetadata: { sha256: sha256(pointerBytes) },
    })
    return { postCount: release.pointer.postCount, objectCount: release.manifest.files.length, workspace: release.workspace }
  } finally { await proxy.dispose() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await hydrateLocalContent(parseContentArgs(process.argv.slice(2), { laneRequired: false }))
    console.log(`Loaded ${result.postCount} entries into local R2 from ${result.workspace}.`)
  } catch (error) { cliError(error) }
}
