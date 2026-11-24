import { Box } from '@chakra-ui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MediaItemFrame } from './media-item-frame';
import { EmbedAlignControls } from './embed-align-controls';
import {
  fetchTwitchVideoInfo,
  loadTwitchPlayer,
  parseTwitchTimestamp,
  type TwitchPlayer,
  type TwitchVideo,
  type TwitchVideoInfo,
} from './twitch';
import { overlapOffsetSec } from './media-timing';
import { offsetStorageKey, useMediaOffset } from './use-media-offset';
import {
  type MediaPlayerAdapter,
  type ReplayPlaybackProps,
  useMediaSync,
} from './use-media-sync';

/** The embed API has no seeking state, so treat a seek as in progress for this long. */
const SEEK_SETTLE_MS = 1500;

function twitchAdapter(player: TwitchPlayer): MediaPlayerAdapter {
  let seekingUntil = 0;
  let volume: number | undefined;
  let muted: boolean | undefined;
  return {
    getCurrentTime: () => player.getCurrentTime(),
    getDuration: () => player.getDuration() || Infinity,
    isPaused: () => player.isPaused(),
    isSeeking: () => performance.now() < seekingUntil,
    play: () => player.play(),
    pause: () => player.pause(),
    seek: (seconds) => {
      seekingUntil = performance.now() + SEEK_SETTLE_MS;
      player.seek(seconds);
    },
    getRate: () => 1,
    // Each call is a postMessage to the iframe, so only send changes.
    setVolume: (nextVolume, nextMuted) => {
      if (volume !== nextVolume) player.setVolume((volume = nextVolume));
      if (muted !== nextMuted) player.setMuted((muted = nextMuted));
    },
  };
}

export function TwitchMediaItem({
  video,
  matchId,
  matchStartMs,
  matchDurationMs,
  onRemove,
  ...playback
}: ReplayPlaybackProps & {
  video: TwitchVideo;
  matchId: string;
  matchStartMs: number;
  matchDurationMs: number;
  onRemove: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<MediaPlayerAdapter>();
  const [loadError, setLoadError] = useState<string>();
  const [info, setInfo] = useState<TwitchVideoInfo>();
  const [vodPaused, setVodPaused] = useState(true);
  const { offset, offsetText, applyOffset, restoreOrApply, onOffsetInput } =
    useMediaOffset(offsetStorageKey(matchId, `twitch:${video.id}`));
  const { speedSupported, onPlayerTimeChange, onPlayerSeeked } = useMediaSync({
    ...playback,
    player,
    offset,
    onUserOffset: applyOffset,
  });

  // Player listeners are registered once, so route them through refs.
  const handlers = useRef({ onPlayerTimeChange, onPlayerSeeked });
  handlers.current = { onPlayerTimeChange, onPlayerSeeked };
  const initialOffset = useRef<() => void>();
  const infoRequest = useMemo(
    () => fetchTwitchVideoInfo(video.id).catch(() => undefined),
    [video.id],
  );
  useEffect(() => {
    let cancelled = false;
    infoRequest.then((details) => {
      if (!cancelled) setInfo(details);
    });
    return () => {
      cancelled = true;
    };
  }, [infoRequest]);
  initialOffset.current = () =>
    restoreOrApply(async () => {
      const details = await infoRequest;
      const durationSec = parseTwitchTimestamp(details?.duration ?? null);
      // Only past broadcasts have created_at equal to the stream start.
      const broadcastOffset =
        details?.type === 'archive' && durationSec !== undefined
          ? overlapOffsetSec({
              mediaStartMs: Date.parse(details.createdAt),
              durationSec,
              matchStartMs,
              matchDurationMs,
            })
          : undefined;
      return (
        broadcastOffset ?? (video.startSec ?? 0) - playback.clock.current / 1000
      );
    });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    loadTwitchPlayer()
      .then((Player) => {
        if (cancelled) return;
        const embed = new Player(container, {
          width: '100%',
          height: '100%',
          video: video.id,
          parent: [window.location.hostname],
          autoplay: false,
          // Twitch's chrome lingers over the video; alignment uses our own scrubber.
          controls: false,
        });
        embed.addEventListener(Player.READY, () => {
          if (cancelled) return;
          setPlayer(twitchAdapter(embed));
          initialOffset.current?.();
        });
        embed.addEventListener(Player.SEEK, () =>
          handlers.current.onPlayerSeeked(),
        );
        embed.addEventListener(Player.PLAYING, () =>
          handlers.current.onPlayerTimeChange(),
        );
        embed.addEventListener(Player.PAUSE, () =>
          handlers.current.onPlayerTimeChange(),
        );
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      setPlayer(undefined);
      container.replaceChildren();
    };
  }, [video.id]);

  // The embed has no timeupdate event, so poll while the user is aligning it.
  useEffect(() => {
    if (!playback.aligning || !player) return;
    const poll = () => {
      handlers.current.onPlayerTimeChange();
      setVodPaused(player.isPaused());
    };
    poll();
    const interval = setInterval(poll, 250);
    return () => clearInterval(interval);
  }, [playback.aligning, player]);

  const positionSec =
    offset !== undefined ? playback.clock.current / 1000 + offset : 0;

  return (
    <MediaItemFrame
      title={
        info?.title
          ? `${info.userName ? `${info.userName}: ` : ''}${info.title}`
          : `Twitch VOD ${video.id}`
      }
      offset={offset}
      offsetText={offsetText}
      onOffsetInput={onOffsetInput}
      onRemove={onRemove}
      error={loadError}
      notice={
        !speedSupported && !playback.aligning
          ? 'Twitch videos only follow 1x playback.'
          : undefined
      }
      isAligning={playback.aligning}
    >
      <Box position="relative" w="100%" aspectRatio={16 / 9}>
        <Box ref={containerRef} position="absolute" inset={0} />
        {/* Blocks hover/click so the embed can't show chrome or play on its own. */}
        <Box position="absolute" inset={0} aria-hidden="true" />
        {playback.aligning && player && offset !== undefined && (
          <EmbedAlignControls
            positionSec={positionSec}
            durationSec={player.getDuration()}
            paused={vodPaused}
            onSeek={(seconds) =>
              applyOffset(seconds - playback.clock.current / 1000)
            }
            onTogglePlay={() => {
              if (player.isPaused()) player.play();
              else player.pause();
              setVodPaused(!vodPaused);
            }}
          />
        )}
      </Box>
    </MediaItemFrame>
  );
}
