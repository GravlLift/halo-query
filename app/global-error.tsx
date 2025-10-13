'use client';

import { useEffect } from 'react';
import { appInsights } from '../lib/application-insights/client';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    appInsights.trackException({
      exception: error,
      properties: {
        digest: error.digest,
      },
    });
  }, [error]);
  return (
    <html>
      <body>
        <h2>
          Something went wrong, the development team has been notified. You can
          try reloading the page, or check back later if that doesn&apos;t work.
        </h2>
        <button
          type="button"
          onClick={() => {
            location.reload();
          }}
        >
          Reload
        </button>
        <div>
          <h3>Error Details</h3>
          <pre>{window.location.href}</pre>
          <pre>{error.stack}</pre>
        </div>
      </body>
    </html>
  );
}
