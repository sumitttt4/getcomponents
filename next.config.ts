import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['playwright', 'playwright-core', 'pngjs'],
  poweredByHeader: false,
  async headers() { return [{ source: '/(.*)', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-Frame-Options', value: 'DENY' },
  ] }]; },
};
export default config;
