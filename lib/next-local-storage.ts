export function getLocalStorageValueOrDefault(
  key: string,
  defaultValue: string
): string {
  let value: string;
  if (typeof localStorage !== 'undefined' && localStorage[key]) {
    try {
      value = localStorage[key];
    } catch (e) {
      value = defaultValue;
    }
    delete localStorage[key];
  } else {
    value = defaultValue;
  }
  return value;
}
