import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, '.tmp-socket-deploy');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await cp(join(root, 'services/socket/package.json'), join(outDir, 'package.json'));
await cp(join(root, 'services/socket/Dockerfile'), join(outDir, 'Dockerfile'));
await cp(join(root, 'services/socket/src'), join(outDir, 'src'), { recursive: true });
await writeFile(join(outDir, '.dockerignore'), [
  '.DS_Store',
  'node_modules',
  'npm-debug.log',
  '',
].join('\n'));

console.log(`socket deploy package prepared: ${outDir}`);
