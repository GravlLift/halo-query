import type { FetchFunction } from 'halo-infinite-api';
import { vercelResponsePolicy } from '../vercel/vercel-request-policy';

type UrlLike =
  | string
  | {
      href?: string;
      url?: string;
    };

export function getUrl(input: UrlLike): string {
  let url = '';
  if (typeof input === 'string') {
    url = input;
  } else if (input?.href) {
    url = input.href;
  } else if (input?.url) {
    url = input.url;
  }
  return url;
}

export function remapUrlForProxy(rawUrl: string) {
  let url = new URL(rawUrl);

  if (
    'login.live.com' === url.hostname ||
    ['.xboxlive.com', '.halowaypoint.com'].some((hostname) =>
      url.hostname.endsWith(hostname)
    )
  ) {
    url = new URL(
      `${typeof window !== 'undefined' ? window.location.origin : ''}/proxy/${
        url.hostname
      }${url.pathname}${url.search}`
    );
  }

  return url.toString();
}

export const fetcher: FetchFunction = (input, init) =>
  vercelResponsePolicy.execute(
    ({ signal }) => fetch(remapUrlForProxy(getUrl(input)), { ...init, signal }),
    init?.signal ?? undefined
  );
