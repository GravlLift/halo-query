'use client';
import { useColorMode } from '../../components/ui/color-mode';

export type ChartTheme = {
  fontColor: string;
  annotationLabelColor: string;
  gridColor: string;
  gridColorStrong: string;
};

/**
 * Small hook to provide theme-aware colors for Chart.js text elements
 * (legend labels, axis tick labels, tooltip text, annotation labels).
 */
export function useChartTheme(): ChartTheme {
  // High-contrast light text on dark background
  const font = 'rgba(255, 255, 255, 0.92)';
  return {
    fontColor: font,
    annotationLabelColor: font,
    gridColor: 'rgba(255, 255, 255, 0.10)',
    gridColorStrong: 'rgba(255, 255, 255, 0.24)',
  };
}
