import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import zlib from 'node:zlib';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address: string): boolean {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch { return false; }
}

export function parsePublicUrl(input: string): URL {
  if (input.length > 2048) throw new Error('The URL is too long.');
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Enter a complete public URL, including https://.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https pages are supported.');
  if (url.username || url.password) throw new Error('URLs containing credentials are not supported.');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Only standard web ports are supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(localhost|local|internal|home|lan)$/.test(host) || !host.includes('.') && !host.includes(':')) throw new Error('Use a public website, not a local or internal address.');
  if (ipaddr.isValid(host) && !isPublicAddress(host)) throw new Error('Private, reserved and metadata addresses are blocked.');
  url.hash = '';
  return url;
}

export async function resolvePublicUrl(input: string): Promise<{ url: URL; address: string; family: number }> {
  const url = parsePublicUrl(input);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const records = ipaddr.isValid(host) ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }] : await Promise.race([
    dns.lookup(host, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DNS lookup timed out.')), 4000).unref()),
  ]);
  if (!records.length || records.some(r => !isPublicAddress(r.address))) throw new Error('The site resolves to a private or reserved address.');
  const selected = records.find(r => r.family === 4) ?? records[0];
  return { url, ...selected };
}

export interface NetworkBudget { requests: number; bytes: number; blocked: number; }
const MAX_RESPONSE = 4 * 1024 * 1024;
const MAX_TOTAL = 24 * 1024 * 1024;

// DNS is resolved and checked once, then the connection is pinned to that IP.
// When a trusted operator proxy is configured, CONNECT also targets the checked IP.
// Redirects are returned to Chromium and intercepted again before the next hop.
export async function fetchPublic(input: string, budget: NetworkBudget): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  if (++budget.requests > 160) throw new Error('The page exceeded the 160-request limit.');
  if (budget.bytes > MAX_TOTAL) throw new Error('The page exceeded the 24 MB download limit.');
  const { url, address, family } = await resolvePublicUrl(input);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const proxyValue = url.protocol === 'https:' ? process.env.HTTPS_PROXY : process.env.HTTP_PROXY;
  const proxy = proxyValue ? new URL(proxyValue) : null;
  let tunnel: tls.TLSSocket | undefined;
  const agent = url.protocol === 'https:' ? new https.Agent({ keepAlive: false }) : new http.Agent({ keepAlive: false });
  if (proxy && url.protocol === 'https:') {
    tunnel = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const auth = proxy.username ? 'Basic ' + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64') : undefined;
      const connect = (proxy.protocol === 'https:' ? https : http).request({
        hostname: proxy.hostname, port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80), method: 'CONNECT',
        path: `${family === 6 ? `[${address}]` : address}:${port}`, agent: false,
        headers: { Host: `${address}:${port}`, ...(auth ? { 'Proxy-Authorization': auth } : {}) },
      });
      connect.setTimeout(8000, () => connect.destroy(new Error('Proxy connection timed out.')));
      connect.on('error', reject);
      connect.on('connect', (response, socket) => {
        if (response.statusCode !== 200) { socket.destroy(); reject(new Error(`The network proxy refused a pinned connection (${response.statusCode}).`)); return; }
        const secure = tls.connect({ socket, servername: url.hostname, rejectUnauthorized: true });
        secure.setTimeout(8000, () => secure.destroy(new Error('TLS connection timed out.')));
        secure.once('secureConnect', () => resolve(secure));
        secure.once('error', reject);
      });
      connect.end();
    });
    (agent as https.Agent).createConnection = () => tunnel!;
  }
  try {
    return await new Promise((resolve, reject) => {
      const usingHttpProxy = proxy && url.protocol === 'http:';
      const request = (usingHttpProxy ? (proxy.protocol === 'https:' ? https : http) : url.protocol === 'https:' ? https : http).request({
        hostname: usingHttpProxy ? proxy.hostname : url.hostname,
        port: usingHttpProxy ? proxy.port || 80 : port,
        path: usingHttpProxy ? `http://${family === 6 ? `[${address}]` : address}:${port}${url.pathname}${url.search}` : `${url.pathname}${url.search}`,
        method: 'GET', agent: usingHttpProxy ? false : agent,
        lookup: ((_hostname: string, options: { all?: boolean }, callback: (error: Error | null, addresses: unknown, family?: number) => void) => options.all ? callback(null, [{ address, family }]) : callback(null, address, family)) as never,
        headers: { Host: url.host, 'User-Agent': 'Mozilla/5.0 Unpack/0.1 (component research)', Accept: '*/*', 'Accept-Encoding': 'identity', 'Accept-Language': 'en-US,en;q=0.9' },
      }, response => {
        let bytes = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length; budget.bytes += chunk.length;
          if (bytes > MAX_RESPONSE || budget.bytes > MAX_TOTAL) { response.destroy(new Error('The page exceeded the download size limit.')); return; }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            let body: Buffer = Buffer.concat(chunks);
            const encoding = response.headers['content-encoding'];
            const opts = { maxOutputLength: MAX_RESPONSE };
            if (encoding === 'gzip') body = zlib.gunzipSync(body, opts);
            else if (encoding === 'br') body = zlib.brotliDecompressSync(body, opts);
            else if (encoding === 'deflate') body = zlib.inflateSync(body, opts);
            const headers: Record<string, string> = {};
            for (const key of ['content-type', 'location', 'access-control-allow-origin']) {
              const value = response.headers[key]; if (typeof value === 'string') headers[key] = value;
            }
            resolve({ status: response.statusCode ?? 502, headers, body });
          } catch (error) { reject(error); }
        });
      });
      request.setTimeout(10000, () => request.destroy(new Error('The website did not respond within 10 seconds.')));
      const deadline = setTimeout(() => request.destroy(new Error('The request exceeded its 12-second limit.')), 12000);
      request.once('close', () => clearTimeout(deadline));
      request.on('error', reject);
      request.end();
    });
  } finally { tunnel?.destroy(); agent.destroy(); }
}
