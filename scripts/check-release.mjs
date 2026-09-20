import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
for (const browser of ['chrome', 'firefox']) {
  const root = `.output/${browser}-mv3`;
  const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['https://x.com/*', 'https://api.typesafe.ai/*']);
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'none'");
  assert.deepEqual(manifest.content_scripts.flatMap(script => script.matches), ['https://x.com/*']);
  for (const size of [16, 32, 48, 128]) {
    const png = await readFile(`${root}/${manifest.icons[size]}`);
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  await access(`${root}/privacy.html`);
  await access(`.output/${pkg.name}-${pkg.version}-${browser}.zip`);
}
await access(`.output/${pkg.name}-${pkg.version}-sources.zip`);
console.log(`Release ${pkg.version}: manifests, icons, privacy pages, and archives checked.`);
