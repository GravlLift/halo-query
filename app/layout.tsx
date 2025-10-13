import { Metadata } from 'next';
import NextTopLoader from 'nextjs-toploader';
import './global.css';
import { LayoutClient } from './layout-client';
import { Providers } from './providers';
export const metadata: Metadata = {
  title: 'Halo Query',
  robots: { index: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <NextTopLoader showSpinner={false} />
        <Providers>
          <LayoutClient>{children}</LayoutClient>
        </Providers>
      </body>
    </html>
  );
}
