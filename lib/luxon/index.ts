import { Duration } from 'luxon';

declare module 'luxon' {
  interface Duration {
    toDecisecondFormat(): string;
  }
}

if (!Duration.prototype.toDecisecondFormat) {
  Duration.prototype.toDecisecondFormat = function (this: Duration) {
    return this.mapUnits((val, unit) =>
      unit === 'milliseconds' ? Math.round(val / 100) : val
    ).toFormat('m:ss.S');
  };
}
