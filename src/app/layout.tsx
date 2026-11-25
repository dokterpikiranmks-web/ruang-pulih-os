import type { Metadata, Viewport } from 'next';
import './globals.css';
import MetaPixel from '@/components/MetaPixel';

export const metadata: Metadata = {
  title: 'Ruang Pulih OS — Klinik Holistik & Totok Saraf Makassar',
  description: 'Clinical Acquisition, Multi-Agent Diagnostic & Retention Engine',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192x192.svg',
    apple: '/icons/icon-192x192.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ruang Pulih',
  },
};

export const viewport: Viewport = {
  themeColor: '#0D3B2E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-klinik-bg text-klinik-text antialiased">
        <MetaPixel />
        {children}
      </body>
    </html>
  );
}
