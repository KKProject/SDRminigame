import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const indexPath = resolve(root, 'dist/index.html')
const html = await readFile(indexPath, 'utf8')

if (!html.includes('<div id="app"></div>')) throw new Error('ADMIN_DIST_APP_ROOT_MISSING')
if (!html.includes('/admin/assets/')) throw new Error('ADMIN_DIST_BASE_PATH_INVALID')
if (/INITIAL_ADMIN_PASSWORD|huapai-admin-session.+localStorage/i.test(html)) {
  throw new Error('ADMIN_DIST_SENSITIVE_CONFIGURATION_FOUND')
}

const assetPaths = Array.from(html.matchAll(/(?:src|href)="(\/admin\/assets\/[^"]+)"/g), (match) => match[1])
if (!assetPaths.length) throw new Error('ADMIN_DIST_ASSETS_MISSING')

await Promise.all(assetPaths.map((assetPath) => access(resolve(root, 'dist', assetPath.replace('/admin/', '')))))
