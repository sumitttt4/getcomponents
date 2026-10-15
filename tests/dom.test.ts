import test from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, catalogueFromRenderedPage } from '../src/lib/extractor';
import { discoverComponents, captureComponent } from '../src/lib/dom';
import { previewDocument, exportReact } from '../src/lib/export';
import { fixtureCatalogue } from '../src/fixtures/catalogue';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { Script } from 'node:vm';
import ts from 'typescript';

test('renderer finds repeats, strips active content, captures responsive changes and preserves observed CSS states', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport:{width:1280,height:900} });
    await page.setContent(`<style>button{padding:10px 20px;color:white;background:rgb(0,50,0);border:0;border-radius:6px}button:hover{background:rgb(0,100,0)}button:focus{outline:3px solid red}@media(max-width:640px){button{padding:5px 10px}}</style><nav aria-label="Primary"><button onclick="window.bad=true">First</button><button>Second</button></nav><article class="card"><img src="https://evil.invalid/a" onerror="window.bad=true"><script>window.injected=true</script><a href="javascript:alert(1)">Label</a><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0L10 10" onload="bad()"/></svg></article>`);
    const { candidates } = await page.evaluate(discoverComponents);
    const buttons = candidates.filter(c=>c.category==='Buttons');
    assert.equal(buttons.length,2); assert.equal(buttons[0].signature,buttons[1].signature);
    const button = await page.evaluate(captureComponent,buttons[0].index);
    assert.doesNotMatch(button.html,/onclick|script|href|onerror/);
    const card = candidates.find(c=>c.category==='Cards')!;
    const safeCard = await page.evaluate(captureComponent,card.index);
    assert.doesNotMatch(safeCard.html,/https:|javascript:|<script|onload|<img/);
    assert.ok(safeCard.notes.length);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:`[data-unpack-id="${buttons[0].index}"]`});
    await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover']});
    const hovered = await page.evaluate(captureComponent,buttons[0].index);
    assert.notEqual(button.css,hovered.css);
    assert.match(hovered.css,/rgb\(0, 100, 0\)/);
    await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
    await page.setViewportSize({width:390,height:800});
    const mobile = await page.evaluate(captureComponent,buttons[0].index);
    assert.ok(mobile.width<button.width);
    const context = await browser.newContext({javaScriptEnabled:false});
    const preview = await context.newPage();
    await preview.setContent(previewDocument({...safeCard,variant:'Style 1',viewport:'desktop',state:'default',pixelDifference:null}));
    assert.equal(await preview.locator('script').count(),0);
    await context.close();
  } finally { await browser.close(); }
});

test('downloaded React code runs outside the source page', async () => {
  for (const entry of fixtureCatalogue.components) {
    const js = ts.transpileModule(exportReact(entry),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
    const exportedModule = { exports:{} as { default?: React.ComponentType } };
    const require = (name:string) => { if (name==='react/jsx-runtime') return { jsx, jsxs }; throw new Error(`Unexpected import: ${name}`); };
    // Compiled first-party export code; untrusted page JavaScript never enters this VM.
    new Script(`(function(exports,require,module){${js}\n})`).runInNewContext()(exportedModule.exports,require,exportedModule);
    assert.ok(exportedModule.exports.default);
    const markup = renderToStaticMarkup(createElement(exportedModule.exports.default!));
    assert.match(markup,/unpack-sample/);
    assert.ok(markup.includes(entry.snapshots[0].html));
  }
});

test('complete capture pipeline produces real entries, mobile captures, CSS states and pixel comparisons', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    await page.setContent(`<title>Owned test page</title><style>body{background:white;font:14px Arial}button{font:14px Arial;background:#222;color:#fff;border:0;border-radius:5px;padding:10px 14px}button:hover{background:#444}button:focus-visible{outline:2px solid red}@media(max-width:640px){button{padding:6px 8px}}input{font:14px Arial;padding:8px}</style><button>One</button><button>Two</button><input placeholder="Email">`);
    const result = await catalogueFromRenderedPage(browser,page,'https://owned-test.example/',{requests:0,bytes:0,blocked:0});
    assert.equal(result.kind,'extraction');
    assert.equal(result.title,'Owned test page');
    assert.equal(result.components.length,2);
    const button = result.components.find(c=>c.category==='Buttons')!;
    assert.equal(button.instances,2);
    assert.ok(button.snapshots.some(s=>s.state==='hover'));
    assert.ok(button.snapshots.some(s=>s.state==='focus'));
    assert.ok(button.snapshots.some(s=>s.viewport==='mobile'));
    assert.ok(button.snapshots.some(s=>s.pixelDifference!==null));
    assert.ok(button.accessibility?.includes('button'));
    assert.ok(button.snapshots.every(s=>!s.html.includes('onclick')));
    assert.ok(result.warnings.length>0);
  } finally { await browser.close(); }
});
