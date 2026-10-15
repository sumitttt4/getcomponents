import { after, NextResponse } from 'next/server';
import { parsePublicUrl } from '@/lib/network';
import { createJob, runJob } from '@/lib/jobs';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Cross-origin requests are not supported.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 3000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  try {
    const raw = await request.text();
    if (raw.length > 3000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    const data = JSON.parse(raw);
    if (typeof data.url !== 'string') throw new Error('Enter a public website URL.');
    const url = parsePublicUrl(data.url).toString();
    const job = await createJob();
    after(() => runJob(job, url));
    return NextResponse.json({ id: job.id }, { status: 202 });
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Invalid request body.' : error instanceof Error ? error.message : 'Could not start extraction.';
    return NextResponse.json({ error: message }, { status: /running|limit/.test(message) ? 429 : 400 });
  }
}
