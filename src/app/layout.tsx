import type { Metadata } from 'next';

import './globals.css';
import { winuiCss } from '@/winui';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'n-CAS — Student Classroom Attendance System',
  description:
    'Desktop attendance system: RFID identification, automatic PRESENT/LATE/ABSENT marking, class-break tracking, teacher review and manual override.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
