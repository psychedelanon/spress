const locks = new Map<string, Promise<void>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const last = locks.get(key) ?? Promise.resolve();
  let resolveNext!: (v: T) => void, rejectNext!: (e: any) => void;
  const next = new Promise<T>((res, rej) => { resolveNext = res; rejectNext = rej; });
  locks.set(key, last.then(fn).then(resolveNext, rejectNext).finally(() => {
    if (locks.get(key) === next) locks.delete(key);
  }));
  return next;
}
