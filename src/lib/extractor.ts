import { chromium, type Browser, type BrowserContext, type Page, type CDPSession } from 'playwright';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { discoverComponents, captureComponent } from './dom';
import { fetchPublic, parsePublicUrl, type NetworkBudget } from './network';
import { previewDocument } from './export';
import type { Catalogue, Category, ComponentEntry, Snapshot } from './types';

export function pixelDifference(source: Buffer, rendered: Buffer): number | null {
  const a = PNG.sync.read(source), b = PNG.sync.read(rendered);
  if (a.width !== b.width || a.height !== b.height) return null;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i+1] - b.data[i+1]), Math.abs(a.data[i+2] - b.data[i+2]), Math.abs(a.data[i+3] - b.data[i+3])) > 20) changed++;
  }
  return Math.round(changed / (a.width * a.height) * 1000) / 10;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true, executablePath: process.env.UNPACK_CHROMIUM_EXECUTABLE || undefined, chromiumSandbox: process.getuid?.() !== 0,
    args: ['--disable-background-networking','--disable-component-update','--disable-extensions','--disable-sync','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-features=WebRtcHideLocalIpsWithMdns','--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
  });
}

export async function secureContext(browser: Browser) {
  const budget: NetworkBudget = { requests: 0, bytes: 0, blocked: 0 };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: false,
    serviceWorkers: 'block', permissions: [], javaScriptEnabled: true, locale: 'en-US', colorScheme: 'light',
  });
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.method() !== 'GET' || ['media','websocket','eventsource','manifest'].includes(request.resourceType()) || request.isNavigationRequest() && request.frame().parentFrame()) {
      budget.blocked++; await route.abort().catch(() => {}); return;
    }
    try {
      let hops = 0; for (let prev = request.redirectedFrom(); prev; prev = prev.redirectedFrom()) hops++;
      if (hops > 5) throw new Error('Too many redirects.');
      const response = await fetchPublic(request.url(), budget);
      await route.fulfill(response);
    } catch {
      budget.blocked++; await route.abort('blockedbyclient').catch(() => {});
    }
  });
  await context.routeWebSocket('**/*', ws => ws.close());
  context.on('page', page => {
    page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
    page.on('download', download => download.cancel().catch(() => {}));
    page.on('popup', popup => popup.close().catch(() => {}));
  });
  return { context, budget };
}

const sessions = new WeakMap<Page, CDPSession>();
async function forceState(page: Page, selector: string, state: 'hover' | 'focus' | 'default') {
  let session = sessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    await session.send('DOM.enable'); await session.send('CSS.enable');
    sessions.set(page, session);
  }
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error('Component no longer reachable.');
    await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state === 'default' ? [] : state === 'focus' ? ['focus','focus-visible','focus-within'] : ['hover'] });
}

async function measureSnapshot(context: BrowserContext, snapshot: Snapshot, source: Buffer): Promise<number | null> {
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: Math.max(1, snapshot.width + 48), height: Math.max(1, snapshot.height + 48) });
    await page.setContent(previewDocument(snapshot), { waitUntil: 'domcontentloaded', timeout: 3000 });
    const target = page.locator('body > :first-child');
    const rendered = await target.screenshot({ timeout: 3000 });
    return pixelDifference(source, rendered);
  } catch { return null; } finally { await page.close(); }
}

export async function extractCatalogue(input: string, progress: (stage: string, percent: number) => void = () => {}, signal?: AbortSignal): Promise<Catalogue> {
  const started = Date.now();
  const url = parsePublicUrl(input).toString();
  progress('Opening an isolated browser', 5);
  let browser: Browser | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => { void browser?.close(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    browser = await launchBrowser();
    timer = setTimeout(() => { void browser?.close(); }, 90000);
    const { context, budget } = await secureContext(browser);
    const page = await context.newPage();
    progress('Rendering the desktop page', 12);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (!response || response.status() >= 400) throw new Error(`The website returned ${response?.status() ?? 'no response'}. It may block automated access.`);
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    // Scroll once to give lazy content a chance to mount, without crawling other pages.
    await page.evaluate(async () => { window.scrollTo(0, Math.min(document.body.scrollHeight, 1800)); await new Promise(r => setTimeout(r, 300)); window.scrollTo(0,0); });
    return await catalogueFromRenderedPage(browser, page, url, budget, progress, signal, started);
  } catch (error) {
    if (signal?.aborted) throw new Error('Extraction cancelled.');
    if (Date.now() - started >= 89000) throw new Error('The extraction exceeded its 90-second time limit. Try a smaller page.');
    throw error;
  } finally { if (timer) clearTimeout(timer); signal?.removeEventListener('abort', abort); await browser?.close().catch(() => {}); }
}


// Shared capture core. HTTP callers always enter through extractCatalogue's validated renderer.
// Exported separately to exercise the exact pipeline against deterministic, locally supplied fixtures.
export async function catalogueFromRenderedPage(browser: Browser, page: Page, url: string, budget: NetworkBudget, progress: (stage: string, percent: number) => void = () => {}, signal?: AbortSignal, started = Date.now()): Promise<Catalogue> {
  const exportContext = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  await exportContext.route('**/*', route => route.abort());
  try {
    progress('Finding repeated structures and visual styles', 24);
    const { candidates, title } = await page.evaluate(discoverComponents);
    if (!candidates.length) throw new Error('No visible component candidates were found. This may be a blocked page, canvas app or unsupported layout.');
    const families = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const family = families.get(candidate.structure) ?? []; family.push(candidate); families.set(candidate.structure, family);
    }
    const sorted = [...families.entries()].sort((a,b) => Number(b[1][0].semantic) - Number(a[1][0].semantic) || b[1].length - a[1].length).slice(0, 12);
    const components: ComponentEntry[] = [];
    let stylesCaptured = 0;
    for (const [structure, group] of sorted) {
      if (signal?.aborted) throw new Error('Extraction cancelled.');
      if (stylesCaptured >= 16) break;
      const styles = [...new Map(group.map(c => [c.signature, c])).values()].slice(0, Math.min(3, 16 - stylesCaptured));
      const entry: ComponentEntry = {
        id: createHash('sha256').update(structure).digest('hex').slice(0,12),
        name: `${group[0].category === 'Other' ? 'Links' : group[0].category} ${components.filter(c => c.category === group[0].category).length + 1}`,
        category: group[0].category as Category,
        signature: createHash('sha256').update(structure).digest('hex').slice(0,12),
        instances: group.length,
        selector: `[data-unpack-id="${group[0].index}"]`,
        confidence: group[0].semantic ? 'Semantic match' : group.length > 1 ? 'Repeated structure' : 'Heuristic match',
        snapshots: [], notes: ['Appearance capture only; application behaviour is not reconstructed.', 'Web fonts and external assets are not bundled.'],
      };
      for (let styleIndex = 0; styleIndex < styles.length; styleIndex++) {
        const candidate = styles[styleIndex];
        const selector = `[data-unpack-id="${candidate.index}"]`;
        if (!entry.accessibility) entry.accessibility = await page.locator(selector).ariaSnapshot({ timeout: 1500 }).catch(() => 'Accessibility snapshot unavailable.');
        for (const viewport of ['desktop','mobile'] as const) {
          await page.setViewportSize({ width: viewport === 'desktop' ? 1280 : 390, height: 900 });
          let defaultCss = '';
          for (const state of ['default','hover','focus'] as const) {
            try {
              await forceState(page, selector, state);
              const data = await page.evaluate(captureComponent, candidate.index);
              if (state === 'default') defaultCss = data.css;
              else if (data.css === defaultCss) { entry.notes.push(`Style ${styleIndex+1}, ${viewport}: no ${state} CSS change observed.`); continue; }
              if (data.width < 1 || data.height < 1) { entry.notes.push(`Style ${styleIndex+1} is hidden at ${viewport} width.`); break; }
              const snapshot: Snapshot = { ...data, variant: `Style ${styleIndex+1}`, state, viewport, pixelDifference: null };
              if (state !== 'default') snapshot.notes.push(`CSS ${state} was forced; event-driven behaviour was not tested.`);
              const source = await page.locator(selector).screenshot({ timeout: 2500 });
              if (source.length < 200000) snapshot.screenshot = `data:image/png;base64,${source.toString('base64')}`;
              if (state === 'default') snapshot.pixelDifference = await measureSnapshot(exportContext, snapshot, source);
              entry.snapshots.push(snapshot);
            } catch { entry.notes.push(`Style ${styleIndex+1}, ${viewport}: ${state} state was not reachable.`); }
          }
          await forceState(page, selector, 'default').catch(() => {});
        }
        stylesCaptured++;
        progress(`Capturing components · ${stylesCaptured} visual styles`, Math.min(90, 28 + stylesCaptured * 4));
      }
      if (entry.snapshots.length) { entry.notes = [...new Set(entry.notes)]; components.push(entry); }
    }
    if (!components.length) throw new Error('Candidates were found, but none could be captured. The page may change continuously or block inspection.');
    progress('Organising your catalogue', 96);
    return { kind: 'extraction', url, title, createdAt: new Date().toISOString(), components, durationMs: Date.now() - started, scanned: candidates.length,
      warnings: [
        'Early experiment: component boundaries and grouping are heuristic. Review each entry before reuse.',
        'Scan is limited to one page, 160 candidates, 12 structural groups and 16 visual styles. Closed menus, shadow DOM and authenticated screens are not explored.',
        'Disabled and loading states are not invented. Hover and focus record CSS changes only; JavaScript interactions are not exported.',
        'Pixel difference compares isolated crops at the captured size. It does not establish behaviour, accessibility or responsive correctness.',
        ...(budget.blocked ? [`${budget.blocked} network requests were blocked or failed; this may reduce extraction quality.`] : []),
      ],
    };
  } finally { await exportContext.close(); }
}
