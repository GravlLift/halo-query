const EMBED_SCRIPT_URL = 'https://player.twitch.tv/js/embed/v1.js';

export interface TwitchVideo {
  id: string;
  /** Position given by the URL's `t` parameter, in seconds. */
  startSec?: number;
}

/** Parses Twitch `t` values such as `1h2m3s`, `90s`, or `90`. */
export function parseTwitchTimestamp(value: string | null) {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return undefined;
  const [, h = '0', m = '0', s = '0'] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Parses Twitch VOD URLs (`twitch.tv/videos/<id>` or `player.twitch.tv/?video=<id>`). */
export function parseTwitchVideoUrl(input: string): TwitchVideo | undefined {
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(input.trim())
        ? input.trim()
        : `https://${input.trim()}`,
    );
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'twitch.tv' && !host.endsWith('.twitch.tv')) return undefined;
  const id =
    /^\/videos\/(\d+)\/?$/.exec(url.pathname)?.[1] ??
    /^v?(\d+)$/.exec(url.searchParams.get('video') ?? '')?.[1];
  if (!id) return undefined;
  return { id, startSec: parseTwitchTimestamp(url.searchParams.get('t')) };
}

export interface TwitchVideoInfo {
  /** For `archive` VODs this is when the broadcast started. */
  createdAt: string;
  duration: string;
  type: string;
  title?: string;
  userName?: string;
}

/** Fetches VOD metadata via our Helix proxy; resolves undefined when unavailable. */
export async function fetchTwitchVideoInfo(
  id: string,
): Promise<TwitchVideoInfo | undefined> {
  const response = await fetch(
    `/api/twitch-video?id=${encodeURIComponent(id)}`,
  );
  if (!response.ok) return undefined;
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('createdAt' in body) ||
    typeof body.createdAt !== 'string' ||
    !('duration' in body) ||
    typeof body.duration !== 'string' ||
    !('type' in body) ||
    typeof body.type !== 'string'
  )
    return undefined;
  return {
    createdAt: body.createdAt,
    duration: body.duration,
    type: body.type,
    title:
      'title' in body && typeof body.title === 'string'
        ? body.title
        : undefined,
    userName:
      'userName' in body && typeof body.userName === 'string'
        ? body.userName
        : undefined,
  };
}

export interface TwitchPlayer {
  addEventListener(event: string, callback: () => void): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
}

export interface TwitchPlayerConstructor {
  new (
    element: HTMLElement,
    options: {
      width: string | number;
      height: string | number;
      video: string;
      parent: string[];
      autoplay: boolean;
      controls?: boolean;
      time?: string;
    },
  ): TwitchPlayer;
  READY: string;
  PLAYING: string;
  PAUSE: string;
  SEEK: string;
}

declare global {
  interface Window {
    Twitch?: { Player: TwitchPlayerConstructor };
  }
}

let embedScript: Promise<TwitchPlayerConstructor> | undefined;

/** Loads Twitch's embed script once and resolves with its player constructor. */
export function loadTwitchPlayer() {
  embedScript ??= new Promise<TwitchPlayerConstructor>((resolve, reject) => {
    const loaded = window.Twitch?.Player;
    if (loaded) return resolve(loaded);
    const script = document.createElement('script');
    script.src = EMBED_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const player = window.Twitch?.Player;
      if (player) resolve(player);
      else reject(new Error('Twitch player failed to initialize.'));
    };
    script.onerror = () => {
      embedScript = undefined;
      reject(new Error('Unable to load the Twitch player.'));
    };
    document.head.appendChild(script);
  });
  return embedScript;
}
