import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const inspect = (path) => {
  try { return lstatSync(path) } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

export function assertSafePath(value, { allowMissing = true } = {}) {
  const path = resolve(value)
  let current = parse(path).root
  for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    const stat = inspect(current)
    if (stat?.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${current}`)
    if (!stat && !allowMissing) throw new Error(`Required path is missing: ${current}`)
  }
  return path
}

export function resolveWorkspace(value) {
  const workspace = assertSafePath(value ?? process.env.FITNESS_CONTENT_DIR ?? join(homedir(), 'Documents', 'personal-fitness-content'))
  for (let current = workspace; ; current = dirname(current)) {
    if (inspect(join(current, '.git'))) throw new Error(`Content workspace must be outside every Git working tree: ${workspace}`)
    if (dirname(current) === current) break
  }
  const stat = inspect(workspace)
  if (stat && !stat.isDirectory()) throw new Error('Content workspace must be a directory.')
  return workspace
}

export function within(root, ...parts) {
  const result = resolve(root, ...parts)
  const path = relative(resolve(root), result)
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new Error('Path escapes the content directory.')
  return assertSafePath(result)
}

export function ensureDirectory(path) {
  assertSafePath(path)
  mkdirSync(path, { recursive: true, mode: 0o700 })
  assertSafePath(path, { allowMissing: false })
}

export function readSafeFile(path) {
  assertSafePath(path, { allowMissing: false })
  if (!lstatSync(path).isFile()) throw new Error(`Expected a regular file: ${path}`)
  return readFileSync(path)
}

export function assertIdenticalOrMissing(path, bytes) {
  assertSafePath(path)
  if (inspect(path) && !readSafeFile(path).equals(Buffer.from(bytes))) throw new Error(`Content collision; existing file differs: ${path}`)
}

export function writeImmutable(path, value) {
  const bytes = Buffer.from(value)
  assertIdenticalOrMissing(path, bytes)
  ensureDirectory(dirname(path))
  try { writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }) } catch (error) {
    if (error.code !== 'EEXIST') throw error
    assertIdenticalOrMissing(path, bytes)
  }
}

export function parseArguments(argv, allowed) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    if (!allowed.includes(flag) || result[flag] !== undefined || !argv[index + 1] || argv[index + 1].startsWith('--')) {
      throw new Error(`Expected ${allowed.join(' <path> ')} <path>; received invalid arguments.`)
    }
    result[flag] = argv[index + 1]
  }
  return result
}
