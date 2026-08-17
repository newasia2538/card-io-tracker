import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')
const distDirectory = path.join(projectRoot, 'dist')
const manifestPath = path.join(distDirectory, 'manifest.webmanifest')
const serviceWorkerPath = path.join(distDirectory, 'sw.js')

await assertFileExists(manifestPath)
await assertFileExists(serviceWorkerPath)

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

assert(manifest.display === 'standalone', 'manifest display must be "standalone"')
assert(manifest.start_url === '/', 'manifest start_url must be "/"')
assert(
  typeof manifest.name === 'string' && manifest.name.includes('Card Ledger'),
  'manifest name must include "Card Ledger"',
)

const brandingText = [
  manifest.name,
  manifest.short_name,
  manifest.description,
]
  .filter((value) => typeof value === 'string')
  .join(' ')

assert(brandingText.includes('THB'), 'manifest branding must mention THB')
assert(brandingText.includes('USD'), 'manifest branding must mention USD')

assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must include at least one icon')

const hasSvgIcon = manifest.icons.some((icon) => (
  icon &&
  typeof icon.src === 'string' &&
  icon.src.endsWith('.svg') &&
  icon.type === 'image/svg+xml' &&
  typeof icon.sizes === 'string' &&
  icon.sizes.length > 0
))

assert(hasSvgIcon, 'manifest must include a valid SVG icon entry')

console.log('PWA checks passed.')

async function assertFileExists(targetPath) {
  try {
    const fileStats = await stat(targetPath)
    assert(fileStats.isFile(), `${path.relative(projectRoot, targetPath)} must be a file`)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Missing required file: ${path.relative(projectRoot, targetPath)}`)
    }

    throw error
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
