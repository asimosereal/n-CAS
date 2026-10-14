import type { Metadata } from 'next';
import Script from 'next/script';

import './globals.css';
import { winuiCss } from '@/winui';
import { schemeBootScript } from '@/lib/scheme';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'n-CAS — Student Classroom Attendance System',
  description:
    'Desktop attendance system: RFID identification, automatic PRESENT/LATE/ABSENT marking, class-break tracking, teacher review and manual override.',
  // The same mark the rail and the station header use, so the browser tab
  // carries the product rather than Next's default.
  icons: { icon: '/ncas-logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script writes data-ncas-scheme onto <html> before the first
    // paint, which React did not put there; the warning this suppresses is
    // about that one attribute and nothing else.
    <html lang="en" suppressHydrationWarning>
      {/*
        The scheme is decided here rather than in React because the WinUI token
        dictionaries read it as a selector, and a selector can only be in place
        before the stylesheet is applied. Deciding it in an effect instead would
        show a white flash on every navigation for anyone who has chosen dark.
      */}
      <Script id="ncas-scheme" strategy="beforeInteractive">
        {schemeBootScript}
      </Script>
      <body>
        {/*
          The WinUI layer. `winuiCss` is the 30 stylesheets under src/winui
          joined into one string in a fixed order, and it is the only global
          styling in the application: Fluent UI React v9 renders the controls,
          this string restyles them onto WinUI 3's own values.
        */}
        <style id="winui-layer" dangerouslySetInnerHTML={{ __html: winuiCss }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
