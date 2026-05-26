// Single-value in-memory cache shared by the dashboard and model-info routes.
//
// The cached payloads (gold-layer aggregates, model registry metadata) change
// rarely, so the value is held for the life of the process and only an explicit
// `force` (or `clear()`) triggers a refetch. Concurrent callers share one
// in-flight promise so a cold start never fans out into duplicate queries.

export interface CacheResult<T> {
  data: T;
  cached: boolean;
  age: number;
}

export interface Cache<T> {
  get(opts?: { force?: boolean }): Promise<CacheResult<T>>;
  clear(): void;
}

export function createCache<T>(fetcher: () => Promise<T>): Cache<T> {
  let data: T | null = null;
  let ts = 0;
  let inflight: Promise<T> | null = null;

  return {
    async get({ force = false }: { force?: boolean } = {}): Promise<CacheResult<T>> {
      if (!force && data !== null) {
        return { data, cached: true, age: Date.now() - ts };
      }
      if (inflight) {
        return { data: await inflight, cached: false, age: 0 };
      }

      inflight = fetcher();
      try {
        data = await inflight;
        ts = Date.now();
        return { data, cached: false, age: 0 };
      } finally {
        inflight = null;
      }
    },

    clear(): void {
      data = null;
      ts = 0;
      inflight = null;
    },
  };
}
