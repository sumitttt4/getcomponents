import test from 'node:test';
import assert from 'node:assert/strict';
import { readExtractionStream, serialiseCatalogueResult } from '../src/lib/stream';
import { fixtureCatalogue } from '../src/fixtures/catalogue';
import { POST } from '../src/app/api/extract/route';
import dns from 'node:dns/promises';

test('stream reader handles split JSON records and multibyte UTF-8 characters',async()=>{
  const source=new TextEncoder().encode(JSON.stringify({type:'progress',stage:'Rendering → page',progress:20})+'\n'+JSON.stringify({type:'error',error:'No components'})+'\n');
  const stream=new ReadableStream<Uint8Array>({start(controller){for(let i=0;i<source.length;i+=3)controller.enqueue(source.slice(i,i+3));controller.close();}});
  const events=[];for await(const event of readExtractionStream(stream))events.push(event);
  assert.deepEqual(events,[{type:'progress',stage:'Rendering → page',progress:20},{type:'error',error:'No components'}]);
});
test('stream reader cancels underlying work when a consumer stops',async()=>{
  let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('{"type":"progress","stage":"Opening","progress":5}\n'));},cancel(){cancelled=true;}});
  for await(const event of readExtractionStream(stream)){assert.equal(event.type,'progress');break;}
  assert.equal(cancelled,true);
});
test('oversized screenshots are removed with an explicit warning before sending a result',()=>{
  const result=structuredClone(fixtureCatalogue);
  result.components[0].snapshots[0].screenshot='x'.repeat(3_800_000);
  const line=serialiseCatalogueResult('test',result);
  assert.ok(Buffer.byteLength(line)<3_750_000);
  assert.ok(result.warnings.some(w=>w.includes('screenshots were omitted')));
  assert.equal(result.components[0].snapshots[0].screenshot,undefined);
});
test('oversized CSS fails instead of returning a truncated or fixture catalogue',()=>{
  const result=structuredClone(fixtureCatalogue);
  result.components[0].snapshots[0].css='x'.repeat(3_800_000);
  assert.throws(()=>serialiseCatalogueResult('test',result),/too large/);
});
test('extract endpoint rejects private URLs and cross-origin requests before rendering',async()=>{
  const privateResponse=await POST(new Request('https://unpack.example/api/extract',{method:'POST',body:JSON.stringify({url:'http://169.254.169.254/'})}));
  assert.equal(privateResponse.status,400);
  assert.match((await privateResponse.json()).error,/blocked/);
  const crossOrigin=await POST(new Request('https://unpack.example/api/extract',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}));
  assert.equal(crossOrigin.status,403);
});

test('a real renderer failure streams an error and never substitutes fixture output',async(t)=>{
  t.mock.method(dns,'lookup',async()=>{throw new Error('Controlled DNS failure');});
  const response=await POST(new Request('https://unpack.example/api/extract',{method:'POST',body:JSON.stringify({url:'https://owned-test.example/'})}));
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type')||'',/application\/x-ndjson/);
  const events=[];for await(const event of readExtractionStream(response.body!))events.push(event);
  assert.ok(events.some(event=>event.type==='progress'));
  assert.ok(events.some(event=>event.type==='error'));
  assert.equal(events.some(event=>event.type==='result'),false);
});
