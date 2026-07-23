import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import {
  constants as zlibConstants,
  deflateSync,
  inflateSync,
} from 'node:zlib';
import { PNG } from 'pngjs';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const imagesDir = join(root, 'images');
const reportPath = join(root, 'docs', 'image-optimization-report.json');
const checkOnly = process.argv.includes('--check');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePng(buffer) {
  if (!buffer.subarray(0, signature.length).equals(signature)) {
    throw new Error('PNG signature 无效');
  }

  const chunks = [];
  let offset = signature.length;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > buffer.length) throw new Error(`${type} chunk 越界`);
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = chunkEnd;
    if (type === 'IEND') break;
  }

  const ihdr = chunks.find(({ type }) => type === 'IHDR')?.data;
  if (!ihdr || ihdr.length !== 13) throw new Error('缺少有效 IHDR');
  return {
    chunks,
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colorType: ihdr[9],
    hasAlpha: ihdr[9] === 4 || ihdr[9] === 6 || chunks.some(({ type }) => type === 'tRNS'),
    animated: chunks.some(({ type }) => type === 'acTL'),
  };
}

function encodeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.allocUnsafe(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return output;
}

function recompressPng(buffer) {
  const parsed = parsePng(buffer);
  if (parsed.animated) return { buffer, reason: 'animated-png-skipped' };

  const idat = Buffer.concat(
    parsed.chunks.filter(({ type }) => type === 'IDAT').map(({ data }) => data),
  );
  if (!idat.length) throw new Error('缺少 IDAT');
  const scanlines = inflateSync(idat);
  const strategies = [
    zlibConstants.Z_DEFAULT_STRATEGY,
    zlibConstants.Z_FILTERED,
    zlibConstants.Z_RLE,
    zlibConstants.Z_HUFFMAN_ONLY,
  ];
  const candidates = strategies.map((strategy) => deflateSync(scanlines, {
    level: 9,
    strategy,
  }));
  const compressed = candidates.reduce((best, candidate) => (
    candidate.length < best.length ? candidate : best
  ));

  const outputChunks = [];
  let wroteIdat = false;
  for (const chunk of parsed.chunks) {
    if (chunk.type === 'IDAT') {
      if (!wroteIdat) {
        outputChunks.push(encodeChunk('IDAT', compressed));
        wroteIdat = true;
      }
      continue;
    }
    outputChunks.push(encodeChunk(chunk.type, chunk.data));
  }
  return { buffer: Buffer.concat([signature, ...outputChunks]), reason: 'recompressed' };
}

function decodePng(buffer) {
  const parsed = parsePng(buffer);
  const decoded = PNG.sync.read(buffer);
  return {
    width: decoded.width,
    height: decoded.height,
    hasAlpha: parsed.hasAlpha,
    rgbaHash: createHash('sha256').update(decoded.data).digest('hex'),
  };
}

function validateEquivalent(before, after) {
  const fields = ['width', 'height', 'hasAlpha', 'rgbaHash'];
  const mismatch = fields.find((field) => before[field] !== after[field]);
  if (mismatch) throw new Error(`${mismatch} 在优化后发生变化`);
}

function atlasSize(metadata) {
  const size = metadata.meta?.size ?? metadata.size ?? metadata.atlas?.size;
  if (!size) return null;
  const width = Number(size.w ?? size.width);
  const height = Number(size.h ?? size.height);
  return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
}

async function verifyAtlases(imageInfo) {
  const pairs = [
    ['element.png', 'element.atlas.json'],
    ['actions.png', 'action_buttons_named_atlas.json'],
  ];
  const results = [];
  for (const [imageName, jsonName] of pairs) {
    const metadata = JSON.parse(await readFile(join(imagesDir, jsonName), 'utf8'));
    const expected = atlasSize(metadata);
    const actual = imageInfo.get(imageName);
    if (expected && (expected.width !== actual.width || expected.height !== actual.height)) {
      throw new Error(`${jsonName} 声明 ${expected.width}x${expected.height}，实际 ${actual.width}x${actual.height}`);
    }
    results.push({ image: imageName, metadata: jsonName, expected, actual: {
      width: actual.width,
      height: actual.height,
    } });
  }
  return results;
}

async function main() {
  const names = (await readdir(imagesDir))
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .sort();
  const tempDir = checkOnly ? null : await mkdtemp(join(tmpdir(), 'huapai-png-'));
  const files = [];
  const imageInfo = new Map();

  try {
    for (const name of names) {
      const sourcePath = join(imagesDir, name);
      const source = await readFile(sourcePath);
      const before = decodePng(source);
      imageInfo.set(name, before);
      if (!before.hasAlpha) throw new Error(`${name} 缺少 alpha 能力`);

      let output = source;
      let status = 'checked';
      let reason = 'check-only';
      if (!checkOnly) {
        const optimized = recompressPng(source);
        output = optimized.buffer;
        const after = decodePng(output);
        validateEquivalent(before, after);
        if (output.length < source.length) {
          const tempPath = join(tempDir, name);
          await writeFile(tempPath, output);
          await rename(tempPath, sourcePath);
          status = 'optimized';
          reason = optimized.reason;
        } else {
          output = source;
          status = 'unchanged';
          reason = optimized.reason === 'animated-png-skipped' ? optimized.reason : 'no-smaller-output';
        }
      }

      files.push({
        file: relative(root, sourcePath),
        width: before.width,
        height: before.height,
        hasAlpha: before.hasAlpha,
        rgbaSha256: before.rgbaHash,
        beforeBytes: source.length,
        afterBytes: output.length,
        savedBytes: source.length - output.length,
        status,
        reason,
      });
    }

    const atlases = await verifyAtlases(imageInfo);
    const beforeBytes = files.reduce((sum, file) => sum + file.beforeBytes, 0);
    const afterBytes = files.reduce((sum, file) => sum + file.afterBytes, 0);
    const report = {
      generatedAt: new Date().toISOString(),
      mode: checkOnly ? 'check' : 'optimize',
      files,
      atlases,
      totals: {
        fileCount: files.length,
        optimizedCount: files.filter(({ status }) => status === 'optimized').length,
        beforeBytes,
        afterBytes,
        savedBytes: beforeBytes - afterBytes,
        savedPercent: Number((((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(2)),
      },
    };

    if (!checkOnly) {
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    for (const file of files) {
      console.log(`${file.status.padEnd(9)} ${file.file.padEnd(42)} ${file.beforeBytes} -> ${file.afterBytes} (${file.savedBytes})`);
    }
    console.log(`PNG 检查通过：${files.length} 个文件，alpha 全部保留，节省 ${report.totals.savedBytes} bytes (${report.totals.savedPercent}%)`);
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`图片优化失败：${error.message}`);
  process.exitCode = 1;
});
