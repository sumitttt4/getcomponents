import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';
export const metadata: Metadata = {
  title: 'Unpack — a website, in its smallest parts',
  description: 'An early experiment that turns a public website into an inspectable catalogue of its reusable UI components, visual variants and standalone code.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><Providers><div id="app">{children}</div></Providers></body></html>;
}
