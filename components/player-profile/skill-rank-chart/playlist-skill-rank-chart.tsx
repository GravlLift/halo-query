'use client';
import {
  Box,
  Code,
  Flex,
  HStack,
  Heading,
  HoverCard,
  Link,
  Portal,
  Text,
  VStack,
} from '@chakra-ui/react';
import { skillRank, skillRankCombined } from '@gravllift/halo-helpers';
import '@gravllift/utilities';
import { wrapXuid } from '@gravllift/halo-helpers';
import {
  CategoryScale,
  ChartData,
  ChartEvent,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import AnnotationPlugin, { AnnotationOptions } from 'chartjs-plugin-annotation';
import { MatchSkill } from 'halo-infinite-api';
import { CircleHelp, DownloadIcon, ExternalLink } from 'lucide-react';
import { DateTime } from 'luxon';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import NProgress from 'nprogress';
import { useEffect, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { useColors } from '../../../lib/hooks/colors';
import { useChartTheme } from '../../../lib/hooks/chart-theme';
import { getLocalStorageValueOrDefault } from '../../../lib/next-local-storage';
import { tierBackgroundColorsPlugin } from './tier-background-colors-plugin';
import { useTierBackgroundColorAnnotations } from './tier-lines-annotation-options';
import { useZoomPlugin } from './use-zoom-plugin';
import { useNavigationController } from '../../navigation-context';
import { useHaloCaches } from '../../../lib/contexts/halo-caches-context';

export type PlaylistSkillRankChartProps = {
  target: { xuid: string; gamertag: string };
  skills: {
    matchId: string;
    matchStart: string;
    matchEnd: string;
    gameVariantName: string;
    mapName: string;
    skill: MatchSkill<1 | 0>;
    teamSkills: (MatchSkill<1 | 0> | undefined)[];
    enemySkills: (MatchSkill<1 | 0> | undefined)[];
  }[];
  showLastXGames: number | null;
  showCsrDeltas: boolean;
  isLoading: boolean;
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  AnnotationPlugin
);

const trailingAverageWindow = +getLocalStorageValueOrDefault(
  'TRAILING_AVERAGE',
  '10'
);

type ChartDataPoint = { y: number | null; x: string; matchId: string };

export default function PlaylistSkillRankChart(
  props: PlaylistSkillRankChartProps
) {
  const { usersCache } = useHaloCaches();
  const { abort } = useNavigationController();
  const router = useRouter();
  const { fontColor, annotationLabelColor, gridColor } = useChartTheme();
  const allGameVariants = props.skills.map((s) => s.gameVariantName).distinct();
  const sortedSkills = props.skills.sortBy((m) => m.matchEnd);
  const chartRef = useRef<ChartJS<'line', ChartDataPoint[]>>(null);
  // Keep a ref to sorted skills for stable tooltip callbacks
  const sortedSkillsRef = useRef(sortedSkills);
  sortedSkillsRef.current = sortedSkills;
  const labels: string[] = [],
    csr: ChartDataPoint[] = [],
    esr: ChartDataPoint[] = [],
    esrA: ChartDataPoint[] = [],
    psrK: ChartDataPoint[] = [],
    psrD: ChartDataPoint[] = [],
    psrKTrailingAverage: ChartDataPoint[] = [],
    psrDTrailingAverage: ChartDataPoint[] = [],
    teamPsrKs: ChartDataPoint[] = [],
    teamPsrDs: ChartDataPoint[] = [],
    enemyPsrKs: ChartDataPoint[] = [],
    enemyPsrDs: ChartDataPoint[] = [],
    annotations: AnnotationOptions[] =
      useTierBackgroundColorAnnotations(chartRef);
  for (let i = 0; i < sortedSkills.length; i++) {
    const m = sortedSkills[i];
    const matchStart = DateTime.fromISO(m.matchStart);
    let matchStartLabel: string;
    if (matchStart > DateTime.now().minus({ years: 1 })) {
      matchStartLabel = DateTime.fromISO(m.matchStart).toFormat('MM-dd h:mm a');
    } else {
      matchStartLabel = DateTime.fromISO(m.matchStart).toFormat(
        'MM-dd-yyyy h:mm a'
      );
    }
    labels.push(matchStartLabel);
    csr.push({
      matchId: m.matchId,
      y:
        m.skill.RankRecap.PreMatchCsr.Value > -1
          ? m.skill.RankRecap.PreMatchCsr.Value
          : i > 0 && sortedSkills[i - 1].skill.RankRecap.PostMatchCsr.Value > -1
          ? sortedSkills[i - 1].skill.RankRecap.PostMatchCsr.Value
          : null,
      x: matchStartLabel,
    });
    esr.push({
      matchId: m.matchId,
      y: skillRankCombined(m.skill, 'Expected') ?? null,
      x: matchStartLabel,
    });

    const priorSkills = sortedSkills
      .slice(0, i + 1)
      .map((v) => [v, skillRankCombined(v.skill, 'Expected')] as const)
      .filter((v) => v[1] != undefined);
    const mostRecentGameVariantSkill = Array.from(
      priorSkills.groupBy(([v]) => v.gameVariantName)
    ).map(([, v]) => v[v.length - 1][1]);
    esrA.push({
      matchId: m.matchId,
      x: matchStartLabel,
      y:
        mostRecentGameVariantSkill.length < allGameVariants.length / 2
          ? null
          : mostRecentGameVariantSkill.average(),
    });
    psrK.push({
      matchId: m.matchId,
      y: skillRank(m.skill, 'Kills', 'Count') ?? null,
      x: matchStartLabel,
    });
    psrD.push({
      matchId: m.matchId,
      y: skillRank(m.skill, 'Deaths', 'Count') ?? null,
      x: matchStartLabel,
    });
    psrKTrailingAverage.push({
      matchId: m.matchId,
      y:
        i >= 10
          ? psrK
              .slice(i - trailingAverageWindow + 1, i + 1)
              .map((v) => v?.y)
              .filter((v) => v)
              .average()
          : null,
      x: matchStartLabel,
    });
    psrDTrailingAverage.push({
      matchId: m.matchId,
      y:
        i >= 10
          ? psrD
              .slice(i - trailingAverageWindow + 1, i + 1)
              .map((v) => v?.y)
              .filter((v) => v)
              .average()
          : null,
      x: matchStartLabel,
    });
    // Team PSR-K and PSR-D
    m.teamSkills.forEach((teamSkill) => {
      if (!teamSkill) return;
      const teamPsrKValue = skillRank(teamSkill, 'Kills', 'Count');
      const teamPsrDValue = skillRank(teamSkill, 'Deaths', 'Count');
      if (teamPsrKValue != null) {
        teamPsrKs.push({
          matchId: m.matchId,
          y: teamPsrKValue,
          x: matchStartLabel,
        });
      }
      if (teamPsrDValue != null) {
        teamPsrDs.push({
          matchId: m.matchId,
          y: teamPsrDValue,
          x: matchStartLabel,
        });
      }
    });
    m.enemySkills.forEach((enemySkill) => {
      if (!enemySkill) return;
      const enemyPsrKValue = skillRank(enemySkill, 'Kills', 'Count');
      const enemyPsrDValue = skillRank(enemySkill, 'Deaths', 'Count');
      if (enemyPsrKValue != null) {
        enemyPsrKs.push({
          matchId: m.matchId,
          y: enemyPsrKValue,
          x: matchStartLabel,
        });
      }
      if (enemyPsrDValue != null) {
        enemyPsrDs.push({
          matchId: m.matchId,
          y: enemyPsrDValue,
          x: matchStartLabel,
        });
      }
    });
    if (props.showCsrDeltas) {
      if (m.skill.RankRecap.PreMatchCsr.Value > -1) {
        const delta =
          m.skill.RankRecap.PostMatchCsr.Value -
          m.skill.RankRecap.PreMatchCsr.Value;
        annotations.push({
          type: 'label',
          display: ({ chart }) => {
            const {
              chartArea,
              scales: { x },
            } = chart;
            const csrPixelValue = x.getPixelForValue(i);
            return (
              csrPixelValue >= chartArea?.left &&
              csrPixelValue < chartArea?.right
            );
          },
          color: annotationLabelColor,
          backgroundColor: 'transparent',
          font: { size: 12 },
          content: [delta > 0 ? `+${delta}` : `${delta}`],
          xValue: i + 0.5,
          yValue: m.skill.RankRecap.PreMatchCsr.Value + delta / 2,
          yAdjust: 0,
        });
      }
    }
  }
  if (
    sortedSkills.length > 0 &&
    sortedSkills[sortedSkills.length - 1].skill.RankRecap.PostMatchCsr.Value >
      -1
  ) {
    labels.push('Current');
    csr.push({
      matchId: sortedSkills[sortedSkills.length - 1].matchId,
      y: sortedSkills[sortedSkills.length - 1].skill.RankRecap.PostMatchCsr
        .Value,
      x: 'Current',
    });
  }
  const [
    esrTrailingAverageColor,
    csrColor,
    esrColor,
    psrKTrailingAverageColor,
    psrKColor,
    psrDTrailingAverageColor,
    psrDColor,
    psrDTeamColor,
    psrKTeamColor,
    enemyPsrKColor,
    enemyPsrDColor,
  ] = useColors();
  const datasets: ChartData<'line', ChartDataPoint[], string>['datasets'] = [
    {
      label: `${props.target.gamertag} CSR`,
      data: csr,
      backgroundColor: csrColor,
      borderColor: csrColor,
    },
    {
      label: `${props.target.gamertag} ESR-A`,
      data: esrA,
      backgroundColor: esrTrailingAverageColor,
      borderColor: esrTrailingAverageColor,
    },
    {
      label: `${props.target.gamertag} ESR`,
      data: esr,
      backgroundColor: esrColor,
      borderColor: esrColor,
      hidden: true,
      showLine: false,
    },
    {
      label: `${props.target.gamertag} PSR-K-${trailingAverageWindow}`,
      data: psrKTrailingAverage,
      backgroundColor: psrKTrailingAverageColor,
      borderColor: psrKTrailingAverageColor,
      hidden: true,
    },
    {
      label: `${props.target.gamertag} PSR-K`,
      data: psrK,
      backgroundColor: psrKColor,
      borderColor: psrKColor,
      hidden: true,
      showLine: false,
    },
    {
      label: `${props.target.gamertag} PSR-D-${trailingAverageWindow}`,
      data: psrDTrailingAverage,
      backgroundColor: psrDTrailingAverageColor,
      borderColor: psrDTrailingAverageColor,
      hidden: true,
    },
    {
      label: `${props.target.gamertag} PSR-D`,
      data: psrD,
      backgroundColor: psrDColor,
      borderColor: psrDColor,
      hidden: true,
      showLine: false,
    },
    {
      label: 'Team PSR-K',
      data: teamPsrKs,
      backgroundColor: psrKTeamColor,
      borderColor: psrKTeamColor,
      hidden: true,
      showLine: false,
    },
    {
      label: 'Team PSR-D',
      data: teamPsrDs,
      backgroundColor: psrDTeamColor,
      borderColor: psrDTeamColor,
      hidden: true,
      showLine: false,
    },
    {
      label: 'Enemy PSR-K',
      data: enemyPsrKs,
      backgroundColor: enemyPsrKColor,
      borderColor: enemyPsrKColor,
      hidden: true,
      showLine: false,
    },
    {
      label: 'Enemy PSR-D',
      data: enemyPsrDs,
      backgroundColor: enemyPsrDColor,
      borderColor: enemyPsrDColor,
      hidden: true,
      showLine: false,
    },
  ];
  const [zoomPlugin, firstRenderComplete] = useZoomPlugin();
  useEffect(() => {
    if (chartRef.current?.isPluginEnabled('zoom')) {
      if (props.showLastXGames === null) {
        if (chartRef.current.isZoomedOrPanned()) {
          chartRef.current.resetZoom();
        }
      } else {
        chartRef.current.zoomScale('x', {
          min: Math.max(0, props.skills.length - props.showLastXGames),
          max: props.skills.length,
        });
      }
    }
  }, [props.showLastXGames, props.skills.length, firstRenderComplete]);

  // Recreating the options object every render will
  // cause the chart to re-render every time, interfering
  // with the zoom plugin.
  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      animation: false,
      clip: 0,
      backgroundColor: 'rgba(255,255,255)',
      scales: {
        x: { display: false },
        y: {
          grid: {
            color: gridColor,
          },
          ticks: { color: fontColor },
        },
      },
      maintainAspectRatio: false,
      elements: {
        point: {
          radius: 2,
        },
      },
      plugins: {
        tooltip: {
          mode: 'index',
          enabled: true,
          intersect: false,
          callbacks: {
            // Insert a single combined line above the date: "<Game> on <Map>"
            // If one is missing, show only the available value.
            beforeTitle(items) {
              try {
                if (!items || items.length === 0) return [];
                const index = items[0].dataIndex ?? 0;
                const skills = sortedSkillsRef.current;
                if (index >= skills.length) return [];
                const entry = skills[index];
                const game = (entry?.gameVariantName || '').trim();
                const mapName = (entry?.mapName || '').trim();
                if (game && mapName) return [`${game} on ${mapName}`];
                if (game) return [game];
                if (mapName) return [mapName];
                return [];
              } catch {
                return [];
              }
            },
          },
        },
        legend: {
          position: 'bottom',
          labels: { color: fontColor },
        },
        annotation: {},
        zoom: {
          zoom: {
            mode: 'x',
          },
        },
      },
      onClick(_event, elements, chart) {
        if (elements.length === 0) {
          return;
        }

        const datapoint =
          chart.data.datasets[elements[0].datasetIndex].data[elements[0].index];

        if (
          datapoint &&
          typeof datapoint === 'object' &&
          'matchId' in datapoint
        ) {
          abort('Navigating to match from skill chart');
          NProgress.start();
          router.push(`/matches/${datapoint.matchId}`);
        }
      },
      onHover(
        event: ChartEvent & {
          native: { target: { style: { cursor: string } } };
        },
        elements
      ) {
        if (event.native?.target == null) {
          return;
        }
        event.native.target.style.cursor = elements[0] ? 'pointer' : 'default';
      },
    }),
    [router, fontColor]
  );
  if (options.plugins?.annotation) {
    options.plugins.annotation.annotations = annotations;
  }
  return (
    <>
      <Box height={500} w="100%">
        {zoomPlugin && (
          <Line
            ref={chartRef}
            height={500}
            data={{ labels, datasets }}
            plugins={[tierBackgroundColorsPlugin, zoomPlugin]}
            options={options}
          />
        )}
      </Box>
      <Flex>
        {props.isLoading == false ? (
          <DownloadIcon
            aria-label="Export CSV"
            cursor="pointer"
            onClick={async () => {
              const user = await usersCache.get(wrapXuid(props.target.xuid));
              const csv = [
                [
                  'Match Id',
                  'Date',
                  'Game',
                  'Map',
                  'CSR',
                  'ESR-A',
                  'ESR',
                  'PSR-K-' + trailingAverageWindow,
                  'PSR-K',
                  'PSR-D-' + trailingAverageWindow,
                  'PSR-D',
                ].join(','),
                ...props.skills
                  .map((skill, i): (string | number)[] => [
                    skill.matchId,
                    skill.matchStart,
                    skill.gameVariantName ?? '',
                    skill.mapName ?? '',
                    csr[i]?.y ?? '',
                    esrA[i]?.y ?? '',
                    esr[i]?.y ?? '',
                    psrKTrailingAverage[i]?.y ?? '',
                    psrK[i]?.y ?? '',
                    psrDTrailingAverage[i]?.y ?? '',
                    psrD[i]?.y ?? '',
                  ])
                  .sortByDesc((s) => s[1])
                  .slice(0, props.showLastXGames ?? sortedSkills.length)
                  .map((row) => row.join(',')),
              ].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = user.gamertag + ' - Skill History.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
          />
        ) : null}
        <Box textAlign="right" flexGrow={1}>
          <HoverCard.Root>
            <HoverCard.Trigger>
              <HStack>
                What&apos;s all this then?
                <CircleHelp />
              </HStack>
            </HoverCard.Trigger>
            <Portal>
              <HoverCard.Positioner>
                <HoverCard.Content textAlign="initial">
                  <HoverCard.Arrow />
                  <VStack gap={2}>
                    <Box>
                      <Heading size="sm">CSR / ESR / PSR</Heading>
                      <Text>
                        Competitive Skill Ranking / Expected Skill Ranking /
                        Performance Skill Ranking. A detailed explanation of
                        each can be found{' '}
                        <Link asChild>
                          <NextLink
                            href="/faqs#csr-mmr-esr-psr"
                            target="_blank"
                          >
                            here <ExternalLink />
                          </NextLink>
                        </Link>
                        .
                      </Text>
                    </Box>
                    <Box>
                      <Heading size="sm">*-K / *-D</Heading>
                      <Text>
                        Stats ending in <Code>-K</Code> or <Code>-D</Code> are
                        specific to kills and deaths only. The <Code>-K</Code>{' '}
                        and <Code>-D</Code> stats are averaged together to make
                        the root statistic (for example, <Code>ESR-K</Code> and{' '}
                        <Code>ESR-D</Code> average together to create{' '}
                        <Code>ESR</Code>).
                      </Text>
                    </Box>
                    <Box>
                      <Heading size="sm">*-A</Heading>
                      <Text>
                        Stats including <Code>-A</Code> are an average of that
                        statistic from the most recent sample of each game type
                        (Slayer, Oddball, etc).
                      </Text>
                    </Box>
                    <Box>
                      <Heading size="sm">*-10</Heading>
                      <Text>
                        Stats including <Code>-{trailingAverageWindow}</Code>{' '}
                        are a trailing average of that statistic over the past{' '}
                        {trailingAverageWindow} games.
                      </Text>
                    </Box>
                    <Box>
                      <Heading size="sm">Lines vs Points</Heading>
                      <Text>
                        Stats connected by lines are influenced by the previous
                        entry in series, whereas stats represented by points
                        only are mostly unrelated values (non-averaged PSR
                        values, mostly).
                      </Text>
                    </Box>
                    <Box>
                      <Link asChild>
                        <NextLink href="/#psr-removal">
                          What happened to PSR and PSR-10? <ExternalLink />
                        </NextLink>
                      </Link>
                    </Box>
                  </VStack>
                </HoverCard.Content>
              </HoverCard.Positioner>
            </Portal>
          </HoverCard.Root>
        </Box>
      </Flex>
    </>
  );
}
