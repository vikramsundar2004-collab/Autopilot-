import "@testing-library/jest-dom/vitest";

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.has(key) ? items.get(key)! : null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, String(value));
    },
  };
}

const needsStorageShim =
  typeof window.localStorage?.clear !== "function" ||
  typeof window.localStorage?.getItem !== "function" ||
  typeof window.localStorage?.setItem !== "function";

if (needsStorageShim) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
}
