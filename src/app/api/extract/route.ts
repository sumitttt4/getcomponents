import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { parsePublicUrl } from '@/lib/network';
import { extractCatalogue } from '@/lib/extractor';
import { serialiseCatalogueResult } from '@/lib/stream';
export const runtime='nodejs';
export const maxDuration=120;
export const dynamic='force-dynamic';
const shared=globalThis as unknown as {unpackActive?:boolean;unpackStarts?:number[]};
export async function POST(request:Request) {
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin) return NextResponse.json({error:'Cross-origin requests are not supported.'},{status:403});
  if(Number(request.headers.get('content-length')||0)>3000) return NextResponse.json({error:'Request too large.'},{status:413});
  let url:string;
  try {
    const raw=await request.text();
    if(raw.length>3000) return NextResponse.json({error:'Request too large.'},{status:413});
    const data=JSON.parse(raw);
    if(typeof data.url!=='string') throw new Error('Enter a public website URL.');
    url=parsePublicUrl(data.url).toString();
  } catch(error) { return NextResponse.json({error:error instanceof SyntaxError?'Invalid request body.':(error as Error).message},{status:400}); }
  const starts=shared.unpackStarts??=[];
  while(starts.length&&starts[0]<Date.now()-3600000) starts.shift();
  if(shared.unpackActive||starts.length>=10) return NextResponse.json({error:shared.unpackActive?'An extraction is already running on this instance. Try again shortly.':'This instance has reached its hourly extraction limit.'},{status:429});
  shared.unpackActive=true;starts.push(Date.now());
  const abort=new AbortController();
  const onAbort=()=>abort.abort();request.signal.addEventListener('abort',onAbort,{once:true});
  const encoder=new TextEncoder();
  const body=new ReadableStream<Uint8Array>({
    start(controller) {
      const emit=(line:string)=>{if(!abort.signal.aborted) controller.enqueue(encoder.encode(line));};
      emit(JSON.stringify({type:'progress',stage:'Preparing extraction',progress:1})+'\n');
      void(async()=>{
        try {
          const catalogue=await extractCatalogue(url,(stage,progress)=>emit(JSON.stringify({type:'progress',stage,progress})+'\n'),abort.signal);
          emit(serialiseCatalogueResult(randomUUID(),catalogue));
        } catch(error) {
          let message=error instanceof Error?error.message:'Extraction failed.';
          if(/Executable doesn't exist/.test(message)) message='The browser runtime could not be found on this server.';
          if(/ERR_BLOCKED_BY_CLIENT|ERR_FAILED/.test(message)) message='The isolated renderer could not load this page. The site or server network may prevent access.';
          emit(JSON.stringify({type:'error',error:message.slice(0,400)})+'\n');
        } finally {
          shared.unpackActive=false;request.signal.removeEventListener('abort',onAbort);
          if(!abort.signal.aborted) controller.close();
        }
      })();
    },
    cancel(){abort.abort();},
  });
  return new Response(body,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff'}});
}
