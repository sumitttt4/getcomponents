# Unpack

A public website URL → an organised catalogue of that page's reusable UI components, observed visual variants, isolated previews, and appearance code.

**Early experiment.** This is the first working slice, not a proven arbitrary-site extraction engine. No AI API key is required. There is no auth, billing, analytics, marketplace or deployment integration.

## Run

Requires Node.js 22.13+ (verified here with Node.js 24.19), a supported Chromium environment, DNS access and outbound public web access.

```sh
npm ci
npm run browsers
npm run dev
```

Open `http://localhost:3000`. For a production build, use `npm run build` followed by `npm start`. This application needs a persistent Node.js server and writable `.data/jobs`; a static export cannot run extraction. Short-lived serverless functions are not supported by this job implementation.

If Playwright cannot download Chromium in your environment, install a trusted Chromium runtime and set `UNPACK_CHROMIUM_EXECUTABLE` to its absolute binary path. The test environment used an unpacked `@sparticuz/chromium` runtime because the Playwright CDN download was unavailable; that test-only package is not bundled with this repository. On Linux, Playwright's system dependencies may also be necessary (`npx playwright install --with-deps chromium`).

## What works

- Responsive landing page and catalogue, light/dark themes through `next-themes`, Kumo buttons/inputs/dialog, keyboard focus and reduced-motion support.
- Public URL submission with progress polling, cancellation, explicit failures and 24-hour catalogue retrieval by random job ID.
- Desktop (1280 px) and mobile (390 px) rendering in fresh browser contexts.
- Discovery from native controls, exposed roles/labels, class hints, repeated DOM structure and computed-style signatures. Groups are heuristic; style hashes do not prove a shared source component.
- Up to 12 structural groups and 16 visual styles per page. CSS hover/focus are forced and recorded only if the captured CSS changes. This does not test event-driven behaviour.
- Sanitised HTML and computed CSS, isolated iframe previews, source crops, supporting pixel-difference measurements, observed accessibility snapshots and per-entry uncertainty.
- Copy/download a selected style as a standalone React wrapper with plain CSS, or HTML + CSS. React CSS is scoped per component/style. Export the full catalogue as JSON.

The initial catalogue is explicitly labelled **fixture / sample**, stored only in `src/fixtures/`. An extraction failure never turns into a fixture result. The sample browser controls are illustrative content, not a functional sample application.

## How extraction works

`POST /api/extract` validates a URL and creates a random-ID job. A Next.js `after()` task launches Playwright and routes page/subresource GET requests through a bounded IP-pinned transport. Each redirect is intercepted and validated again. Browser service workers, WebSockets, downloads, popups, credential storage and non-GET requests are disabled or blocked.

The capture core groups candidates by semantic category and DOM shape, then by a computed visual-style signature. Each representative is captured at both widths. Only observed states enter the result. Disabled/loading states are not synthesised.

Each preview is an allowlisted HTML snapshot with resolved CSS values. Scripts, event attributes, navigation URLs, forms, embeds and external assets are removed. The preview iframe has an empty sandbox and a deny-by-default CSP. It receives no source cookies, storage or network permissions.

The React export intentionally uses a sanitised static HTML snapshot inside a small React wrapper. It is appearance code, not reconstructed source JSX or original application logic. It does not remap values to a new token system.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:public
```

The deterministic suite covers URL/IP blocking (including numeric loopback and IPv6-mapped targets), inert exports, source-script removal, repeated-component discovery, actual CSS-state changes, mobile capture, pixel comparison and standalone React compilation/server rendering. A complete capture-pipeline test uses a first-party page supplied directly to the same capture core; it does not bypass URL validation on an HTTP route.

On 15 October 2026 the deterministic suite passed **9/9 tests** with the packaged Chromium runtime. Typecheck, lint and production build passed during implementation. No live UI browser QA was available; responsive CSS is implemented, but visual and touch verification on devices remains outstanding.

### Required three-site experiment

The same `extractCatalogue` flow was attempted on all three targets. Raw results are in `BENCHMARK.json`. The command reports failure with a nonzero exit code when any target fails.

| Site class | Target | Result in this environment | Missed components / duplicates / wrong boundaries | Variant coverage | Visual diff | Standalone source export |
|---|---|---|---|---|---|---|
| Utility-CSS marketing page | `https://tailwindcss.com/` | Failed before page load | Unknown: source not inspected | Not measured | Not measured | Not generated |
| CSS-in-JS dashboard | `https://mui.com/material-ui/getting-started/templates/dashboard/` | Failed before page load | Unknown: source not inspected | Not measured | Not measured | Not generated |
| Design-system docs | `https://kumo-ui.com/components/button/` | Failed before page load | Unknown: source not inspected | Not measured | Not measured | Not generated |

DNS lookup for the first target returned `EAI_AGAIN` in this environment. Chromium reported `ERR_BLOCKED_BY_CLIENT` after the safe transport rejected the unresolved requests. The transport's safety requirements were not relaxed. These results do **not** establish that the targets block Unpack, or that extraction quality is good. Rerun on a host with public DNS/egress; manually inventory missed components, duplicates and boundaries before making quality claims. A successful pixel comparison alone is not a functional or accessibility test.

## Limits to know

- One public page, no authenticated browsing, no crawler, no closed-menu exploration, no iframe/shadow-DOM traversal or canvas reconstruction. A sign-in page may be captured as the public page it exposes.
- Discovery is bounded to 2,500 queried DOM nodes / 160 visible candidates. Each component is limited to 100 descendants and depth 12. Large components may be skipped or truncated; notes identify capture limits.
- At most three visual styles per structural group. Similar components can be merged; related components with different structures can be split.
- External images/fonts, gradients, application state, event handlers and animations are not exported. Pseudo-elements are captured where their computed content can be represented safely. Icons depending on external sprite references may be lost.
- Computed geometry is captured at two widths; the export uses a 640 px breakpoint. It does not infer the source site's entire responsive design. Mobile DOM changes may make a desktop-discovered component unreachable.
- A 90-second extraction cap, 160 requests, 4 MB per compressed/decoded response and 24 MB network budget. Screenshot assets larger than 200 KB are omitted. One active extraction and ten starts/hour per process; these are local prototype limits, not distributed quotas.
- Jobs are held in process memory and stored locally; restarts interrupt running jobs. Results expire after 24 hours; cleanup runs at the next extraction and retains at most 20 result files. Anyone with a random catalogue ID can read its public-page result. Keep this experiment local or behind your own access boundary.

## Isolation and safe operation

Only standard HTTP/HTTPS ports are accepted. Private, loopback, link-local, metadata, reserved and non-unicast addresses are rejected. All DNS answers must be public; the selected IP is pinned for the actual connection. When `HTTP_PROXY`/`HTTPS_PROXY` is configured by the operator, proxy connections also target that checked IP. A proxy that requires hostname-only routing may refuse these connections; Unpack fails visibly rather than weakening the check.

Chromium gets an ephemeral context and no credentials. Its OS sandbox is enabled for non-root users; root development containers cannot use that sandbox. **This is not a hardened public rendering service.** Before exposing arbitrary untrusted pages publicly, run Chromium as an unprivileged isolated worker with OS/container resource limits, a working Chromium sandbox, restricted egress and a durable queue. Application-level URL checks do not replace process/network isolation. Do not enter credential-bearing/private URLs.

Access to a website is not permission to reuse its code, fonts, images or other assets. Use owned pages or get permission. No rights are inferred by extraction.

## Source map and file purposes

| File / directory | Why it exists |
|---|---|
| `src/app/layout.tsx`, `page.tsx`, `icon.svg`, `globals.css` | App shell, landing/catalogue entrypoint, brand mark, responsive neutral themes and purposeful CSS motion |
| `src/components/providers.tsx` | Shared `next-themes` provider bound to Kumo's `data-mode` convention |
| `src/components/workspace.tsx` | URL flow, progress, filtering, previews, inspection, copy and downloads |
| `src/app/api/extract/route.ts` | Same-origin URL submission and asynchronous job startup |
| `src/app/api/jobs/[id]/route.ts` | Uncached job progress/results and cancellation |
| `src/lib/network.ts` | URL validation, IP classification, pinned bounded transport and proxy handling |
| `src/lib/dom.ts` | Fixed DOM-discovery and allowlist-snapshot functions evaluated in the page |
| `src/lib/extractor.ts` | Isolated browser lifecycle, grouping, state capture, screenshots and pixel comparisons |
| `src/lib/jobs.ts` | Bounded local job lifecycle, expiry, rate limit and persistence |
| `src/lib/export.ts`, `types.ts` | Shared snapshot format, sandboxed documents and standalone exports |
| `src/fixtures/catalogue.ts` | Clearly separate hand-made sample data |
| `tests/` | Meaningful security, renderer, state, fidelity and export regression checks |
| `scripts/benchmark.ts`, `BENCHMARK.json` | Repeatable three-site experiment and its actual recorded failures/results |
| `.github/workflows/checks.yml` | Reproducible install, lint, typecheck, browser tests and build on pushes/PRs |
| `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs` | Framework configuration, strict typing, Tailwind/Kumo compilation and lint rules |
| `package.json`, `package-lock.json`, `next-env.d.ts` | Reproducible package inputs and Next.js declarations |
| `.gitignore`, `.env.example` | Keep runtime/cache files out of source; document optional operator configuration |

Dependencies are limited to the requested Next/React/Tailwind stack, Kumo and its icon peer, requested `next-themes`, Playwright for rendering, `ipaddr.js` for robust address classification, `pngjs` for actual pixel comparisons, and normal TypeScript/lint/test tooling. Motion uses CSS rather than an extra animation dependency. Kumo is Cloudflare's library; this product is not affiliated with Cloudflare.
