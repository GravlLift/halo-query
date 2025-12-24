import { Link, Table } from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { compareXuids, wrapXuid, skillRank } from '@gravllift/halo-helpers';
import { PlayerMatchHistoryStatsSkill } from '@gravllift/halo-helpers';
import GamertagDisplay from '../match/gamertag-display';
import { MatchOutcome } from 'halo-infinite-api';
import { percentFormatter } from '../../lib/formatters';
import { Duration } from 'luxon';
import NextLink from 'next/link';
import { useFocusPlayer } from '../../lib/contexts/focus-player-context';
import { useHaloCaches } from '../../lib/contexts/halo-caches-context';
import { Tooltip } from '../ui/tooltip';

export function TeammatesTable({
  matches,
  userXuid,
}: {
  matches: PlayerMatchHistoryStatsSkill[];
  userXuid: string;
  // playlistName is currently unused for this simple table, kept for parity
  playlistName?: string;
}) {
  const { focusPlayer } = useFocusPlayer();
  const { usersCache } = useHaloCaches();
  const [teammateGamertags, setTeammateGamertags] = useState<
    Record<string, string>
  >({});
  const topTeammates = useMemo(() => {
    const counts = new Map<
      string,
      {
        xuid: string;
        appearances: number;
        wins: number;
        losses: number;
        ties: number;
        psrKWeighted: number;
        psrDWeighted: number;
        weightSum: number;
        matchIds: string[];
        gamertag?: string;
      }
    >();

    for (const m of matches) {
      const me = m.MatchStats.Players.find((p) =>
        compareXuids(p.PlayerId, userXuid)
      );
      if (!me) continue;
      const teamId = me.LastTeamId;
      const teammates = m.MatchStats.Players.filter(
        (p) => p.LastTeamId === teamId && !compareXuids(p.PlayerId, userXuid)
      );

      // Weight by the focus player's actual time played in this match
      const timePlayedIso = me.ParticipationInfo?.TimePlayed;
      const matchWeight = timePlayedIso
        ? Duration.fromISO(timePlayedIso).toMillis()
        : 0;

      // Compute PSR-K and PSR-D for the focus player in this match
      const psrKVal = me.Skill ? skillRank(me.Skill, 'Kills', 'Count') ?? 0 : 0;
      const psrDVal = me.Skill
        ? skillRank(me.Skill, 'Deaths', 'Count') ?? 0
        : 0;

      for (const t of teammates) {
        // Skip bots; they don't have gamer tags or xuids
        if (t.PlayerId?.startsWith('bid')) continue;
        const normalizedXuid = wrapXuid(t.PlayerId);
        const current = counts.get(normalizedXuid);
        if (current) {
          current.appearances += 1;
          // Accumulate weighted PSR values
          current.psrKWeighted += psrKVal * matchWeight;
          current.psrDWeighted += psrDVal * matchWeight;
          current.weightSum += matchWeight;
          current.matchIds.push(m.MatchId);
          if ('gamertag' in t && t.gamertag && !current.gamertag) {
            current.gamertag = t.gamertag;
          }
          if (
            t.Outcome === me.Outcome &&
            [MatchOutcome.Win, MatchOutcome.Loss, MatchOutcome.Tie].includes(
              me.Outcome as MatchOutcome
            )
          ) {
            if (me.Outcome === MatchOutcome.Win) current.wins += 1;
            else if (me.Outcome === MatchOutcome.Loss) current.losses += 1;
            else if (me.Outcome === MatchOutcome.Tie) current.ties += 1;
          }
        } else {
          counts.set(normalizedXuid, {
            xuid: normalizedXuid,
            appearances: 1,
            psrKWeighted: psrKVal * matchWeight,
            psrDWeighted: psrDVal * matchWeight,
            weightSum: matchWeight,
            matchIds: [m.MatchId],
            gamertag: 'gamertag' in t ? t.gamertag : undefined,
            wins:
              me.Outcome === MatchOutcome.Win && t.Outcome === me.Outcome
                ? 1
                : 0,
            losses:
              me.Outcome === MatchOutcome.Loss && t.Outcome === me.Outcome
                ? 1
                : 0,
            ties:
              me.Outcome === MatchOutcome.Tie && t.Outcome === me.Outcome
                ? 1
                : 0,
          });
        }
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => {
        if (b.appearances !== a.appearances) {
          return b.appearances - a.appearances;
        }
        return a.xuid.localeCompare(b.xuid);
      })
      .slice(0, 10);
  }, [matches, userXuid]);

  // Resolve gamertags for top teammates to support link filters
  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        topTeammates.map(async (t) => {
          try {
            const user = await usersCache.get(t.xuid);
            return [t.xuid, user.gamertag] as const;
          } catch {
            return [t.xuid, undefined] as const;
          }
        })
      );
      const map: Record<string, string> = {};
      for (const [xuid, gt] of entries) {
        if (gt) map[xuid] = gt;
      }
      setTeammateGamertags(map);
    })();
  }, [topTeammates, usersCache]);

  return (
    <Table.Root size="sm">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>Gamertag</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="right">Matches</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="right">Game Time</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="right">Record</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="right">
            <Tooltip content="Weighted average by match duration">
              PSR-K
            </Tooltip>
          </Table.ColumnHeader>
          <Table.ColumnHeader textAlign="right">
            <Tooltip content="Weighted average by match duration">
              PSR-D
            </Tooltip>
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {topTeammates.map((t) => (
          <Table.Row key={t.xuid}>
            <Table.Cell>
              <GamertagDisplay player={{ PlayerId: t.xuid }} fetchIfMissing />
            </Table.Cell>
            <Table.Cell textAlign="right">
              {(() => {
                const teammateGamertag =
                  t.gamertag || teammateGamertags[t.xuid];
                if (!teammateGamertag) return t.appearances;
                const filter = {
                  in: [teammateGamertag, { var: 'Team Members' as const }],
                };
                const urlParams = new URLSearchParams({
                  gamertag: focusPlayer ?? '',
                  filters: JSON.stringify(filter),
                });
                return (
                  <Link asChild>
                    <NextLink href={`/matches?${urlParams}`}>
                      {t.appearances}
                    </NextLink>
                  </Link>
                );
              })()}
            </Table.Cell>
            <Table.Cell textAlign="right">
              {(() => {
                const total = t.weightSum ?? 0;
                if (!total || !Number.isFinite(total)) return '';
                return Duration.fromMillis(total).toFormat('hh:mm:ss');
              })()}
            </Table.Cell>
            <Table.Cell textAlign="right">
              {(() => {
                const winLosses = t.wins + t.losses;
                const winRate = winLosses > 0 ? t.wins / winLosses : 0;
                return `${t.wins}-${t.losses}${
                  t.ties > 0 ? `-${t.ties}` : ''
                } (${percentFormatter.format(winRate)})`;
              })()}
            </Table.Cell>
            <Table.Cell textAlign="right">
              {(() => {
                const avg = t.weightSum > 0 ? t.psrKWeighted / t.weightSum : 0;
                return Number.isFinite(avg) ? avg.toFixed(2) : '';
              })()}
            </Table.Cell>
            <Table.Cell textAlign="right">
              {(() => {
                const avg = t.weightSum > 0 ? t.psrDWeighted / t.weightSum : 0;
                return Number.isFinite(avg) ? avg.toFixed(2) : '';
              })()}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}
