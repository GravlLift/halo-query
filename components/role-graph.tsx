'use client';
import { Box } from '@chakra-ui/react';
import {
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { useColors } from '../lib/hooks/colors';
import { useChartTheme } from '../lib/hooks/chart-theme';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

export default function RoleGraph(props: {
  stats: {
    gamertag: string;
    kills: number;
    assists: number;
    objective?: number;
    damage?: number;
  }[];
  height?: number;
  radiusMax?: number;
  colorOverrides?: string[];
}) {
  const colors = useColors();
  const { fontColor, gridColorStrong } = useChartTheme();

  const labels = ['Kills', 'Assists'];
  if (props.stats.find((s) => s.damage !== undefined)) {
    labels.push('Damage');
  }
  if (props.stats.find((s) => s.objective !== undefined)) {
    labels.push('Objective');
  }
  return (
    <Box width={'100%'}>
      <Radar
        height={props.height}
        data={{
          labels,
          datasets: props.stats.map((p, i) => {
            const data = [p.kills, p.assists];
            if (p.damage != null) {
              data.push(p.damage);
            }
            if (p.objective != null) {
              data.push(p.objective);
            }
            return {
              label: p.gamertag,
              data,
              borderColor: props.colorOverrides?.[i] || colors[i],
            };
          }),
        }}
        options={{
          maintainAspectRatio: false,
          datasets: {
            radar: { backgroundColor: 'rgba(0, 0, 0, 0)', borderWidth: 1 },
          },
          scales: {
            r: {
              max: props.radiusMax,
              angleLines: { color: gridColorStrong },
              grid: {
                circular: true,
                color: gridColorStrong,
              },
              beginAtZero: true,
              ticks: {
                count: 4,
                display: true,
                backdropColor: 'rgba(0, 0, 0, 0)',
                color: fontColor,
                format: {
                  style: 'percent',
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                },
              },
              pointLabels: { color: fontColor },
            },
          },
          elements: {
            point: {
              hitRadius: 5,
            },
          },
          plugins: {
            legend: {
              display: props.stats.length > 1,
              position: 'bottom',
              labels: { color: fontColor },
            },
          },
        }}
      />
    </Box>
  );
}
