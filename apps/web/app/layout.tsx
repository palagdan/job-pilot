import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { parseTheme, themeAttribute, themeCookieName } from '../lib/theme/theme.ts';
import { Providers } from './providers.tsx';
import './styles/globals.css';

const heading = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700'],
  variable: '--font-heading',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'JobPilot',
  description: 'Your AI co-pilot for the whole job search',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(themeCookieName)?.value);

  return (
    <html lang="en" data-theme={themeAttribute(theme)} className={`${heading.variable} ${body.variable}`}>
      <body>
        <Providers theme={theme}>{children}</Providers>
      </body>
    </html>
  );
}
