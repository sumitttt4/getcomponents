import { ArrowUpRight, Code, Cursor, Globe, SquaresFour } from '@phosphor-icons/react';

export function LandingDiagram() {
  return <div className="landing-diagram" aria-label="Illustration: one website becomes a component catalogue">
    <div className="diagram-caption"><span><span className="status-dot"/>A little less mystery</span><span>Illustrative sample</span></div>
    <div className="diagram-stage">
      <svg className="diagram-connectors" viewBox="0 0 480 320" fill="none" aria-hidden="true"><path d="M180 108H223Q240 108 240 90V80Q240 65 260 65H302M180 180H302M180 246H222Q240 246 240 266Q240 283 260 283H302" stroke="currentColor" strokeWidth="1" strokeDasharray="3 5"/><circle cx="240" cy="180" r="13" fill="var(--paper)" stroke="var(--line)"/><path d="m236 180 8 0m-3-3 3 3-3 3" stroke="var(--ink)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <div className="diagram-source"><div className="mini-browser-bar"><Globe size={12}/><span>your-site.com</span><ArrowUpRight size={11}/></div><div className="mini-source-body"><div className="mini-source-nav"><span/><i/><i/></div><div className="mini-source-title"/><div className="mini-source-title short"/><div className="mini-source-lines"><i/><i/></div><div className="mini-source-button"/><div className="mini-source-grid"><i/><i/><i/><i/></div></div><span className="diagram-tag">01 / The website</span></div>
      <div className="diagram-result result-button"><div className="mini-result-meta"><Cursor size={12}/><span>Button</span><span>.01</span></div><span className="mini-live-button">Get started <ArrowUpRight size={12}/></span></div>
      <div className="diagram-result result-card"><div className="mini-result-meta"><SquaresFour size={12}/><span>Card</span><span>.02</span></div><div className="mini-live-card"><span className="mini-card-symbol"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg></span><div><b>A good starting point</b><small>Every detail, considered.</small></div></div></div>
      <div className="diagram-result result-code"><div className="mini-result-meta"><Code size={12}/><span>Source-faithful values</span></div><code><span>border-radius:</span> 8px;<br/><span>font-weight:</span> 600;</code></div>
    </div>
    <div className="diagram-bottom"><span>One page in.</span><span>The pieces, laid out. <ArrowUpRight size={12}/></span></div>
  </div>;
}
