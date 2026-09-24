#!/usr/bin/env node
// Downloads the generated models listed in art/higgsfield-assets.json and shrinks them
// for the web: textures resized to 1024px WebP, unused data pruned.
// Usage: npm run assets:fetch [-- name ...]   (skips files that already exist; --force to redo)
// --optional: warn instead of failing when a download fails (used by the deploy build).
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const args = process.argv.slice(2);
const force = args.includes('--force');
const optional = args.includes('--optional');
const only = args.filter((a) => !a.startsWith('--'));
const manifest = JSON.parse(await fs.readFile('art/higgsfield-assets.json', 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const entry of manifest.models) {
  if (only.length && !only.includes(entry.name)) continue;
  const exists = await fs.stat(entry.out).then(() => true, () => false);
  if (exists && !force) {
    console.log(`skip  ${entry.name} (exists)`);
    continue;
  }
  let raw;
  try {
    const res = await fetch(entry.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    const msg = `${entry.name}: download failed (${err.cause?.message ?? err.message}) for ${entry.url}`;
    if (!optional) throw new Error(msg);
    console.warn(`warn  ${msg}`);
    continue;
  }
  const doc = await io.readBinary(raw);
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  );
  const out = await io.writeBinary(doc);
  await fs.mkdir(path.dirname(entry.out), { recursive: true });
  await fs.writeFile(entry.out, out);
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`saved ${entry.out}  ${kb(raw.length)} -> ${kb(out.length)}`);
}
