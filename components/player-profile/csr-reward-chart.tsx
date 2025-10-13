import { Text } from '@chakra-ui/react';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { MatchOutcome, MatchSkill } from 'halo-infinite-api';
import { DateTime } from 'luxon';
import { Scatter } from 'react-chartjs-2';
import { useColors } from '../../lib/hooks/colors';
import { skillRank, skillRankCombined } from '@gravllift/halo-helpers';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export type CsrRewardChartProps = {
  skills: {
    matchId: string;
    matchStart: string;
    outcome: MatchOutcome;
    gameVariantName: string;
    skill: MatchSkill;
    teamSkills: (MatchSkill | undefined)[];
    allFinished: boolean;
  }[];
};

export default function CsrRewardChart(props: CsrRewardChartProps) {
  const colors = useColors();
  const filteredSkills = props.skills.filter((s) => {
    const matchStart = DateTime.fromISO(s.matchStart);
    return (
      [MatchOutcome.Win, MatchOutcome.Loss].includes(s.outcome) &&
      s.skill.RankRecap.PreMatchCsr.Value >= 0 &&
      s.skill.RankRecap.PreMatchCsr.Value < 1800 &&
      (s.skill.RankRecap.PreMatchCsr.InitialDemotionProtectionMatches === 0 ||
        s.outcome !== MatchOutcome.Loss) &&
      s.allFinished &&
      (matchStart.toMillis() >
        DateTime.fromISO('2024-02-12T15:15:00-04:00').toMillis() ||
        matchStart.toMillis() <
          DateTime.fromISO('2024-01-30T00:00:00-04:00').toMillis())
    );
  });
  const allGameVariants = filteredSkills
    .map((s) => s.gameVariantName)
    .distinct();
  const sortedSkills = filteredSkills.sortByDesc((m) => m.matchStart);
  const data = sortedSkills
    .map(({ skill, matchId, outcome, teamSkills }, i) => {
      const priorSkills = sortedSkills
        .slice(i)
        .map((v) => [v, skillRankCombined(v.skill, 'Expected')] as const)
        .filter((v) => v[1] != undefined);
      const mostRecentGameVariantSkill = Array.from(
        priorSkills.groupBy(([v]) => v.gameVariantName)
      ).map(([, v]) => v[0][1]);
      const esrA =
        allGameVariants.length != mostRecentGameVariantSkill.length
          ? null
          : mostRecentGameVariantSkill.average();
      const csrDelta =
        skill.RankRecap.PostMatchCsr.Value - skill.RankRecap.PreMatchCsr.Value;
      return {
        matchId,
        outcome,
        preCsr: skill.RankRecap.PreMatchCsr.Value,
        csrDelta,
        esrA,
        adjustment: outcome === MatchOutcome.Win ? csrDelta - 8 : csrDelta + 8,
        csrEsrDistance:
          esrA != null ? skill.RankRecap.PreMatchCsr.Value - esrA : null,
        psrK: skillRank(skill, 'Kills', 'Count'),
        psrD: skillRank(skill, 'Deaths', 'Count'),
      };
    })
    .filter((d): d is typeof d & { csrEsrDistance: number } => d.esrA != null);
  // https://math.stackexchange.com/a/204021
  const slope =
    (data.length * data.sum((d) => d.csrEsrDistance * d.adjustment) -
      data.sum((d) => d.csrEsrDistance) * data.sum((d) => d.adjustment)) /
    (data.length * data.sum((d) => Math.pow(d.csrEsrDistance, 2)) -
      Math.pow(
        data.sum((d) => d.csrEsrDistance),
        2
      ));
  const trendline = {
    slope,
    offset:
      (data.sum((d) => d.adjustment) -
        slope * data.sum((d) => d.csrEsrDistance)) /
      data.length,
  };
  return (
    <>
      <Text>
        y = {trendline.slope}x + {trendline.offset}
      </Text>
      <Scatter
        data={{
          datasets: [
            {
              data: data.map((d) => ({ y: d.adjustment, x: d.csrEsrDistance })),
              backgroundColor: colors[1],
            },
          ],
        }}
        options={{
          animation: false,
          scales: {
            y: {
              title: { display: true, text: 'CSR Adjustment' },
              ticks: {
                callback: (v) => (typeof v === 'number' && v > 0 ? `+${v}` : v),
              },
              min: -8,
              max: 8,
            },
            x: {
              title: { display: true, text: 'CSR/ESR Distance' },
              ticks: {
                callback: (v) => (typeof v === 'number' && v > 0 ? `+${v}` : v),
              },
            },
          },
          plugins: {
            annotation: {
              annotations: [
                {
                  type: 'line',
                  xMin: (ctx) => ctx.chart.scales.x.min,
                  yMin: (ctx) =>
                    trendline.slope * ctx.chart.scales.x.min + trendline.offset,
                  xMax: (ctx) => ctx.chart.scales.x.max,
                  yMax: (ctx) =>
                    trendline.slope * ctx.chart.scales.x.max + trendline.offset,
                },
              ],
            },
            tooltip: {
              enabled: true,
              mode: 'nearest',
              displayColors: false,
              callbacks: {
                label: (context) => {
                  return [
                    `CSR: ${data[context.dataIndex].preCsr}`,
                    `ESR-A: ${data[context.dataIndex].esrA?.toFixed(2)}`,
                    `PSR-K: ${data[context.dataIndex].psrK?.toFixed(2)}`,
                    `PSR-D: ${data[context.dataIndex].psrD?.toFixed(2)}`,
                    `CSR/ESR Distance: ${
                      data[context.dataIndex].csrEsrDistance > 0
                        ? `+${data[context.dataIndex].csrEsrDistance.toFixed(
                            2
                          )}`
                        : data[context.dataIndex].csrEsrDistance.toFixed(2)
                    }`,
                    `CSR Offset: ${
                      data[context.dataIndex].adjustment > 0
                        ? `+${data[context.dataIndex].adjustment}`
                        : data[context.dataIndex].adjustment
                    }`,
                  ];
                },
              },
            },
            legend: { display: false },
          },
          onClick(_event, elements) {
            if (elements.length === 0) {
              return;
            }

            window.open(
              `/matches/${
                sortedSkills[
                  Math.min(sortedSkills.length - 1, elements[0].index)
                ].matchId
              }`,
              '_blank'
            );
          },
        }}
      />
    </>
  );
}
