import { ConstantBackoff, handleResultType, retry } from 'cockatiel';
import { remapUrlForProxy } from '../clients/fetcher';
import { appInsights } from '../application-insights/client';

export const vercelResponsePolicy = retry(
  handleResultType(
    Response,
    (res) => res.headers.get('x-vercel-mitigated') === 'challenge'
  ),
  {
    maxAttempts: 2,
    backoff: new ConstantBackoff(0),
  }
);

let solvingPromise: Promise<boolean> | null = null;

vercelResponsePolicy.onFailure(async ({ reason }) => {
  if ('value' in reason && reason.value instanceof Response) {
    try {
      const responseUrl = remapUrlForProxy(reason.value.url);
      const sameOrigin =
        new URL(responseUrl, location.href).origin === location.origin;

      if (sameOrigin) {
        if (!solvingPromise) {
          let html: string | undefined;
          try {
            html = await reason.value.clone().text();
          } catch {}
          solvingPromise = ensureVercelChallengeSolved({
            url: responseUrl,
            html,
            timeoutMs: 12000,
          })
            .catch(() => false)
            .finally(() => {
              solvingPromise = null;
            });
        }
        const solved = await solvingPromise;
        if (solved) {
          appInsights.trackEvent({
            name: 'VercelChallengeSolved',
            properties: { url: responseUrl },
          });
          // Allow policy's automatic retry without reload.
          return;
        }
      }

      const params = new URLSearchParams(location.search);
      if (!params.has('force-reload')) {
        params.set('force-reload', '1');
        location.search = params.toString();
      } else {
        console.error(
          'Vercel challenge could not be satisfied silently; manual refresh may be required.'
        );
      }
    } catch (err) {
      console.error('Error during Vercel challenge handling:', err);
      const params = new URLSearchParams(location.search);
      if (!params.has('force-reload')) {
        params.set('force-reload', '1');
        location.search = params.toString();
      }
    }
  }
});

function ensureVercelChallengeSolved(args: {
  url: string;
  html?: string;
  timeoutMs: number;
}): Promise<boolean> {
  const { url, html, timeoutMs } = args;
  const beforeCookies = parseCookies(document.cookie);
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.left = '0';
    iframe.style.bottom = '0';
    iframe.style.opacity = '0.01';
    iframe.setAttribute('aria-hidden', 'true');
    if (html && supportsSrcDoc()) {
      const content = injectBaseHref(html, url);
      if (!assignSrcdoc(iframe, content)) {
        // If Trusted Types or CSP blocks srcdoc assignment, fall back to URL navigation.
        iframe.src = url;
      }
    } else {
      iframe.src = url;
    }

    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      try {
        iframe.remove();
      } catch {}
      resolve(ok);
    };

    const start = Date.now();
    const poll = () => {
      if (finished) return;
      const diff = diffCookies(beforeCookies, parseCookies(document.cookie));
      if (diff.added.length || diff.changed.length) {
        finish(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        finish(false);
        return;
      }
      setTimeout(poll, 250);
    };
    poll();

    iframe.addEventListener('load', () => {
      // Optimistically allow retry shortly after load while continuing to poll.
      setTimeout(() => {
        if (!finished) {
          const diff = diffCookies(
            beforeCookies,
            parseCookies(document.cookie)
          );
          if (diff.added.length || diff.changed.length) finish(true);
          else finish(true);
        }
      }, 600);
    });
    iframe.addEventListener('error', () => finish(false));
    document.addEventListener(
      'securitypolicyviolation',
      (e) => {
        if (e.violatedDirective === 'frame-ancestors') {
          finish(false);
        }
      },
      { once: true }
    );
    document.body.appendChild(iframe);
  });
}

function supportsSrcDoc(): boolean {
  const t = document.createElement('iframe');
  return 'srcdoc' in t;
}

function assignSrcdoc(iframe: HTMLIFrameElement, html: string): boolean {
  try {
    // Attempt plain string assignment; will throw TypeError if Trusted Types enforcement is active
    iframe.srcdoc = html;
    return true;
  } catch {
    return false;
  }
}

function injectBaseHref(html: string, href: string): string {
  // If a <head> exists, inject <base>; otherwise, prepend one.
  if (/<head[\s>]/i.test(html)) {
    return html.replace(
      /<head(\b[^>]*)>/i,
      (m) => `${m}<base href="${escapeHtml(href)}">`
    );
  }
  return `<head><base href="${escapeHtml(href)}"></head>` + html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const out: Record<string, string> = {};
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out[name] = value;
  });
  return out;
}

function diffCookies(
  before: Record<string, string>,
  after: Record<string, string>
) {
  const added: string[] = [];
  const changed: string[] = [];
  for (const k in after) {
    if (!(k in before)) added.push(k);
    else if (before[k] !== after[k]) changed.push(k);
  }
  return { added, changed };
}
