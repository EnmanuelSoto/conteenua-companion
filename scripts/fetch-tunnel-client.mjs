/**
 * Bundle the pinned tunnel-client release for one explicit packaging target.
 *
 * The release is pinned by version + SHA-256 in packaging-versions.mjs. Packaging stages
 * platform/arch-specific resources under resources/packaging; a host-target invocation also
 * mirrors the same verified files to resources/tunnel for development runs.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOUDFLARED, TUNNEL_CLIENT } from './packaging-versions.mjs';
import { parseTarget, PLATFORM_INFO, tarExecutableForPlatform } from './packaging-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingRoot = path.join(root, 'resources', 'packaging', 'tunnel');
const devOutDir = path.join(root, 'resources', 'tunnel');
const cacheDir = path.join(root, 'node_modules', '.cache', 'tunnel-client');
const say = (message) => process.stdout.write(`${message}\n`);

async function download(url, target) {
  if (existsSync(target)) return;
  const res = await fetch(url, { headers: { 'user-agent': 'conteenua-companion-build' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
}

function extractZip(zipPath, outDir) {
  if (process.platform === 'win32') {
    execFileSync('tar.exe', ['-xf', zipPath, '-C', outDir], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', outDir], { stdio: 'inherit' });
  }
}

async function verifySha256(file, expected, label) {
  const actual = createHash('sha256').update(await readFile(file)).digest('hex');
  if (actual !== expected) {
    await rm(file, { force: true });
    throw new Error(`Checksum mismatch for ${label}\n  expected ${expected}\n  got      ${actual}`);
  }
  return actual;
}

async function stagePinnedCloudflared(platform, arch, outDir, suffix) {
  const target = CLOUDFLARED.targets[platform]?.[arch];
  if (!target) throw new Error(`No cloudflared pin for ${platform}-${arch}`);
  const assetName = target.asset;
  const cachePath = path.join(cacheDir, `${CLOUDFLARED.version}-${assetName}`);
  const url = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED.version}/${assetName}`;
  await download(url, cachePath);
  const actual = await verifySha256(cachePath, target.sha256, assetName);
  say(`cloudflared ${CLOUDFLARED.version} ${platform}-${arch} checksum ok (${actual.slice(0, 16)}...)`);

  const destination = path.join(outDir, `cloudflared${suffix}`);
  if (assetName.endsWith('.tgz')) {
    const extracted = path.join(cacheDir, `cloudflared-${CLOUDFLARED.version}-${platform}-${arch}`);
    await rm(extracted, { recursive: true, force: true });
    await mkdir(extracted, { recursive: true });
    execFileSync(tarExecutableForPlatform(process.platform), ['-xzf', cachePath, '-C', extracted], { stdio: 'inherit' });
    const candidates = (await readdir(extracted, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().startsWith('cloudflared'));
    if (candidates.length !== 1) throw new Error(`${assetName} did not contain exactly one cloudflared executable`);
    await cp(path.join(extracted, candidates[0].name), destination);
    await rm(extracted, { recursive: true, force: true });
  } else {
    await cp(cachePath, destination);
  }
  if (platform !== 'win32') await chmod(destination, 0o755);
  return destination;
}

async function flattenSingleDirectory(outDir) {
  const entries = await readdir(outDir, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isDirectory()) return;
  const inner = path.join(outDir, entries[0].name);
  for (const name of await readdir(inner)) await rename(path.join(inner, name), path.join(outDir, name));
  await rm(inner, { recursive: true, force: true });
}

async function main() {
  const { platform, arch } = parseTarget();
  const target = TUNNEL_CLIENT.targets[platform]?.[arch];
  if (!target) throw new Error(`No tunnel-client pin for ${platform}-${arch}`);

  const tag = TUNNEL_CLIENT.version;
  const upstreamOs = PLATFORM_INFO[platform].upstreamOs;
  const assetName = `tunnel-client-${tag}-${upstreamOs}-${target.upstreamArch}.zip`;
  const outDir = path.join(stagingRoot, platform, arch);
  const stamp = path.join(outDir, 'VERSION');

  await mkdir(cacheDir, { recursive: true });
  const zipPath = path.join(cacheDir, assetName);
  const url = `https://github.com/openai/tunnel-client/releases/download/${tag}/${assetName}`;
  await download(url, zipPath);

  const actual = await verifySha256(zipPath, target.sha256, assetName);
  say(`tunnel-client ${tag} ${platform}-${arch} checksum ok (${actual.slice(0, 16)}...)`);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  extractZip(zipPath, outDir);
  await flattenSingleDirectory(outDir);

  const suffix = PLATFORM_INFO[platform].executableSuffix;
  const tunnelExecutable = path.join(outDir, `tunnel-client${suffix}`);
  if (!existsSync(tunnelExecutable)) throw new Error(`${path.basename(tunnelExecutable)} was not in ${assetName}`);
  const cloudflaredExecutable = await stagePinnedCloudflared(platform, arch, outDir, suffix);
  if (platform !== 'win32') {
    await chmod(tunnelExecutable, 0o755);
  }
  await writeFile(stamp, `${tag}\n`, 'utf8');
  say(`tunnel-client ${tag} ${platform}-${arch} staged`);

  if (platform === process.platform && arch === process.arch) {
    await rm(devOutDir, { recursive: true, force: true });
    await cp(outDir, devOutDir, { recursive: true });
    say(`resources/tunnel mirrors ${platform}-${arch} for development`);
  }
}

main().catch((err) => {
  process.stderr.write(`\nCould not bundle tunnel-client: ${err.message}\n`);
  process.exit(1);
});
