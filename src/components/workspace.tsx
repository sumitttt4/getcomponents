'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Button } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { ArrowUpRight, ArrowRight, ArrowLeft, Sun, Moon, Globe, SquaresFour, Cursor, Textbox, Rectangle, Browser, Tag, Code, Copy, Check, DownloadSimple, X, MagnifyingGlass, Monitor, DeviceMobile, Info, CircleNotch, WarningCircle, BracketsCurly, Stack, Scan, Fingerprint, CaretRight } from '@phosphor-icons/react';
import { fixtureCatalogue } from '@/fixtures/catalogue';
import { readExtractionStream } from '@/lib/stream';
import { loadCatalogue, saveCatalogue } from '@/lib/catalogue-storage';
import { LandingDiagram } from './landing-diagram';
import { exportHtml, exportReact, previewDocument } from '@/lib/export';
import type { Catalogue, Category, ComponentEntry, Job, Snapshot } from '@/lib/types';

const categories: { name: Category | 'All components'; icon: typeof SquaresFour }[] = [
  { name: 'All components', icon: SquaresFour }, { name: 'Buttons', icon: Cursor }, { name: 'Inputs', icon: Textbox }, { name: 'Cards', icon: Rectangle }, { name: 'Navigation', icon: Browser }, { name: 'Badges', icon: Tag }, { name: 'Other', icon: BracketsCurly },
];
function Mark() { return <svg className="brand-mark" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.6"/><rect x="17" y="3" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.6"/><rect x="3" y="17" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.6"/><rect x="17" y="17" width="8" height="8" rx="1.6" fill="currentColor"/><path d="M14 5h1m-1 18h1M5 14v1m18-1v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}
function cleanName(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function Preview({ snapshot, compact = false }: { snapshot: Snapshot; compact?: boolean }) {
  const width = snapshot.width + 48;
  const height = snapshot.height + 48;
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = container.current;
    if (!compact || !element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, Math.max(1,entry.contentRect.width - 24)/width, Math.max(1,entry.contentRect.height - 20)/height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact, width, height]);
  return <div ref={container} className={`isolated-preview ${compact ? 'compact-preview' : ''}`}>
    <iframe sandbox="" title="Isolated component preview" referrerPolicy="no-referrer" tabIndex={compact ? -1 : 0}
      data-preview-width={width} data-preview-height={height} srcDoc={previewDocument(snapshot)} style={{ width: Math.max(1,width), height: Math.max(1,height), transform: compact ? `scale(${scale})` : undefined }} />
  </div>;
}

export function Workspace() {
  const { resolvedTheme, setTheme } = useTheme();
  const [catalogue, setCatalogue] = useState<Catalogue>(fixtureCatalogue);
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const extractionRef = useRef<AbortController | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = starting || !!job && ['running','queued'].includes(job.status);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('catalogue');
    if (id && /^[a-f0-9-]{36}$/.test(id)) {
      loadCatalogue(id).then(result => {
        if (result) setCatalogue(result);
        else setError('This catalogue is not saved in this browser, or it has expired.');
      }).catch(() => setError('Browser storage is unavailable. You can still run an extraction and download its result.'));
    }
    return () => extractionRef.current?.abort();
  }, []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now()-start)/1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  async function start(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    const value = url.trim(); if (!value) { inputRef.current?.focus(); return; }
    setError(''); setStarting(true); setElapsed(0);
    const controller = new AbortController(); extractionRef.current = controller;
    setJob({ id:crypto.randomUUID(), status:'running', progress:0, stage:'Preparing extraction', createdAt:new Date().toISOString() });
    sectionRef.current?.scrollIntoView({ behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth', block:'start' });
    try {
      const response = await fetch('/api/extract', { method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:/^[a-z][a-z\d+.-]*:/i.test(value)?value:`https://${value}`}) });
      if (!response.ok) { const data=await response.json(); throw new Error(data.error||'Could not start extraction.'); }
      if (!response.body) throw new Error('Your browser did not receive an extraction stream.');
      let complete = false;
      for await (const event of readExtractionStream(response.body)) {
        if (event.type==='progress') setJob(j=>j?{...j,status:'running',stage:event.stage,progress:event.progress}:null);
        else if (event.type==='error') throw new Error(event.error);
        else {
          complete=true;
          const result=event.catalogue;
          let saved=false;
          try { await saveCatalogue(event.id,result); saved=true; }
          catch { result.warnings.push('This catalogue could not be saved in this browser. Download it before leaving this page.'); }
          setCatalogue(result); setJob(j=>j?{...j,status:'complete',progress:100,stage:'Catalogue ready'}:null);
          window.history.replaceState(null,'',saved?`?catalogue=${event.id}#catalogue`:'#catalogue');
        }
      }
      if (!complete) throw new Error('The connection ended before the catalogue was ready. Please retry.');
    } catch (error) {
      if (controller.signal.aborted) setJob(j=>j?{...j,status:'cancelled',stage:'Extraction cancelled'}:null);
      else { setError(error instanceof Error?error.message:'Extraction failed.'); setJob(j=>j?{...j,status:'failed'}:null); }
    } finally { setStarting(false); extractionRef.current=null; }
  }
  function showSample() { setCatalogue(fixtureCatalogue); setError(''); setJob(null); window.history.replaceState(null,'','#catalogue'); sectionRef.current?.scrollIntoView({ behavior:'smooth' }); }
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand" aria-label="Unpack home"><Mark/>Unpack<span className="brand-note">URL → UI</span></Link>
      <nav className="header-nav" aria-label="Main navigation"><a href="#how-it-works" className="how-link">How it works</a><a href="https://github.com/sumitttt4/getcomponents" target="_blank" rel="noopener noreferrer" className="source-nav">Source <ArrowUpRight size={13}/></a><button onClick={showSample} disabled={busy}>Explore sample <ArrowUpRight size={14}/></button><span className="nav-divider"/><Button variant="ghost" shape="square" className="theme-button" aria-label="Switch between light and dark theme" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}><Sun className="light-icon" size={18}/><Moon className="dark-icon" size={18}/></Button></nav>
    </div></header>
    <main id="main">
      <section className="hero landing-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot"/>A closer look at the interfaces you love</div>
          <h1>From website.<br/>To building blocks<span className="hero-period">.</span></h1>
          <p className="hero-description">The button. The card. That perfectly spaced input. Paste a URL and explore the UI behind the page — organised, inspectable, and ready to learn from.</p>
          <div className="hero-capabilities"><span><Check size={14}/>Component types</span><span><Check size={14}/>Observed variants</span><span><Check size={14}/>Previews + code</span></div>
        </div>
        <LandingDiagram/>
        <div className="hero-entry"><div className="entry-heading"><span>Start with a website.</span><span>One public URL. One component catalogue.</span></div>
        <form className="url-form" onSubmit={start}>
          <div className="url-input-wrap"><Globe size={20} aria-hidden="true"/><label className="sr-only" htmlFor="website-url">Public website URL</label><input id="website-url" ref={inputRef} value={url} onChange={e => setUrl(e.target.value)} inputMode="url" autoComplete="url" placeholder="https://a-website-you-love.com" spellCheck={false} maxLength={2048} disabled={busy} aria-describedby="url-help"/></div>
          <Button type="submit" variant="primary" className="primary extract-button" disabled={busy}>{busy ? <><CircleNotch className="spin" size={17}/>Unpacking</> : <>Extract components <ArrowRight size={16}/></>}</Button>
        </form>
        <p className="form-hint" id="url-help">Public pages. No API key. <button onClick={showSample} disabled={busy}>See a sample first <ArrowUpRight size={12}/></button></p>
        </div>
      </section>
      <div className="landing-divider"><span>Less screenshot collecting. More understanding.</span><span>Built for the details <SquaresFour size={14}/></span></div>
      <div className="collection-intro"><div><span className="kicker">The output, up close</span><h2>A page is the beginning.<br/><span>The parts are the interesting bit.</span></h2></div><p>Explore a hand-made sample below.<br/>Paste a URL above for a real extraction.</p></div>
      <section className="catalogue-section" id="catalogue" ref={sectionRef} aria-label="Component catalogue">
        {error && <div className="error-notice" role="alert"><WarningCircle size={20}/><div><strong>We couldn’t complete that extraction.</strong><p>{error}</p><p>Your previous catalogue is still below. No sample has been substituted for the failed result.</p></div><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
        {busy ? <div className="progress-window"><div className="window-bar"><span className="window-dots"><i/><i/><i/></span><span>unpacking your page</span><span>{elapsed}s elapsed</span></div><div className="progress-body"><div className="scan-mark"><Scan size={40}/></div><span className="kicker">A closer look</span><h2>{job?.stage || 'Preparing extraction'}</h2><p>Rendering the page, finding its patterns, and isolating each component.</p><div className="progress-track" role="progressbar" aria-label="Extraction progress" aria-valuenow={job?.progress || 0} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(3,job?.progress || 0)}%` }}/></div><div className="progress-steps"><span data-done={(job?.progress || 0)>20}><Check/>Render</span><span data-done={(job?.progress || 0)>26}><Check/>Discover</span><span data-done={(job?.progress || 0)>90}><Check/>Capture</span><span data-done={(job?.progress || 0)>96}><Check/>Organise</span></div><p className="progress-live" role="status">{job?.stage || 'Starting your extraction…'}</p>{job && <Button variant="ghost" onClick={() => extractionRef.current?.abort()}>Cancel extraction</Button>}</div></div> : <CatalogueView key={catalogue.createdAt} catalogue={catalogue} onReset={() => { inputRef.current?.focus(); window.scrollTo({ top:0,behavior:'smooth' }); }}/>} 
        <p className="catalogue-caption"><Info size={14}/>{catalogue.kind === 'fixture' ? 'Fixture / sample. Every component above is hand-made to demonstrate the catalogue.' : 'Real extraction output. Heuristic grouping and visual captures; review before reuse.'}</p>
      </section>
      <section className="value-section" aria-label="What you get"><div className="value-code"><div className="value-code-top"><Code size={16}/><span>Button / appearance capture</span><span>Sample</span></div><pre><code><span className="code-muted">{'// Keep the details that make it work visually.\n'}</span>{'.button {\n'}<span>{'  background: #171717;\n  border-radius: 8px;\n  padding: 12px 16px;\n  font-weight: 600;\n'}</span>{'}'}</code></pre><div className="value-code-bottom"><span>Plain CSS. Original values.</span><Check size={14}/></div></div><div className="value-copy"><span className="kicker">Keep what makes it, it.</span><h2>The little details.<br/>Without the guesswork.</h2><p>Inspect the visual decisions behind a component. Its spacing, shape, colour and captured states — preserved as source values, instead of forced into a different design system.</p><div className="value-points"><div><Fingerprint size={18}/><span><b>Faithful values</b><small>Computed styles, with no brand remapping.</small></span></div><div><Monitor size={18}/><span><b>Two perspectives</b><small>Desktop and mobile captures, side by side.</small></span></div><div><Code size={18}/><span><b>Something to take away</b><small>Download appearance code as React or HTML + CSS.</small></span></div></div></div></section>
      <section className="how-section" id="how-it-works"><div className="section-intro"><span className="kicker">A simple sequence</span><h2>One link.<br/>A different way to look.</h2><p>From a rendered page to its reusable patterns.</p></div><div className="process-grid">{[
        { n:'01', icon:Globe, title:'Paste a public URL', text:'Start with your own website, or a page you have permission to inspect.' },
        { n:'02', icon:Scan, title:'Let the page render', text:'A fresh browser examines desktop and mobile layouts and finds component candidates.' },
        { n:'03', icon:Stack, title:'Explore the collection', text:'Browse buttons, inputs, cards, navigation and other observed patterns.' },
        { n:'04', icon:Code, title:'Inspect the details', text:'Compare captured styles, review the evidence and download standalone appearance code.' },
      ].map(item => <article className="process-step" key={item.n}><div><item.icon size={21}/><span>{item.n}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>
      <section className="closing-cta"><div><span className="kicker">Good interfaces are worth understanding.</span><h2>Find the parts<br/>that caught your eye.</h2></div><Button variant="primary" className="primary" onClick={()=>{inputRef.current?.focus();window.scrollTo({top:0,behavior:'smooth'});}}>Unpack a website <ArrowUpRight size={17}/></Button></section>
      <section className="experiment-note"><Fingerprint size={26}/><div><h2>Useful curiosity. Honest limitations.</h2><p>Unpack is an early experiment. Complex layouts, custom fonts, hidden states and application logic may not survive extraction. Every catalogue surfaces its gaps. A close pixel match is evidence about appearance — never proof of working behaviour.</p><p>Access to a page is not permission to redistribute its code or assets. Use your own sites, or get permission.</p></div><span className="experiment-label">Work in progress</span></section>
    </main>
    <footer><Link href="/" className="brand"><Mark/>Unpack</Link><span>A closer look at the things we build.</span><a href="#main">Back to top ↑</a></footer>
  </>;
}

function CatalogueView({ catalogue, onReset }: { catalogue: Catalogue; onReset: () => void }) {
  const [category,setCategory] = useState('All components');
  const [query,setQuery] = useState('');
  const [selected,setSelected] = useState<ComponentEntry | null>(null);
  const [open,setOpen] = useState(false);
  const [showNotes,setShowNotes] = useState(false);
  const entries = catalogue.components.filter(c => (category === 'All components' || c.category === category) && `${c.name} ${c.category}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="catalogue-window">
    <div className="window-bar"><span className="window-dots"><i/><i/><i/></span><span className="source-pill"><Globe size={13}/>{catalogue.url.replace(/^https?:\/\//,'').replace(/\/$/,'')}</span><span className={`type-label ${catalogue.kind === 'extraction' ? 'real-label' : ''}`}>{catalogue.kind === 'fixture' ? 'Fixture / sample' : 'Real extraction'}</span></div>
    <div className="catalogue-layout"><aside className="catalogue-sidebar"><div className="sidebar-heading"><SquaresFour size={16}/>Your catalogue</div><div className="category-list" role="group" aria-label="Filter components">{categories.map(({name,icon:Icon}) => { const count = catalogue.components.filter(c => name === 'All components' || c.category === name).length; if (!count && name !== 'All components') return null; return <button className={category === name ? 'active' : ''} key={name} onClick={() => setCategory(name)} aria-pressed={category === name}><Icon size={16}/><span>{name}</span><span className="count">{count}</span></button>; })}</div><div className="sidebar-note"><span className="status-dot"/><span>Source-faithful values<br/><small>No token remapping</small></span></div><button className="text-link sidebar-link" onClick={onReset}><ArrowLeft size={14}/>Unpack another page</button></aside>
      <div className="catalogue-main"><div className="catalogue-heading"><div><div className="kicker">{catalogue.kind === 'fixture' ? 'An example, taken apart' : 'From the source'}</div><h2>{category === 'All components' ? 'The component collection' : category}</h2><p>{catalogue.components.length} component groups <span>·</span> {new Set(catalogue.components.flatMap(c => c.snapshots.map(s => `${c.id}/${s.variant}`))).size} visual styles <span>·</span> {catalogue.kind === 'fixture' ? 'Illustrative only' : `${Math.round(catalogue.durationMs/1000)}s extraction`}</p></div><Button variant="secondary" className="export-button" onClick={() => download('unpack-catalogue.json',JSON.stringify(catalogue,null,2),'application/json')}><DownloadSimple size={15}/><span>Export catalogue</span></Button></div>
      <div className="collection-toolbar"><div className="search-field"><MagnifyingGlass size={16}/><Input aria-label="Search components" value={query} onValueChange={setQuery} placeholder="Find a component…"/></div><span className="view-label"><SquaresFour size={15}/>Grid view</span></div>
      <div className="component-grid">{entries.map((entry,index) => <button key={entry.id} className="component-card" onClick={() => { setSelected(entry); setOpen(true); }} style={{ '--entry-index':index } as React.CSSProperties}><div className={`card-preview preview-${entry.category.toLowerCase()}`}><Preview snapshot={entry.snapshots[0]} compact/><span className="inspect-affordance">Inspect <ArrowUpRight size={12}/></span></div><div className="card-description"><div><span className="component-category">{entry.category}</span><h3>{entry.name}</h3></div><span className="variant-count">{new Set(entry.snapshots.map(s => s.variant)).size} {new Set(entry.snapshots.map(s => s.variant)).size === 1 ? 'style' : 'styles'}<CaretRight size={12}/></span></div><div className="card-evidence"><span className="status-dot"/>{catalogue.kind === 'fixture' ? 'Sample component' : entry.confidence}</div></button>)}</div>
      {!entries.length && <div className="empty-state"><MagnifyingGlass size={26}/><h3>No components match.</h3><p>Try another search or category.</p><Button variant="secondary" onClick={() => { setQuery(''); setCategory('All components'); }}>Clear filters</Button></div>}
      <div className="collection-bottom"><span><Check size={13}/>{catalogue.kind === 'fixture' ? 'A hand-made demonstration' : `${catalogue.scanned} candidates inspected`}</span><button className="text-link" aria-expanded={showNotes} onClick={() => setShowNotes(!showNotes)}>Extraction notes <Info size={14}/></button></div>{showNotes && <div className="extraction-notes">{catalogue.warnings.map(note => <p key={note}>{note}</p>)}</div>}
      </div>
    </div>
    <Inspector entry={selected} open={open} onOpenChange={setOpen} fixture={catalogue.kind === 'fixture'}/>
  </div>;
}

function Inspector({ entry,open,onOpenChange,fixture }: { entry: ComponentEntry | null; open:boolean; onOpenChange:(value:boolean)=>void; fixture:boolean }) {
  const [tab,setTab] = useState('preview');
  const [variant,setVariant] = useState('Style 1');
  const [viewport,setViewport] = useState('desktop');
  const [state,setState] = useState('default');
  const [codeType,setCodeType] = useState('react');
  const [source,setSource] = useState(false);
  const [copied,setCopied] = useState(false);
  const [copyError,setCopyError] = useState('');
  const [previousEntry,setPreviousEntry] = useState(entry?.id);
  // Selection is reset as a render adjustment so every opened entry starts at an observed capture.
  if (entry && previousEntry !== entry.id) {
    setPreviousEntry(entry.id);
    setVariant(entry.snapshots[0].variant); setViewport(entry.snapshots[0].viewport); setState('default'); setTab('preview'); setSource(false); setCopied(false); setCopyError('');
  }
  const snapshot = entry?.snapshots.find(s => s.variant === variant && s.viewport === viewport && s.state === state) ?? entry?.snapshots.find(s => s.variant === variant && s.viewport === viewport) ?? entry?.snapshots.find(s => s.variant === variant) ?? entry?.snapshots[0];
  const code = entry && snapshot ? codeType === 'react' ? exportReact(entry,snapshot) : exportHtml(entry,snapshot) : '';
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog className="inspector-dialog" size="xl"><div className="inspector-top"><div><div className="kicker">{fixture ? 'Fixture / sample' : 'Source-faithful capture'}</div><Dialog.Title className="inspector-title">{entry?.name || 'Component details'}</Dialog.Title><Dialog.Description className="inspector-description">{fixture ? 'Hand-made example. Not extracted from a website.' : 'Inspect captured appearance, standalone code and extraction evidence.'}</Dialog.Description></div><Dialog.Close render={<Button variant="ghost" shape="square" aria-label="Close component inspector"><X size={19}/></Button>}/></div>
    {entry && snapshot && <><div className="inspector-tabs" role="tablist" aria-label="Inspector sections">{['preview','code','evidence'].map(t => <button role="tab" id={`tab-${t}`} aria-controls="inspector-content" aria-selected={tab === t} className={tab===t?'active':''} key={t} onClick={()=>setTab(t)}>{t === 'preview' ? <SquaresFour size={15}/> : t === 'code' ? <Code size={15}/> : <Fingerprint size={15}/>}<span>{t[0].toUpperCase()+t.slice(1)}</span></button>)}</div><div id="inspector-content" role="tabpanel" aria-labelledby={`tab-${tab}`} className="inspector-content">
      <div className="capture-controls"><label>Variant<select value={variant} onChange={e=>{setVariant(e.target.value);setState('default');}}>{[...new Set(entry.snapshots.map(s=>s.variant))].map(v=><option key={v}>{v}</option>)}</select></label><label>State<select value={snapshot.state} onChange={e=>setState(e.target.value)}>{[...new Set(entry.snapshots.filter(s=>s.variant===variant && s.viewport===snapshot.viewport).map(s=>s.state))].map(s=><option key={s}>{s}</option>)}</select></label><div className="viewport-controls" role="group" aria-label="Capture viewport">{(['desktop','mobile'] as const).map(v=><Button key={v} variant={snapshot.viewport===v?'secondary':'ghost'} shape="square" disabled={!entry.snapshots.some(s=>s.variant===variant && s.viewport===v)} aria-pressed={snapshot.viewport===v} aria-label={`${v} capture`} onClick={()=>{setViewport(v);setState('default');}}>{v==='desktop'?<Monitor size={17}/>:<DeviceMobile size={17}/>}</Button>)}</div></div>
      {tab==='preview' && <><div className="preview-topline"><span>{snapshot.width} × {snapshot.height} px · {snapshot.viewport} · {snapshot.state}</span>{snapshot.screenshot && <button className="text-link" onClick={()=>setSource(!source)}>{source?'Show isolated preview':'Show source crop'}</button>}</div><div className="inspector-preview">{source && snapshot.screenshot ? <div className="source-crop"><Image unoptimized src={snapshot.screenshot} width={snapshot.width} height={snapshot.height} alt={`Source screenshot of ${entry.name}`} /></div> : <Preview snapshot={snapshot}/>}</div><p className="preview-note"><Info size={15}/>This preview is sandboxed. Original scripts, event handlers, navigation and external assets are removed.</p></>}
      {tab==='code' && <><div className="code-toolbar"><div className="segmented"><button aria-pressed={codeType==='react'} onClick={()=>setCodeType('react')}>React + CSS</button><button aria-pressed={codeType==='html'} onClick={()=>setCodeType('html')}>HTML + CSS</button></div><Button variant="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);setCopyError('');setTimeout(()=>setCopied(false),2000);}catch{setCopyError('Clipboard unavailable. Use Download code instead.');}}}>{copied?<Check size={14}/>:<Copy size={14}/>}<span>{copied?'Copied':'Copy'}</span></Button></div><pre className="code-block" tabIndex={0}><code>{code}</code></pre>{copyError && <p role="alert">{copyError}</p>}<p className="preview-note">A standalone appearance capture. React output uses sanitised markup with plain CSS. Add your own logic and verify asset permissions.</p></>}
      {tab==='evidence' && <div className="evidence-content"><dl><div><dt>Discovery signal</dt><dd>{fixture?'Fixture / no discovery':entry.confidence}</dd></div><div><dt>Instances grouped</dt><dd>{fixture?'Illustrative':entry.instances}</dd></div><div><dt>Pixel difference</dt><dd>{snapshot.pixelDifference===null?'Not measured':`${snapshot.pixelDifference}% of pixels differ`}</dd></div><div><dt>Capture</dt><dd>{snapshot.viewport} / {snapshot.state} / {snapshot.variant}</dd></div></dl><p>Pixel difference is a supporting visual metric only. Lower is closer at this captured size; it says nothing about behaviour or accessibility. Unavailable comparisons are left unmeasured.</p><h3>Capture notes</h3><ul>{[...new Set([...entry.notes,...snapshot.notes])].map(n=><li key={n}>{n}</li>)}</ul>{entry.accessibility && <><h3>Observed accessibility tree</h3><pre className="accessibility-tree">{entry.accessibility}</pre></>}</div>}
    </div><div className="inspector-footer"><span><span className="status-dot"/>{fixture?'Sample fixture':'Faithful values, without remapping'}</span><Button variant="primary" className="primary" onClick={()=>download(`${cleanName(entry.name)}-${cleanName(snapshot.variant)}.${codeType==='react'?'tsx':'html'}`,code)}><DownloadSimple size={15}/>Download code</Button></div></>}
  </Dialog></Dialog.Root>;
}
