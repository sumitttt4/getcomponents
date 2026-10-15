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
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = starting || !!job && ['running','queued'].includes(job.status);
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const activeJobId = job && ['running','queued'].includes(job.status) ? job.id : null;
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('catalogue');
    if (id && /^[a-f0-9-]{36}$/.test(id)) {
      fetch(`/api/jobs/${id}`).then(r => { if (!r.ok) throw new Error('This catalogue has expired or could not be found.'); return r.json(); }).then((j: Job) => { setJob(j); setRestoredId(id); if (j.result) setCatalogue(j.result); }).catch(e => setError(e.message));
    }
  }, []);
  useEffect(() => {
    if (!activeJobId) return;
    let stopped = false;
    const id = activeJobId;
    async function poll() {
      try {
        const response = await fetch(`/api/jobs/${id}`, { cache: 'no-store' });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not read extraction progress.');
        if (stopped) return;
        setJob(data);
        if (data.result) { setCatalogue(data.result); window.history.replaceState(null,'',`?catalogue=${id}#catalogue`); }
        if (data.status === 'failed') setError(data.error || 'Extraction failed.');
        if (['queued','running'].includes(data.status)) pollRef.current = setTimeout(poll, 1200);
      } catch (e) { if (!stopped) { setError(e instanceof Error ? e.message : 'Connection lost.'); setJob(j => j ? { ...j, status: 'failed' } : null); } }
    }
    pollRef.current = setTimeout(poll, 350);
    return () => { stopped = true; if (pollRef.current) clearTimeout(pollRef.current); };
  }, [activeJobId, restoredId]);
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
    sectionRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    try {
      const response = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}` }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not start extraction.');
      setJob({ id: data.id, status: 'queued', progress: 0, stage: 'Preparing extraction', createdAt: new Date().toISOString() });
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setStarting(false); }
  }
  function showSample() { setCatalogue(fixtureCatalogue); setError(''); setJob(null); window.history.replaceState(null,'','#catalogue'); sectionRef.current?.scrollIntoView({ behavior:'smooth' }); }
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand" aria-label="Unpack home"><Mark/>Unpack<span className="brand-note">an early experiment</span></Link>
      <nav className="header-nav" aria-label="Main navigation"><a href="#how-it-works" className="how-link">How it works</a><button onClick={showSample} disabled={busy}>Explore sample <ArrowUpRight size={14}/></button><span className="nav-divider"/><Button variant="ghost" shape="square" className="theme-button" aria-label="Switch between light and dark theme" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}><Sun className="light-icon" size={18}/><Moon className="dark-icon" size={18}/></Button></nav>
    </div></header>
    <main id="main">
      <section className="hero">
        <div className="eyebrow"><span className="status-dot"/>From one URL to the parts behind it <ArrowRight size={13}/></div>
        <h1>A website, in its<br/><span>smallest parts.</span></h1>
        <p className="hero-description">Paste a URL. Explore its buttons, inputs, cards and more.<br className="desktop-break"/> A component catalogue, with previews and code.</p>
        <form className="url-form" onSubmit={start}>
          <div className="url-input-wrap"><Globe size={20} aria-hidden="true"/><label className="sr-only" htmlFor="website-url">Public website URL</label><input id="website-url" ref={inputRef} value={url} onChange={e => setUrl(e.target.value)} inputMode="url" autoComplete="url" placeholder="https://your-inspiration.com" spellCheck={false} maxLength={2048} disabled={busy} aria-describedby="url-help"/></div>
          <Button type="submit" variant="primary" className="primary extract-button" disabled={busy}>{busy ? <><CircleNotch className="spin" size={17}/>Unpacking</> : <>Extract components <ArrowRight size={16}/></>}</Button>
        </form>
        <p className="form-hint" id="url-help">Public pages only. No sign-in required. <button onClick={showSample} disabled={busy}>Or explore a sample <ArrowUpRight size={12}/></button></p>
        <div className="hero-annotation"><span className="annotation-line"/><span>Keep the details. Understand the system.</span><span className="annotation-line"/></div>
      </section>
      <section className="catalogue-section" id="catalogue" ref={sectionRef} aria-label="Component catalogue">
        {error && <div className="error-notice" role="alert"><WarningCircle size={20}/><div><strong>We couldn’t complete that extraction.</strong><p>{error}</p><p>Your previous catalogue is still below. No sample has been substituted for the failed result.</p></div><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
        {busy ? <div className="progress-window"><div className="window-bar"><span className="window-dots"><i/><i/><i/></span><span>unpacking your page</span><span>{elapsed}s elapsed</span></div><div className="progress-body"><div className="scan-mark"><Scan size={40}/></div><span className="kicker">A closer look</span><h2>{job?.stage || 'Preparing extraction'}</h2><p>Rendering the page, finding its patterns, and isolating each component.</p><div className="progress-track" role="progressbar" aria-label="Extraction progress" aria-valuenow={job?.progress || 0} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(3,job?.progress || 0)}%` }}/></div><div className="progress-steps"><span data-done={(job?.progress || 0)>20}><Check/>Render</span><span data-done={(job?.progress || 0)>26}><Check/>Discover</span><span data-done={(job?.progress || 0)>90}><Check/>Capture</span><span data-done={(job?.progress || 0)>96}><Check/>Organise</span></div><p className="progress-live" role="status">{job?.stage || 'Starting your extraction…'}</p>{job && <Button variant="ghost" onClick={async () => { try { const r = await fetch(`/api/jobs/${job.id}`, { method:'DELETE' }); if (!r.ok) throw new Error('Could not cancel extraction.'); setJob(j => j ? { ...j,status:'cancelled' } : null); } catch (e) { setError((e as Error).message); } }}>Cancel extraction</Button>}</div></div> : <CatalogueView key={catalogue.createdAt} catalogue={catalogue} onReset={() => { inputRef.current?.focus(); window.scrollTo({ top:0,behavior:'smooth' }); }}/>} 
        <p className="catalogue-caption"><Info size={14}/>{catalogue.kind === 'fixture' ? 'Fixture / sample. Every component above is hand-made to demonstrate the catalogue.' : 'Real extraction output. Heuristic grouping and visual captures; review before reuse.'}</p>
      </section>
      <section className="how-section" id="how-it-works"><div className="section-intro"><span className="kicker">Behind the catalogue</span><h2>One page in.<br/>The pieces, laid out.</h2><p>No manual picking. No new visual identity.<br/>Just a closer look at what is already there.</p></div><div className="process-grid">{[
        { n:'01', icon:Globe, title:'Render the page', text:'Open a public URL at desktop and mobile widths in a fresh browser.' },
        { n:'02', icon:Scan, title:'Find the patterns', text:'Look for semantic controls, repeated structures and computed visual styles.' },
        { n:'03', icon:Stack, title:'Capture what exists', text:'Separate visual variants. Record hover and focus only when a change is observed.' },
        { n:'04', icon:Code, title:'Inspect and take away', text:'Explore isolated previews and export appearance captures as React or HTML + CSS.' },
      ].map(item => <article className="process-step" key={item.n}><div><item.icon size={21}/><span>{item.n}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>
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
