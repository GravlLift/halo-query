'use client';
import { Box } from '@chakra-ui/react';
import { getTierSubTierForSkill } from '@gravllift/halo-helpers';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { percentFormatter } from '../../lib/formatters';
import { defaultBuckets } from '../../lib/leaderboard/default-buckets';
import { useSkillBuckets } from '../../lib/leaderboard/hooks';
import { Loading } from '../loading';
import { tierColors } from '../player-profile/skill-rank-chart/tier-colors';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);
export default function SkillBucketChart({
  playlistAssetId,
  skillProp,
}: {
  playlistAssetId: string;
  skillProp: 'esr' | 'csr';
}) {
  const router = useRouter();
  const { buckets: skillBuckets, loading } = useSkillBuckets(
    playlistAssetId,
    skillProp
  );
  const totalPlayers = useMemo(() => {
    return Array.from(skillBuckets).reduce((acc, [, count]) => acc + count, 0);
  }, [skillBuckets]);
  const sortedSkillBuckets = useMemo(
    () => Array.from(skillBuckets).sortBy(([skill]) => skill),
    [skillBuckets]
  );
  const labels = useMemo(() => {
    return sortedSkillBuckets.map(([skill]) => {
      if (skill < 0) {
        return skill.toFixed(0);
      }
      const { Tier, SubTier } = getTierSubTierForSkill(skill);
      return Tier === 'Onyx' ? `${Tier} ${skill}` : `${Tier} ${SubTier + 1}`;
    });
  }, [sortedSkillBuckets]);
  const backgroundColor = useMemo(() => {
    return sortedSkillBuckets.map(([skill]) => {
      const { Tier } = getTierSubTierForSkill(skill);
      const color = tierColors[Tier.toLowerCase() as keyof typeof tierColors];
      return `rgb(${color})`;
    });
  }, [sortedSkillBuckets]);
  return (
    <Box height="200px" position="relative">
      {loading && (
        <Loading
          centerProps={{ position: 'absolute', width: '100%', height: '125px' }}
        />
      )}
      <Bar
        data={{
          labels,
          datasets: [
            {
              label: 'Players',
              data: Array.from(
                loading ? defaultBuckets : sortedSkillBuckets
              ).map(([, count]) => count),
              backgroundColor,
            },
          ],
        }}
        options={{
          animation: false,
          maintainAspectRatio: false,
          responsive: true,
          interaction: {
            intersect: false,
            mode: 'x',
          },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              callbacks: {
                label(tooltipItem) {
                  const subBucketCumulativeCount = tooltipItem.dataset.data
                    .slice(0, tooltipItem.dataIndex)
                    .sum((d) => d as number);
                  const startPercentile =
                    subBucketCumulativeCount / totalPlayers;
                  const cumulativeCount =
                    subBucketCumulativeCount + (tooltipItem.raw as number);
                  const topPercentile = cumulativeCount / totalPlayers;

                  return [
                    `Perc: ${percentFormatter.format(
                      startPercentile
                    )} - ${percentFormatter.format(topPercentile)}`,
                    'Players: ' + tooltipItem.formattedValue,
                  ];
                },
              },
            },
          },
          onClick(_event, elements, chart) {
            if (elements.length === 0) {
              return;
            }

            // Sum players of all buckets above clicked bucket
            let playerCount = 0;
            for (
              let i =
                chart.data.datasets[elements[0].datasetIndex].data.length - 1;
              i >= elements[0].index;
              i--
            ) {
              playerCount += chart.data.datasets[elements[0].datasetIndex].data[
                i
              ] as number;
            }
            const page = Math.ceil(playerCount / 100);
            const urlParams = new URLSearchParams({ page: page.toString() });
            urlParams.set('playlistAssetId', playlistAssetId);
            urlParams.set('skillProp', skillProp);
            router.replace(`/leaderboard?${urlParams.toString()}`);
          },
        }}
      />
    </Box>
  );
}
