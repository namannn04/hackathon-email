import type { Metadata } from 'next';
import { AuthProvider } from '@/app/components/auth-provider';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_ORIGIN ?? 'http://localhost:3000'),
  title: 'Relay — Hackathon outreach without the spreadsheet shuffle',
  description:
    'Create event mail tasks and let authorized volunteers send one Gmail message per BCC recipient set.',
  openGraph: {
    title: 'Relay',
    description: 'Hackathon outreach, without the spreadsheet shuffle.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Relay event mail tasks and send progress' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Relay',
    description: 'Hackathon outreach, without the spreadsheet shuffle.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
