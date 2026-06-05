export type Queue<T> = {
  push: (item: T) => void;
  flush: () => Promise<void>;
  size: () => number;
};

export type QueueOpts<T> = {
  send: (batch: T[]) => Promise<void>;
  maxBatch: number;
  max: number;
};

export function makeQueue<T>(opts: QueueOpts<T>): Queue<T> {
  let buf: T[] = [];
  return {
    push(item) {
      buf.push(item);
      if (buf.length > opts.max) buf = buf.slice(buf.length - opts.max);
    },
    async flush() {
      while (buf.length > 0) {
        const batch = buf.slice(0, opts.maxBatch);
        buf = buf.slice(opts.maxBatch);
        try {
          await opts.send(batch);
        } catch {
          // Сетевой сбой — возвращаем батч в начало буфера, чтобы повторить на
          // следующем flush (периодическом или на pagehide), а не терять данные.
          buf = [...batch, ...buf];
          if (buf.length > opts.max) buf = buf.slice(buf.length - opts.max);
          return;
        }
      }
    },
    size() {
      return buf.length;
    },
  };
}
