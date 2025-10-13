export let localStorageEvent: Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

if (typeof localStorage === 'undefined') {
  localStorageEvent = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
} else {
  const originalSetItem = Storage.prototype.setItem ?? localStorage.setItem;
  const originalRemoveItem =
    Storage.prototype.removeItem ?? localStorage.removeItem;
  localStorageEvent = {
    getItem: localStorage.getItem.bind(localStorage),
    setItem(...args: Parameters<typeof localStorage.setItem>) {
      originalSetItem.apply(localStorage, args);
      window.dispatchEvent(
        new CustomEvent('local-storage', {
          detail: { key: args[0], value: args[1] },
        })
      );
    },
    removeItem(...args: Parameters<typeof localStorage.removeItem>) {
      originalRemoveItem.apply(localStorage, args);
      window.dispatchEvent(
        new CustomEvent('local-storage', {
          detail: { key: args[0], value: null },
        })
      );
    },
  };
}
