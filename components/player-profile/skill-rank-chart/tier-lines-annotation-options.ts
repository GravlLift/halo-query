'use client';
import { getTierSubTierForSkill } from '@gravllift/halo-helpers';
import { ResolvablePromise } from '@gravllift/utilities';
import type { Chart as ChartJS } from 'chart.js';
import { AnnotationOptions } from 'chartjs-plugin-annotation';
import { RefObject, useCallback, useMemo } from 'react';
import { tierColors } from './tier-colors';

type LoadAwareImage = HTMLImageElement & {
  loadPromise: ResolvablePromise<void>;
};
const imageMap = new Map<number, LoadAwareImage>();
function getTierImage(csr: number) {
  let image = imageMap.get(csr);
  if (!image) {
    const { Tier, SubTier } = getTierSubTierForSkill(csr);
    const url = `https://www.halowaypoint.com/images/halo-infinite/csr/${Tier.toLowerCase()}_${
      SubTier + 1
    }.png`;

    const imageEl = document.createElement('img') as LoadAwareImage;
    imageEl.loadPromise = new ResolvablePromise();

    imageEl.addEventListener('load', () => {
      imageEl.loadPromise.resolve();
    });
    imageEl.addEventListener('error', () => {
      console.warn(`Failed to load CSR image: ${url}`);
    });
    imageEl.src = url;
    if (SubTier === 0) {
      imageEl.width = imageEl.height = 50;
    } else {
      imageEl.width = imageEl.height = 40;
    }
    imageMap.set(csr, imageEl);
    image = imageEl;
  }
  return image;
}

export function useTierBackgroundColorAnnotations(
  chartRef: RefObject<ChartJS<'line', unknown> | null>
) {
  const tierLoadedSet = useMemo(() => new Set<LoadAwareImage>(), []);
  const registerUpdateWatch = useCallback(
    (img: LoadAwareImage) => {
      if (!tierLoadedSet.has(img)) {
        img.loadPromise.then(() => {
          chartRef.current?.update();
        });
        tierLoadedSet.add(img);
      }
      return img;
    },
    [tierLoadedSet, chartRef]
  );
  return new Array(5 * 6 + 1).fill(0).map((_, i) => {
    const csr = 50 * i;
    const { Tier, SubTier } = getTierSubTierForSkill(csr);
    return {
      adjustScaleRange: false,
      drawTime: 'beforeDatasetsDraw',
      display: ({ chart }: { chart: ChartJS<'line'> }) => {
        const {
          chartArea,
          scales: { y },
        } = chart;
        const csrPixelValue = y.getPixelForValue(csr);
        return (
          (SubTier === 0 || y.max - y.min < 500) &&
          csrPixelValue >= chartArea?.top &&
          csrPixelValue < chartArea?.bottom
        );
      },
      type: 'line',
      borderColor: `rgba(${
        tierColors[Tier.toLowerCase() as keyof typeof tierColors]
      }, 0.5)`,
      borderDash: SubTier === 0 ? undefined : [5, 5],
      scaleID: 'y',
      value: csr,
      label: {
        display: ({ chart }: { chart: ChartJS<'line'> }) => {
          const {
            scales: { y },
          } = chart;
          const csrPixelValue = y.getPixelForValue(csr);

          // Is pixel value within chart bounds?
          if (csrPixelValue >= y.top && csrPixelValue <= y.bottom) {
            return registerUpdateWatch(getTierImage(csr)).loadPromise
              .isCompleted;
          } else {
            return undefined;
          }
        },
        position: 'start',
        backgroundColor: 'transparent',
        content: ({ chart }: { chart: ChartJS<'line'> }) => {
          const {
            scales: { y },
          } = chart;
          const csrPixelValue = y.getPixelForValue(csr);

          // Is pixel value within chart bounds?
          if (csrPixelValue >= y.top && csrPixelValue <= y.bottom) {
            return getTierImage(csr);
          } else {
            return undefined;
          }
        },
        padding: { top: 0, bottom: 0, left: 6, right: 6 },
        yAdjust: ({ chart }: { chart: ChartJS<'line'> }) => {
          const {
            scales: { y },
          } = chart;
          const csrPixelValue = y.getPixelForValue(csr);

          // Is pixel value within chart bounds?
          if (csrPixelValue >= y.top && csrPixelValue <= y.bottom) {
            // Will icon be auto adjusted back away from chart edges?
            // If so, we need to counteract that movement
            const imageEl = getTierImage(csr);
            const imageTopEdge = csrPixelValue - imageEl.height / 2;
            if (imageTopEdge < y.top) {
              return imageTopEdge - y.top;
            }
            const imageBottomEdge = csrPixelValue + imageEl.height / 2;
            if (imageBottomEdge > y.bottom) {
              return imageBottomEdge - y.bottom;
            }
            return 0;
          } else {
            return undefined;
          }
        },
      },
    } as AnnotationOptions<'line'>;
  });
}
