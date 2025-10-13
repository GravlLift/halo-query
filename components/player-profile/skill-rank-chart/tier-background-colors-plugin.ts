'use client';
import { Plugin } from 'chart.js';
import { tierColors } from './tier-colors';

const tierCsrStarts = [0, 300, 600, 900, 1200, 1500];

export const tierBackgroundColorsPlugin: Plugin<'line'> = {
  id: 'tier-background-colors-plugin',
  beforeDraw(
    { ctx, chartArea: { left, width, bottom }, scales: { y } },
    _args,
    _options
  ) {
    const [bronze, silver, gold, platinum, diamond, onyx] = tierCsrStarts.map(
      (v) => y.getPixelForValue(v)
    );
    ctx.save();
    ctx.fillStyle = `rgba(${tierColors['onyx']}, 0.1)`;
    ctx.fillRect(left, 0, width, Math.min(bottom, onyx));
    if (onyx < bottom) {
      ctx.fillStyle = `rgba(${tierColors['diamond']}, 0.1)`;
      ctx.fillRect(left, onyx, width, Math.min(bottom, diamond) - onyx);
      if (diamond < bottom) {
        ctx.fillStyle = `rgba(${tierColors['platinum']}, 0.1)`;
        ctx.fillRect(
          left,
          diamond,
          width,
          Math.min(bottom, platinum) - diamond
        );
        if (platinum < bottom) {
          ctx.fillStyle = `rgba(${tierColors['gold']}, 0.1)`;
          ctx.fillRect(
            left,
            platinum,
            width,
            Math.min(bottom, gold) - platinum
          );
          if (gold < bottom) {
            ctx.fillStyle = `rgba(${tierColors['silver']}, 0.1)`;
            ctx.fillRect(left, gold, width, Math.min(bottom, silver) - gold);
            if (silver < bottom) {
              ctx.fillStyle = `rgba(${tierColors['bronze']}, 0.1)`;
              ctx.fillRect(
                left,
                silver,
                width,
                Math.min(bottom, bronze) - silver
              );
            }
          }
        }
      }
    }
    ctx.restore();
  },
};
