import { NextResponse } from 'next/server';
import { getJob, cancelJob } from '@/lib/jobs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const job = await getJob((await params).id);
  return job ? NextResponse.json(job, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'This catalogue was not found or has expired.' }, { status: 404 });
}
export async function DELETE(request: Request, { params }: Context) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Cross-origin requests are not supported.' }, { status: 403 });
  const job = await cancelJob((await params).id);
  return job ? NextResponse.json({ status: job.status }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
}
