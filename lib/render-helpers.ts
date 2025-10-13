export function toFixed343(val: number | 'NaN' | undefined) {
  if (val === undefined || val === 'NaN') {
    return undefined;
  } else {
    return val.toFixed(2);
  }
}
