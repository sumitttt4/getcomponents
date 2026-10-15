import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const project=process.cwd();
const config=JSON.parse(await fs.readFile(path.join(project,'vercel.json'),'utf8'));
const pkg=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8'));
assert.equal(config.framework,'nextjs');assert.equal(config.fluid,true);assert.equal(pkg.engines.node,'24.x');
assert.ok(pkg.dependencies['@sparticuz/chromium']);assert.ok(pkg.dependencies['playwright-core']);
assert.ok(!pkg.dependencies.playwright,'Full Playwright should stay in development dependencies.');
const filename=path.join(project,'.next/server/app/api/extract/route.js.nft.json');
const trace=JSON.parse(await fs.readFile(filename,'utf8'));
const included=trace.files.map(file=>path.resolve(path.dirname(filename),file));
for(const asset of ['chromium.br','fonts.tar.br','swiftshader.tar.br','al2023.tar.br'])assert.ok(included.some(file=>file.endsWith('/@sparticuz/chromium/bin/'+asset)),`Missing runtime asset: ${asset}`);
const unique=new Set();let bytes=0;
for(const file of included){const resolved=await fs.realpath(file);if(unique.has(resolved))continue;unique.add(resolved);bytes+=(await fs.stat(resolved)).size;}
assert.ok(bytes<250*1024*1024,`Traced files exceed the standard function size limit: ${bytes}`);
const route=await fs.readFile(path.join(project,'src/app/api/extract/route.ts'),'utf8');
assert.match(route,/maxDuration\s*=\s*120/);assert.match(route,/ReadableStream/);
assert.doesNotMatch(route,/node:fs|after\(|createJob/,'Extraction must not depend on local job persistence.');
console.log(`Vercel preflight passed: Node 24, Fluid compute, 120s streaming route, bundled Chromium assets, ${(bytes/1024/1024).toFixed(1)} MiB traced files.`);
console.log('This verifies local build/package readiness. A live Vercel deployment and public-URL smoke test are still required.');
