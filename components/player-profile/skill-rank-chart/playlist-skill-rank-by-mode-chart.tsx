'use client';
import { Box } from '@chakra-ui/react';
import { skillRankCombined } from '@gravllift/halo-helpers';
import '@gravllift/utilities';
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
import AnnotationPlugin from 'chartjs-plugin-annotation';
import { MatchSkill } from 'halo-infinite-api';
import { DateTime } from 'luxon';
import { useRouter } from 'next/navigation';
import NProgress from 'nprogress';
import { useEffect, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { useColors } from '../../../lib/hooks/colors';
import { useChartTheme } from '../../../lib/hooks/chart-theme';
import { tierBackgroundColorsPlugin } from './tier-background-colors-plugin';
import { useTierBackgroundColorAnnotations } from './tier-lines-annotation-options';
import { useZoomPlugin } from './use-zoom-plugin';
import { useNavigationController } from '../../navigation-context';

export type PlaylistSkillRankByModeChartProps = {
  skills: {
    matchId: string;
    gameVariantName: string;
    matchStart: string;
    matchEnd: string;
    mapName: string;
    skill: MatchSkill;
    teamSkills: (MatchSkill | undefined)[];
  }[];
  showLastXGames: number | null;
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

type ChartDataPoint = { y: number | null; x: string; matchId: string };

export default function PlaylistSkillRankByModeChart(
  props: PlaylistSkillRankByModeChartProps
) {
  const { abort } = useNavigationController();
  const router = useRouter();
  const { fontColor, gridColor } = useChartTheme();
  // Sort by match end, label by match start
  const sortedSkills = props.skills.sortBy((m) => m.matchEnd);
  const gameVariants = sortedSkills
    .map((m) => m.gameVariantName)
    .distinct()
    .sortBy((k) => k);
  const labels: string[] = [],
    esr: ChartDataPoint[] = [],
    gameVariantEsr: Map<string, ChartDataPoint[]> = new Map(
      gameVariants.map((k) => [k, []])
    );
  for (const m of sortedSkills) {
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
    esr.push({
      y: skillRankCombined(m.skill, 'Expected') ?? null,
      x: matchStartLabel,
      matchId: m.matchId,
    });
    for (const k of gameVariantEsr.keys()) {
      gameVariantEsr.get(k)!.push({
        y:
          m.gameVariantName === k
            ? skillRankCombined(m.skill, 'Expected') ?? null
            : null,
        x: matchStartLabel,
        matchId: m.matchId,
      });
    }
  }
  const [esrTrailingAverageColor, ...colors] = useColors();
  const datasets: ChartData<'line', ChartDataPoint[], string>['datasets'] = [];

  if (gameVariants.length > 1) {
    datasets.push({
      label: `ESR-A`,
      data: esr.map((m, i) => {
        // Get average of the most recent match of each game variant prior to this one
        const priorSkills = sortedSkills
          .slice(0, i + 1)
          .map((v) => [v, skillRankCombined(v.skill, 'Expected')] as const)
          .filter((v) => v[1] != undefined);
        const mostRecentGameVariantSkill = Array.from(
          priorSkills.groupBy(([v]) => v.gameVariantName)
        ).map(([, v]) => v[v.length - 1][1]);
        return {
          ...m,
          y:
            mostRecentGameVariantSkill.length < gameVariants.length / 2
              ? null
              : mostRecentGameVariantSkill.average(),
        };
      }),
      backgroundColor: esrTrailingAverageColor,
      borderColor: esrTrailingAverageColor,
      hidden: gameVariants.length === 1,
    });
  }

  datasets.push(
    ...Array.from(gameVariantEsr.keys()).flatMap((k, i) => [
      {
        label: k,
        data: gameVariantEsr.get(k)!,
        spanGaps: true,
        backgroundColor: colors[i],
        borderColor: colors[i],
      },
    ])
  );

  const chartRef = useRef<ChartJS<'line', ChartDataPoint[]>>(null);
  const sortedSkillsRef = useRef(sortedSkills);
  sortedSkillsRef.current = sortedSkills;
  const [zoomPlugin, firstRenderComplete] = useZoomPlugin();
  useEffect(() => {
    if (chartRef.current?.isPluginEnabled('zoom')) {
      if (props.showLastXGames === null) {
        if (chartRef.current.isZoomedOrPanned()) {
          chartRef.current.resetZoom();
        }
      } else {
        chartRef.current.zoomScale('x', {
          min: Math.max(0, labels.length - props.showLastXGames),
          max: labels.length,
        });
      }
    }
  }, [props.showLastXGames, labels.length, firstRenderComplete]);
  const annotations = useTierBackgroundColorAnnotations(chartRef);

  // No fetching here; mapName is supplied by parent

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
            data={{
              labels,
              datasets,
            }}
            plugins={[tierBackgroundColorsPlugin, zoomPlugin]}
            options={options}
          />
        )}
      </Box>
    </>
  );
}
