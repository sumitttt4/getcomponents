import type { ComponentEntry, Snapshot } from './types';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// Extracted documents never receive script, network, navigation or form privileges.
export function previewDocument(snapshot: Snapshot): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;min-height:100%;background:${snapshot.background}}body{box-sizing:border-box;padding:24px;display:flex;align-items:center;justify-content:center}*,*::before,*::after{box-sizing:border-box}${snapshot.css}</style></head><body>${snapshot.html}</body></html>`;
}

export function exportReact(component: ComponentEntry, selected?: Snapshot): string {
  const variant = selected?.variant ?? component.snapshots[0].variant;
  const captures = component.snapshots.filter(s => s.variant === variant);
  const base = captures.find(s => s.viewport === 'desktop' && s.state === 'default') ?? captures[0];
  const namespace = `unpack-${component.id.replace(/[^a-z0-9-]/gi,'')}-${variant.replace(/[^a-z0-9]/gi,'')}`;
  const css = [...captures].sort((a,b) => Number(a.viewport === 'mobile') - Number(b.viewport === 'mobile')).map(s => {
    const scope = `.${namespace}${s.state === 'default' ? '' : s.state === 'focus' ? ':focus-within' : ':hover'}`;
    const scoped = s.css.replace(/\.u(\d+)(?![\w-])/g, `${scope} .u$1`);
    return s.viewport === 'mobile' ? `@media(max-width:640px){${scoped}}` : scoped;
  }).join('\n');
  return `import type { CSSProperties } from 'react';\n\n// Source: ${component.name.replace(/[\r\n]/g, ' ')}\n// Appearance capture only. Original application logic and licensed assets are not included.\n// Review semantics and add your own interaction handlers before use.\nconst html = ${JSON.stringify(base.html)};\nconst css = ${JSON.stringify(css)};\n\nexport default function ExtractedComponent({ style }: { style?: CSSProperties }) {\n  return <div className="${namespace}" style={{ display: 'inline-block', ...style }}>\n    <style>{css}</style>\n    <div dangerouslySetInnerHTML={{ __html: html }} />\n  </div>;\n}\n`;
}

export function exportHtml(component: ComponentEntry, snapshot?: Snapshot): string {
  return previewDocument(snapshot ?? component.snapshots[0]);
}
