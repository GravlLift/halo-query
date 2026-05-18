export function getLocalStorageValueOrDefault(
  key: string,
  defaultValue: string,
): string {
  let value: string;
  if (typeof localStorage !== 'undefined' && localStorage[key]) {
    try {
      value = localStorage[key];
    } catch (e) {
      value = defaultValue;
    }
  } else {
    value = defaultValue;
  }
  return value;
}
