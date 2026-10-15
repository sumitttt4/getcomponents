import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractCatalogue } from './extractor';
import type { Job } from './types';

const directory = path.join(process.cwd(), '.data', 'jobs');
const globals = globalThis as unknown as { unpackJobs?: Map<string, Job>; unpackControllers?: Map<string, AbortController>; unpackRun?: string; unpackStarts?: number[] };
const jobs = globals.unpackJobs ??= new Map();
const controllers = globals.unpackControllers ??= new Map();
const starts = globals.unpackStarts ??= [];
const filename = (id: string) => path.join(directory, `${id}.json`);
export const validJobId = (id: string) => /^[a-f0-9-]{36}$/.test(id);

async function persist(job: Job) {
  await fs.mkdir(directory, { recursive: true });
  const temp = `${filename(job.id)}.tmp`;
  await fs.writeFile(temp, JSON.stringify(job), { mode: 0o600 });
  await fs.rename(temp, filename(job.id));
}
export async function createJob(): Promise<Job> {
  if (globals.unpackRun) throw new Error('An extraction is already running. Please try again shortly.');
  const now = Date.now();
  while (starts.length && starts[0] < now - 3600000) starts.shift();
  if (starts.length >= 10) throw new Error('This server has reached its 10 extractions per hour limit. Please try again later.');
  starts.push(now);
  const job: Job = { id: randomUUID(), status: 'queued', stage: 'Preparing extraction', progress: 0, createdAt: new Date().toISOString() };
  globals.unpackRun = job.id;
  jobs.set(job.id, job);
  try { await persist(job); }
  catch (error) { globals.unpackRun = undefined; jobs.delete(job.id); throw error; }
  // Keep only a bounded, short-lived catalogue cache.
  for (const [id, stored] of jobs) if (Date.now() - Date.parse(stored.createdAt) > 86400000) jobs.delete(id);
  const files = await fs.readdir(directory);
  const retained: { file: string; time: number }[] = [];
  for (const file of files.filter(f => f.endsWith('.json'))) {
    const info = await fs.stat(path.join(directory,file));
    if (now - info.mtimeMs > 86400000) await fs.unlink(path.join(directory,file));
    else retained.push({file,time:info.mtimeMs});
  }
  for (const {file} of retained.sort((a,b)=>b.time-a.time).slice(20)) { await fs.unlink(path.join(directory,file)); jobs.delete(file.replace('.json','')); }
  return job;
}
export async function runJob(job: Job, url: string) {
  if (job.status === 'cancelled') { globals.unpackRun = undefined; return; }
  const controller = new AbortController(); controllers.set(job.id,controller);
  job.status = 'running';
  try {
    const result = await extractCatalogue(url, (stage, progress) => { job.stage = stage; job.progress = progress; }, controller.signal);
    if (!controller.signal.aborted) { job.result = result; job.status = 'complete'; job.stage = 'Catalogue ready'; job.progress = 100; }
  } catch (error) {
    job.status = controller.signal.aborted ? 'cancelled' : 'failed';
    job.error = error instanceof Error ? error.message.slice(0,300) : 'Extraction failed.';
    if (/Executable doesn't exist/.test(job.error)) job.error = 'The rendering browser is not installed on this server. Run npm run browsers in the project, then try again.';
    if (/ERR_BLOCKED_BY_CLIENT|ERR_FAILED/.test(job.error)) job.error = 'This page could not be loaded through the isolated network renderer. It may block automation, or the network proxy may refuse IP-pinned connections.';
    job.stage = job.status === 'cancelled' ? 'Extraction cancelled' : 'Extraction failed';
  } finally { controllers.delete(job.id); globals.unpackRun = undefined; await persist(job); }
}
export async function getJob(id: string): Promise<Job | null> {
  if (!validJobId(id)) return null;
  let job = jobs.get(id);
  if (!job) {
    try { job = JSON.parse(await fs.readFile(filename(id), 'utf8')) as Job; } catch { return null; }
    if (['queued','running'].includes(job.status)) { job.status = 'failed'; job.error = 'The server restarted before extraction finished. Please retry.'; }
  }
  return Date.now() - Date.parse(job.createdAt) > 86400000 ? null : job;
}
export async function cancelJob(id: string): Promise<Job | null> {
  const job = await getJob(id); if (!job) return null;
  if (['queued','running'].includes(job.status)) { job.status = 'cancelled'; job.stage = 'Extraction cancelled'; controllers.get(id)?.abort(); await persist(job); }
  return job;
}
