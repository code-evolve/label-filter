/**
 * A zero-dependency static server for the sandbox.
 *
 * **Why a server at all for two static files.** The sandbox imports the package as an ES module, and
 * a browser refuses a module import over `file://`. Serving is the only way the playground can
 * exercise THE PACKAGE rather than a copy pasted into a script tag — and a sandbox that tests a copy
 * is worse than none, because it agrees with itself.
 *
 * **It serves `dist/`, not `src/`, since the source became TypeScript on 2026-09-23** — a browser
 * cannot run that. The sandbox now exercises exactly what a consumer installs, which is a stronger
 * claim than before, at the cost of needing `npm run build` first. It says so on startup rather than
 * serving a 404 that reads like a bug in the page.
 *
 *   npm run sandbox            then open the URL it prints
 *   PORT=4321 npm run sandbox  to choose the port
 *   BIND=100.x.y.z npm run sandbox   reach it from another device
 *
 * **`BIND` defaults to loopback and that default is the safe one.** This server has no
 * authentication and no authorisation — it serves the package's own files to whoever asks. Bind it
 * to a specific interface you trust (a tailnet address), never to `0.0.0.0`, which also publishes it
 * on whatever coffee-shop network the laptop later joins. The server says out loud which it did.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

// Only these two directories are reachable. The package root holds nothing secret today, but a
// sandbox that serves its own parent is a habit that becomes a defect the moment someone drops a
// key beside it.
const ALLOWED = ['sandbox/', 'dist/', 'docs/']

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // **A malformed path must not take the server down.** `new URL('//', base)` throws, and a stray
  // request — a probe, a typo, a link with a doubled slash — used to end the whole dev server with an
  // unhandled ERR_INVALID_URL. Found by a smoke test that asked for `//` by accident, 2026-09-23.
  let url: URL
  try {
    url = new URL(req.url as string, 'http://localhost')
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end(`not a path this server can read: ${req.url}\n`)
    return
  }

  // One line per request, with the peer address. **This is a diagnostic, not a log:** when the page
  // does not load from another device, the question is whether the request ARRIVED at all, and
  // nothing else on the machine can answer it. Silence here means it was stopped before node saw
  // it — a firewall, the tailnet, the wrong address — and a line here rules all of that out.
  console.log(`${new Date().toISOString().slice(11, 19)}  ${req.socket.remoteAddress}  ${req.method} ${url.pathname}`)
  const rel = normalize(url.pathname === '/' ? 'sandbox/index.html' : url.pathname.slice(1))

  if (rel.startsWith('..') || !ALLOWED.some((p) => rel.startsWith(p))) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end(`not served: ${rel}\nthe sandbox serves ${ALLOWED.join(', ')} only`)
    return
  }

  try {
    const body = await readFile(join(root, rel))
    res.writeHead(200, {
      'content-type': TYPES[extname(rel)] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    const err = e as NodeJS.ErrnoException
    res.end(`${rel}: ${err.code || err.message}`)
  }
})

const port = Number(process.env.PORT || 4177)
const bind = process.env.BIND || '127.0.0.1'

server.listen(port, bind, () => {
  console.log(`label-filter sandbox  →  http://${bind}:${port}/`)
  if (existsSync(join(root, 'dist/index.js'))) {
    console.log('serving the built dist/index.js — what you try here is what the package ships')
  } else {
    console.log('NOTE: dist/index.js is missing — run `npm run build` first, or the page will not load')
  }
  if (bind === '0.0.0.0') {
    console.log('WARNING: bound to every interface, with no password. Bind one address instead.')
  } else if (bind !== '127.0.0.1') {
    console.log(`reachable from any device that can route to ${bind} — there is no password`)
  }
})
