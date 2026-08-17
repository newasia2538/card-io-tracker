import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')
const distDirectory = path.join(projectRoot, 'dist')
const indexHtmlPath = path.join(distDirectory, 'index.html')
const manifestPath = path.join(distDirectory, 'manifest.webmanifest')
const serviceWorkerPath = path.join(distDirectory, 'sw.js')

await assertFileExists(indexHtmlPath)
await assertFileExists(manifestPath)
await assertFileExists(serviceWorkerPath)

const indexHtml = await readFile(indexHtmlPath, 'utf8')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const serviceWorkerSource = await readFile(serviceWorkerPath, 'utf8')

assert(
  hasTagWithAttributes(indexHtml, 'link', {
    rel: 'manifest',
    href: '/manifest.webmanifest',
  }),
  'dist/index.html must link to /manifest.webmanifest',
)
assert(
  hasTagWithAttributes(indexHtml, 'meta', {
    name: 'theme-color',
    content: '#0f766e',
  }),
  'dist/index.html must declare theme-color="#0f766e"',
)
assert(
  hasTagWithAttributes(indexHtml, 'link', {
    rel: 'icon',
    href: '/icon.svg',
    type: 'image/svg+xml',
  }),
  'dist/index.html must expose the SVG icon metadata',
)

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

for (const [index, icon] of manifest.icons.entries()) {
  assert(icon && typeof icon === 'object', `manifest icon ${index} must be an object`)
  assert(typeof icon.src === 'string' && icon.src.length > 0, `manifest icon ${index} must declare src`)
  assert(typeof icon.sizes === 'string' && icon.sizes.length > 0, `manifest icon ${index} must declare sizes`)
  assert(typeof icon.type === 'string' && icon.type.length > 0, `manifest icon ${index} must declare type`)

  const iconPath = resolveLocalAssetPath(icon.src)
  assert(
    iconPath !== null,
    `manifest icon ${index} must reference a local asset under dist`,
  )
  await assertFileExists(iconPath)
}

assert(
  serviceWorkerSource.includes("request.method !== 'GET'"),
  'dist/sw.js must gate handling on GET requests',
)
assert(
  serviceWorkerSource.includes("url.origin !== self.location.origin"),
  'dist/sw.js must bypass external origins',
)
assert(
  serviceWorkerSource.includes("url.pathname.startsWith('/api/')"),
  'dist/sw.js must bypass /api/ requests explicitly',
)
assert(
  serviceWorkerSource.includes("request.mode === 'navigate'"),
  'dist/sw.js must preserve navigate handling',
)
assert(
  serviceWorkerSource.includes("STATIC_DESTINATIONS.has(request.destination)"),
  'dist/sw.js must preserve static destination handling',
)
assert(
  serviceWorkerSource.includes('isStaticAssetPath(url.pathname)'),
  'dist/sw.js must preserve static asset path handling',
)
assert(
  !/\bqueue\b/i.test(serviceWorkerSource),
  'dist/sw.js must not include queue-based API behavior',
)
assert(
  !/\bperiodicSync\b|\bbackgroundSync\b|\bsync\b/i.test(serviceWorkerSource),
  'dist/sw.js must not include background sync API behavior',
)
assert(
  countSubstring(serviceWorkerSource, '/api/') === 1,
  'dist/sw.js must only mention /api/ in the bypass guard',
)

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

function resolveLocalAssetPath(assetPath) {
  if (typeof assetPath !== 'string' || assetPath.length === 0) {
    return null
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(assetPath)) {
    return null
  }

  const pathname = assetPath.startsWith('/')
    ? assetPath
    : `/${assetPath}`

  if (!pathname.startsWith('/')) {
    return null
  }

  const relativePath = pathname.replace(/^\//, '')
  const resolvedPath = path.resolve(distDirectory, relativePath)

  if (!resolvedPath.startsWith(distDirectory + path.sep) && resolvedPath !== distDirectory) {
    return null
  }

  return resolvedPath
}

function hasTagWithAttributes(html, tagName, attributes) {
  const attributeChecks = Object.entries(attributes).map(([name, value]) => (
    `(?=[^>]*\\b${escapeRegExp(name)}=["']${escapeRegExp(value)}["'])`
  ))

  const pattern = new RegExp(
    `<${escapeRegExp(tagName)}\\b${attributeChecks.join('')}[^>]*>`,
    'i',
  )

  return pattern.test(html)
}

function countSubstring(text, needle) {
  return (text.match(new RegExp(escapeRegExp(needle), 'g')) || []).length
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
