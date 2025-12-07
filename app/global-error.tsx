'use client';

import { useEffect, useMemo, useState } from 'react';
import { isUnloading } from '../lib/unload';

// NOTE:
// global-error.tsx is NOT wrapped by app/layout.tsx. We must render our own
// <html> and <body>, and we should not rely on any Providers (e.g., Chakra).
// We also deliberately restore browser default styles so this page doesn’t
// inherit the app’s global.css or CSS resets.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const [currentUrl, setCurrentUrl] = useState<string>('');

  // Capture URL on the client only (avoid window access during SSR)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentUrl(window.location.href);
    }
  }, []);

  // Telemetry (client-only)
  useEffect(() => {
    if (isUnloading) return; // skip noisy teardown exceptions
    import('../lib/application-insights/client').then(({ appInsights }) => {
      appInsights.trackException({
        exception: error,
        properties: {
          digest: error.digest,
        },
      });
    });
  }, [error]);

  // Minimal CSS to restore browser defaults and ensure readable layout.
  // We use `all: revert` to drop previously-applied global styles/resets.
  const resetCss = useMemo(
    () => `
      :root { color-scheme: light; }
      html, body { all: revert; }
      body {
        margin: 16px;
        background: #ffffff;
        color: #000000;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell,
          Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        line-height: 1.5;
      }
      *, *::before, *::after { box-sizing: border-box; }
      h1, h2, h3 { margin: 0 0 0.5rem; }
      p { margin: 0 0 1rem; }
      button {
        all: revert;
        padding: 0.5rem 0.75rem;
        border: 1px solid #ccc;
        border-radius: 6px;
        background: #f6f8fa;
        cursor: pointer;
      }
      button:hover { background: #eef1f4; }
      pre {
        all: revert;
        display: block;
        padding: 0.75rem;
        border: 1px solid #eee;
        border-radius: 6px;
        background: #fafafa;
        max-width: 100%;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .container { max-width: 800px; margin: 0 auto; }
      .spaced { margin-top: 1rem; }
    `,
    []
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Halo Query</title>
        <style dangerouslySetInnerHTML={{ __html: resetCss }} />
      </head>
      <body>
        <main className="container">
          <h2 style={{ fontSize: 'larger', fontWeight: 'bold' }}>
            Something went wrong
          </h2>
          <p>
            The development team has been notified. You can try reloading the
            page, or check back later if that doesn&apos;t work.
          </p>
          <div className="spaced">
            <button type="button" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
          <section className="spaced">
            <h3>Error Details</h3>
            {currentUrl && <pre>{currentUrl}</pre>}
            {error?.stack && <pre>{error.stack}</pre>}
            {error?.digest && <pre>Digest: {error.digest}</pre>}
          </section>
        </main>
      </body>
    </html>
  );
}
