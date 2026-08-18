import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

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
const serviceWorkerRuntime = evaluateServiceWorker(serviceWorkerSource)

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
    content: '#5b789f',
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
  typeof manifest.name === 'string' && manifest.name.includes('CardIO'),
  'manifest name must include "CardIO"',
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

assert(typeof serviceWorkerRuntime.listeners.fetch === 'function', 'dist/sw.js must register a fetch listener')
assert(
  serviceWorkerRuntime.listeners.sync === undefined,
  'dist/sw.js must not register a sync event listener',
)

await assertFetchHandled(serviceWorkerRuntime, {
  url: `${serviceWorkerRuntime.origin}/assets/app.js`,
  method: 'GET',
  destination: 'script',
  mode: 'same-origin',
})
await assertFetchBypassed(serviceWorkerRuntime, {
  url: `${serviceWorkerRuntime.origin}/api/cards`,
  method: 'GET',
  destination: '',
  mode: 'same-origin',
}, 'dist/sw.js must bypass same-origin /api/ GET requests')
await assertFetchBypassed(serviceWorkerRuntime, {
  url: `${serviceWorkerRuntime.origin}/cards`,
  method: 'POST',
  destination: '',
  mode: 'same-origin',
}, 'dist/sw.js must bypass same-origin POST requests')
await assertFetchBypassed(serviceWorkerRuntime, {
  url: 'https://cdn.example.com/app.js',
  method: 'GET',
  destination: 'script',
  mode: 'cors',
}, 'dist/sw.js must bypass external-origin GET requests')

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function evaluateServiceWorker(source) {
  const listeners = {}
  const runtime = {
    origin: 'https://card-ledger.test',
    fetchCalls: [],
    cachePuts: [],
  }

  class FakeResponse {
    constructor(body = '', init = {}) {
      this.body = body
      this.status = init.status ?? 200
      this.ok = this.status >= 200 && this.status < 300
    }

    clone() {
      return new FakeResponse(this.body, { status: this.status })
    }

    static error() {
      return new FakeResponse('', { status: 500 })
    }
  }

  const cache = {
    async addAll() {},
    async match() {
      return undefined
    },
    async put(request, response) {
      runtime.cachePuts.push({ request, response })
    },
  }

  const sandbox = {
    URL,
    Promise,
    Set,
    Response: FakeResponse,
    caches: {
      async open() {
        return cache
      },
      async keys() {
        return []
      },
      async delete() {
        return true
      },
    },
    fetch: async (request) => {
      runtime.fetchCalls.push(request)
      return new FakeResponse('ok')
    },
    self: {
      location: { origin: runtime.origin },
      clients: {
        claim() {},
      },
      skipWaiting() {},
      addEventListener(type, listener) {
        listeners[type] = listener
      },
    },
  }

  vm.runInNewContext(source, sandbox, {
    filename: serviceWorkerPath,
  })

  return {
    ...runtime,
    listeners,
    Response: FakeResponse,
  }
}

async function assertFetchHandled(runtime, request) {
  const outcome = await dispatchFetch(runtime, request)

  assert(outcome.responded, 'dist/sw.js must handle same-origin GET static requests')
  assert(outcome.response instanceof runtime.Response, 'dist/sw.js must resolve handled static requests')
  assert(outcome.response.ok, 'dist/sw.js must return a successful response for handled static requests')
  assert(runtime.fetchCalls.length === outcome.fetchCallsBefore + 1, 'dist/sw.js must fetch handled static assets')
  assert(runtime.cachePuts.length === outcome.cachePutsBefore + 1, 'dist/sw.js must cache handled static assets')
}

async function assertFetchBypassed(runtime, request, message) {
  const outcome = await dispatchFetch(runtime, request)

  assert(!outcome.responded, message)
  assert(runtime.fetchCalls.length === outcome.fetchCallsBefore, message)
  assert(runtime.cachePuts.length === outcome.cachePutsBefore, message)
}

async function dispatchFetch(runtime, request) {
  const fetchListener = runtime.listeners.fetch
  const fetchCallsBefore = runtime.fetchCalls.length
  const cachePutsBefore = runtime.cachePuts.length
  let responsePromise = null

  fetchListener({
    request,
    respondWith(promise) {
      responsePromise = Promise.resolve(promise)
    },
  })

  const response = responsePromise ? await responsePromise : null

  return {
    cachePutsBefore,
    fetchCallsBefore,
    responded: responsePromise !== null,
    response,
  }
}
