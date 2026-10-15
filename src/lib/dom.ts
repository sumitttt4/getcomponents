// This function runs inside the untrusted page. It reads DOM data only.
export function discoverComponents() {
  const nodes = [...document.querySelectorAll('button,a,input,textarea,select,nav,[role="button"],[role="tab"],[role="navigation"],article,[class*="card"],[class*="badge"],[class*="chip"]')].slice(0, 2500);
  const candidates: { index: number; name: string; category: string; structure: string; signature: string; semantic: boolean }[] = [];
  let index = 0;
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    if (rect.width < 12 || rect.height < 10 || rect.width > 1400 || rect.height > 600 || rect.top > 5000 || style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const tag = node.tagName.toLowerCase();
    const role = node.getAttribute('role');
    const category = tag === 'nav' || role === 'navigation' ? 'Navigation'
      : ['input', 'textarea', 'select'].includes(tag) ? 'Inputs'
      : tag === 'button' || role === 'button' || role === 'tab' || tag === 'a' && (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(style.paddingLeft) > 8) ? 'Buttons'
      : tag === 'article' || /card/i.test(node.className) ? 'Cards'
      : /badge|chip/i.test(node.className) ? 'Badges' : 'Other';
    if (category === 'Other' && tag === 'a' && !node.closest('nav')) continue;
    const structure = `${category}:${tag}:${[...node.children].slice(0, 8).map(c => c.tagName.toLowerCase()).join(',')}`;
    const signature = [style.color, style.backgroundColor, style.border, style.borderRadius, style.padding, style.fontSize, style.fontWeight, style.display, style.boxShadow].join('|');
    node.setAttribute('data-unpack-id', String(index));
    candidates.push({ index, category, structure, signature,
      name: (node.getAttribute('aria-label') || node.textContent || node.getAttribute('placeholder') || tag).replace(/\s+/g, ' ').trim().slice(0, 64) || tag,
      semantic: !!role || ['button','input','textarea','select','nav','article'].includes(tag),
    });
    index++;
    if (index >= 160) break;
  }
  return { candidates, title: document.title };
}

export function captureComponent(index: number) {
  const root = document.querySelector(`[data-unpack-id="${index}"]`);
  if (!(root instanceof HTMLElement)) throw new Error('The component was removed by the source page.');
  const properties = ['display','position','width','height','min-width','max-width','min-height','max-height','box-sizing','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','color','background-color','border-top','border-right','border-bottom','border-left','border-radius','box-shadow','font-family','font-size','font-weight','font-style','line-height','text-align','text-decoration','text-transform','white-space','word-break','overflow-wrap','letter-spacing','align-items','align-content','align-self','justify-content','justify-items','gap','row-gap','column-gap','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','grid-template-columns','grid-template-rows','grid-column','grid-row','overflow','opacity','vertical-align','cursor','outline','outline-offset','transform','object-fit','aspect-ratio','fill','stroke','stroke-width'];
  const allowed = new Set(['div','span','p','button','a','input','textarea','select','option','label','nav','ul','ol','li','article','section','header','footer','main','h1','h2','h3','h4','h5','h6','strong','b','em','i','small','code','pre','br','hr','svg','path','circle','rect','line','polyline','polygon','ellipse','g','defs','clippath','mask','title','summary','details']);
  const attributes = new Set(['type','placeholder','disabled','checked','selected','multiple','min','max','step','rows','cols','role','aria-label','aria-checked','aria-expanded','aria-disabled','aria-selected','viewBox','d','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','cx','cy','r','x','y','x1','x2','y1','y2','width','height','points','rx','ry','transform','xmlns','fill-rule','clip-rule']);

  const css: string[] = [];
  const notes = new Set<string>();
  let count = 0;
  const helpers = {
    escape(value: string) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!); },
    safe(value: string) { return !/[<>@]|url\s*\(|expression\s*\(|javascript|behavior\s*:/i.test(value); },
    serialize(node: Node, depth = 0): string {
    if (node.nodeType === Node.TEXT_NODE) return helpers.escape((node.textContent || '').slice(0, 3000));
    if (!(node instanceof Element) || depth > 12) return '';
    if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','TEMPLATE','CANVAS','VIDEO','AUDIO'].includes(node.tagName)) { notes.add('Scripts, embeds and media are omitted.'); return ''; }
    if (node.tagName === 'IMG') { notes.add('External images are omitted; asset permissions are not inferred.'); return `<span>${helpers.escape(node.getAttribute('alt') || '[image]')}</span>`; }
    if (count >= 100) { notes.add('The component was truncated at 100 elements.'); return ''; }
    const tag = allowed.has(node.tagName.toLowerCase()) ? node.tagName.toLowerCase() : 'div';
    const cls = `u${count++}`;
    const style = getComputedStyle(node);
    const rules: string[] = [];
    for (const property of properties) {
      let value = style.getPropertyValue(property);
      if (property === 'position' && node === root) value = 'relative';
      if (property.startsWith('margin') && node === root) value = '0px';
      if (property === 'transform') value = 'none';
      if (value && helpers.safe(value)) rules.push(`${property}:${value}`);
    }
    css.push(`.${cls}{${rules.join(';')}}`);
    for (const pseudo of ['::before','::after']) {
      const ps = getComputedStyle(node, pseudo);
      const content = ps.content;
      if (content && !['none','normal','""','\'\''].includes(content) && helpers.safe(content)) {
        const declarations = properties.map(p => `${p}:${ps.getPropertyValue(p)}`).filter(helpers.safe);
        css.push(`.${cls}${pseudo}{content:${content};${declarations.join(';')}}`);
      }
    }
    const attrs: string[] = [`class="${cls}"`];
    for (const attr of node.attributes) {
      if (attributes.has(attr.name) && helpers.safe(attr.value)) attrs.push(`${attr.name}="${helpers.escape(attr.value)}"`);
    }
    if (tag === 'a') attrs.push('tabindex="0"');
    if (tag === 'button') { const type = attrs.findIndex(a => a.startsWith('type=')); if (type >= 0) attrs.splice(type,1); attrs.push('type="button"'); }
    if (tag === 'input') { const type = (node as HTMLInputElement).type; if (!['text','email','search','number','checkbox','radio','range','password','url','tel'].includes(type)) { const i = attrs.findIndex(a => a.startsWith('type=')); if (i >= 0) attrs.splice(i,1); attrs.push('type="text"'); } }
    if (['input','br','hr'].includes(tag)) return `<${tag} ${attrs.join(' ')}>`;
    return `<${tag} ${attrs.join(' ')}>${[...node.childNodes].map(child => helpers.serialize(child, depth + 1)).join('')}</${tag}>`;
  }
  };
  const html = helpers.serialize(root);
  let background = 'rgb(255, 255, 255)';
  for (let node = root.parentElement; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { background = color; break; }
  }
  if (!helpers.safe(background)) background = 'white';
  const rect = root.getBoundingClientRect();
  if (getComputedStyle(root).backgroundImage !== 'none') notes.add('Background images and gradients are not captured.');
  return { html, css: css.join('\n'), width: Math.ceil(rect.width), height: Math.ceil(rect.height), background, notes: [...notes] };
}
