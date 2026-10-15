# Unpack

Paste a public website URL and get a catalogue of its reusable UI: component types, visual variants, isolated previews and appearance code.

**Early experiment.** Extraction quality on arbitrary sites is unproven. Samples are labelled fixtures; real failures never become sample output. No AI API key, auth or billing is required.

## Local development

Use Node.js 24.

```sh
npm ci
npm run browsers
npm run dev
```

Open `http://localhost:3000`. To run a production build: `npm run build && npm start`.

`UNPACK_CHROMIUM_EXECUTABLE` optionally points to an operator-installed Chromium binary. Linux browser dependencies may require `npx playwright install --with-deps chromium`.

## Deploy on Vercel

1. Import `sumitttt4/getcomponents` as a Next.js project with the repository root as Root Directory.
2. Use Node.js **24.x**, `npm ci`, and `npm run build`. Keep Fluid compute enabled; `vercel.json` declares it.
3. Do not set `UNPACK_CHROMIUM_EXECUTABLE` on Vercel. The app detects `VERCEL=1` and loads the bundled `@sparticuz/chromium` executable. There is no runtime browser download from an external URL.
4. Deploy, then test a small public page you own. Confirm progress, a real catalogue, code export and cancellation in the deployed environment.

No database or API key is required for this first slice. Extraction runs in **one streamed Node.js request**, capped at 120 seconds at the route level. It does not write jobs into the project directory or assume requests land on the same server. Browser disconnection/cancellation aborts the renderer. Reload recovery uses IndexedDB in the same browser, limited to ten catalogues and a 24-hour lifetime; catalogue URLs are not cross-device sharing links.

Vercel has a read-only project filesystem, ephemeral function instances, a standard 250 MB function-size limit and a 4.5 MB response limit. The app traces the compressed Chromium runtime into the extraction route, sets a conservative 3.75 MB final-record cap, and omits source screenshots with an explicit warning when necessary. A catalogue still too large is rejected rather than silently truncated. Chromium decompresses only to the runtime's temporary directory.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run check:vercel
```

`check:vercel` checks the production trace for all four Chromium binary archives, estimates traced file size, checks Fluid/Node settings and confirms the streaming route configuration. The current local production trace is **80.0 MiB**. This is a local packaging check, **not a successful Vercel deployment**. A live deployment and public-URL smoke test remain required. Test results cover the renderer with a controlled owned page, not all public websites.

Primary platform references: [Vercel runtimes](https://vercel.com/docs/functions/runtimes), [function limits](https://vercel.com/docs/functions/limitations), [Fluid compute configuration](https://vercel.com/docs/project-configuration), [Chromium's Playwright integration](https://github.com/Sparticuz/chromium#usage-with-playwright).

## What the product does

- Geist Sans UI, semibold headings, responsive landing page and working catalogue, light mode and pure-black dark mode. Fonts are self-hosted and the included OFL licence is preserved.
- Paste a public URL; the page renders at desktop (1280 px) and mobile (390 px) widths. Progress is streamed into the interface.
- Find native controls, exposed roles and labels, class hints, repeated DOM shapes and computed-style signatures. Group results as buttons, inputs, cards, navigation, badges and other patterns.
- Capture up to three visual styles per structural group. CSS hover/focus are recorded only when an actual CSS difference is observed. Loading/disabled states are not invented.
- Browse filtered component cards, compare captures, review uncertainty and observed accessibility information, and inspect supporting pixel-difference measurements.
- Copy/download a selected style as a React wrapper plus scoped plain CSS, or a standalone HTML document. Export the catalogue as JSON.

The React output contains sanitised static markup inside a React wrapper. It is **appearance code**, not reconstructed source JSX, original event handlers or application logic. Values are not remapped to a different token system. Source fonts and external media are not bundled.

## How real extraction works

`POST /api/extract` validates the URL before starting the browser. The response is newline-delimited JSON: `progress` events, followed by either a real `result` or an explicit `error`. The client never calls a sample endpoint when rendering fails.

A fresh browser context routes GET requests through an IP-pinned HTTP transport. DNS answers must all be public; the connection targets the selected checked IP. Redirects are validated again. Private, reserved, metadata and link-local addresses, nonstandard ports and credential-bearing URLs are blocked. An operator-configured proxy must also accept IP-pinned connections; refusal is an explicit failure.

The capture core discovers representative elements, freezes computed visual properties, captures desktop/mobile CSS states, sanitises markup, and compares source crops to isolated renders. The iframe preview has an empty sandbox and deny-by-default CSP. Scripts, event attributes, navigation URLs, external assets and embeds are removed. WebSockets, downloads, service workers and non-GET requests are blocked.

## Verification and actual public-site results

On 15 October 2026 the deterministic suite passed **15/15 tests** with a locally installed Chromium runtime. It covers address blocking, source sanitisation, repeated-component discovery, mobile capture, observed hover/focus CSS, pixel comparisons, standalone React compilation/rendering, split stream chunks/UTF-8, cancellation, response caps and route validation. Lint, typecheck and production build also pass. Live UI/device visual QA was unavailable.

The same real extraction flow was attempted on the required three site classes. `npm run test:public` writes `BENCHMARK.json` and returns a nonzero exit code if any attempt fails.

| Site class | URL | Result here | Missed components / duplicates / wrong boundaries | Variants / visual diff / standalone source export |
|---|---|---|---|---|
| Utility-CSS marketing | `https://tailwindcss.com/` | Failed before load | Unknown | Not measured / not generated |
| CSS-in-JS dashboard | `https://mui.com/material-ui/getting-started/templates/dashboard/` | Failed before load | Unknown | Not measured / not generated |
| Design-system docs | `https://kumo-ui.com/components/button/` | Failed before load | Unknown | Not measured / not generated |

This environment's direct DNS lookup returned `EAI_AGAIN`; Chromium consequently reported `ERR_BLOCKED_BY_CLIENT` after the safe transport rejected unresolved requests. These results do not prove that the sites block Unpack. Safety checks were not weakened to obtain a result. Rerun from Vercel with working public DNS and egress, then manually assess missed components, duplicates, boundaries and fidelity before making quality claims.

## Known limits

- One public page only. No authentication, crawler, closed-menu exploration, iframe/shadow-DOM traversal or canvas reconstruction. Login walls and automation blocking can prevent useful extraction.
- Query up to 2,500 DOM nodes and inspect at most 160 visible candidates, 12 structural groups and 16 visual styles. Each captured component is bounded to 100 descendants and depth 12. Large/hidden elements may be skipped; notes report unreachable captures.
- Structural grouping is heuristic. Similar elements may merge; related source components with different DOM structures may split.
- CSS is captured at two widths with a 640 px export breakpoint. This does not infer an entire responsive system. Mobile DOM changes may make a desktop-discovered component unreachable.
- No reconstruction of JavaScript interactions, animation or application state. External fonts, images, gradients and sprite references may be lost. Pixel difference describes a crop at one size, not accessibility or functional correctness.
- The renderer has a 90-second capture timeout, 160-request budget, 4 MB response/decode cap per resource and 24 MB network budget. Final output size is checked before transmission.
- One active extraction and ten starts/hour **per warm function instance**. These are prototype safeguards, not distributed quotas. Browser storage can be cleared/disabled; download results you need to retain.
- This is not a hardened public multi-tenant rendering service. Packaged serverless Chromium runs without the Chromium OS sandbox; use an access boundary for the experiment and a dedicated isolated rendering worker plus distributed quotas before scaling untrusted traffic.

Access to a site is not permission to redistribute its code or assets. Use owned pages or get permission.

## Source map / file purposes

| Path | Purpose |
|---|---|
| `src/app/layout.tsx`, `page.tsx`, `icon.svg` | App shell, entrypoint and SVG identity |
| `src/app/globals.css`, `landing.css` | Shared catalogue controls and the new responsive landing composition |
| `src/components/workspace.tsx`, `landing-diagram.tsx`, `providers.tsx` | Real URL workflow, catalogue/inspection, illustrative diagram and next-themes provider |
| `src/app/api/extract/route.ts` | Same-origin streamed extraction, abort handling and instance-local limits |
| `src/lib/network.ts`, `dom.ts`, `extractor.ts` | Safe transport, fixed DOM inspection and browser capture engine |
| `src/lib/stream.ts`, `catalogue-storage.ts` | Bounded streaming protocol and browser-only result recovery |
| `src/lib/export.ts`, `types.ts` | Shared capture data and standalone appearance exports |
| `src/fixtures/catalogue.ts` | Explicitly separated hand-made sample catalogue |
| `public/fonts/geist-sans.woff2`, `OFL.txt` | Geist UI font and licence |
| `tests/`, `scripts/benchmark.ts`, `BENCHMARK.json` | Regression checks and honest three-site experiment |
| `scripts/check-vercel.mjs`, `vercel.json` | Local release preflight and Vercel build/Fluid settings |
| `next.config.ts`, TypeScript/PostCSS/ESLint configs, package files | Framework setup, binary tracing, reproducible dependencies and checks |
| `.github/workflows/checks.yml`, `.gitignore`, `.env.example` | CI checks, ignored runtime files and optional local configuration |

Runtime dependencies are Next/React, Kumo and its icon peer, next-themes, playwright-core, packaged Chromium, ipaddr.js and pngjs. The full Playwright download tooling remains a development dependency. Motion uses CSS. No AI service or API key is used. Kumo is Cloudflare's library; this product is not affiliated with Cloudflare or Vercel.
