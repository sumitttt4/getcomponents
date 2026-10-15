import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicUrl, isPublicAddress, fetchPublic } from '../src/lib/network';
import { exportHtml, exportReact, escapeHtml } from '../src/lib/export';
import { fixtureCatalogue } from '../src/fixtures/catalogue';
import { pixelDifference } from '../src/lib/extractor';
import { PNG } from 'pngjs';
import ts from 'typescript';

test('URL validator blocks local, private, metadata, encoded and credential targets', () => {
  for (const url of ['file:///etc/passwd','data:text/html,x','ftp://example.com','http://localhost','http://a.localhost','http://foo.internal','http://127.0.0.1','http://2130706433','http://0x7f000001','http://0177.0.0.1','http://10.0.0.1','http://172.16.0.1','http://192.168.0.1','http://169.254.169.254/latest/meta-data','http://0.0.0.0','http://[::1]','http://[::ffff:127.0.0.1]','https://user:pass@example.com','https://example.com:8443','javascript:alert(1)']) {
    assert.throws(() => parsePublicUrl(url),Error,url);
  }
  assert.equal(parsePublicUrl('https://example.com/a#fragment').href,'https://example.com/a');
});
test('IP classifier blocks all non-unicast ranges for IPv4 and IPv6', () => {
  for (const address of ['127.0.0.1','192.168.1.1','169.254.169.254','100.64.0.1','224.0.0.1','240.0.0.1','0.0.0.0','::1','fe80::1','fc00::1','ff02::1','::ffff:10.0.0.1','2001:db8::1']) assert.equal(isPublicAddress(address),false,address);
  assert.equal(isPublicAddress('1.1.1.1'),true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
});
test('network fetch rejects private destinations before making a request', async () => {
  await assert.rejects(fetchPublic('http://169.254.169.254/',{ requests:0,bytes:0,blocked:0 }),/blocked/);
  await assert.rejects(fetchPublic('https://example.com/',{ requests:160,bytes:0,blocked:0 }),/request limit/);
});
test('preview export has an inert CSP and does not give a fixture source privileges', () => {
  const html = exportHtml(fixtureCatalogue.components[0]);
  assert.match(html,/default-src 'none'/);
  assert.match(html,/form-action 'none'/);
  assert.doesNotMatch(html,/<script|https:\/\//);
  assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
});
test('every sample React export compiles standalone and scopes its CSS', () => {
  for (const entry of fixtureCatalogue.components) {
    for (const variant of new Set(entry.snapshots.map(s=>s.variant))) {
      const code = exportReact(entry,entry.snapshots.find(s=>s.variant===variant));
      const output = ts.transpileModule(code,{ compilerOptions:{ jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2022 }, reportDiagnostics:true, fileName:'Component.tsx' });
      assert.equal(output.diagnostics?.length,0);
      assert.match(code,/\.unpack-sample-/);
      if (variant==='Style 1' && entry.id==='sample-button') assert.doesNotMatch(code,/border:1px solid #d4d9d1/,'one style must not silently override another');
    }
  }
});
test('pixel difference measures change and declines mismatched dimensions', () => {
  const a = new PNG({width:2,height:2}); a.data.fill(255);
  const b = new PNG({width:2,height:2}); b.data.fill(255); b.data[0]=0;
  assert.equal(pixelDifference(PNG.sync.write(a),PNG.sync.write(a)),0);
  assert.equal(pixelDifference(PNG.sync.write(a),PNG.sync.write(b)),25);
  assert.equal(pixelDifference(PNG.sync.write(a),PNG.sync.write(new PNG({width:3,height:2}))),null);
});
