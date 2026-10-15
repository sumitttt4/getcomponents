import type { Catalogue } from './types';
export type ExtractionEvent = { type:'progress'; stage:string; progress:number } | { type:'result'; id:string; catalogue:Catalogue } | { type:'error'; error:string };
export async function* readExtractionStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ExtractionEvent> {
  const reader=body.getReader(), decoder=new TextDecoder(); let buffer='';
  try {
    while(true) {
      const {value,done}=await reader.read(); buffer+=decoder.decode(value,{stream:!done});
      if(buffer.length>4_000_000) throw new Error('The extraction response exceeded its size limit.');
      let newline:number;
      while((newline=buffer.indexOf('\n'))>=0) { const line=buffer.slice(0,newline).trim(); buffer=buffer.slice(newline+1); if(line) yield JSON.parse(line) as ExtractionEvent; }
      if(done) { if(buffer.trim()) yield JSON.parse(buffer) as ExtractionEvent; break; }
    }
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}
// Reserve space below Vercel's 4.5 MB response limit for progress and headers.
export function serialiseCatalogueResult(id:string,catalogue:Catalogue):string {
  const maximum=3_750_000;
  let result=JSON.stringify({type:'result',id,catalogue});
  if(Buffer.byteLength(result)>maximum) {
    for(const entry of catalogue.components) for(const snapshot of entry.snapshots) delete snapshot.screenshot;
    catalogue.warnings.push('Source screenshots were omitted to keep the catalogue within the hosting response limit.');
    result=JSON.stringify({type:'result',id,catalogue});
  }
  if(Buffer.byteLength(result)>maximum) throw new Error('This page produced a catalogue too large to return. Try a smaller page.');
  return result+'\n';
}
