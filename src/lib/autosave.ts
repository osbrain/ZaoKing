import type { SceneDocument } from '@/core/types';

interface Snapshot { doc: SceneDocument; rev: number }
interface Options {
  version: number;
  save: (doc: SceneDocument, version: number) => Promise<{ version?: number; conflict?: boolean }>;
  onStatus: (status: 'saved' | 'saving' | 'error' | 'conflict') => void;
  delay?: number;
}

/** A single writer coalesces changes made while a request is in flight. */
export function createAutosaver({ version, save, onStatus, delay = 1200 }: Options) {
  let pending: Snapshot | null = null;
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let conflicted = false;
  const flush = (): Promise<void> => {
    clearTimeout(timer);
    if (running) return running;
    if (stopped || conflicted || !pending) return Promise.resolve();
    running = (async () => {
      while (pending && !stopped && !conflicted) {
        const snapshot = pending;
        pending = null;
        try {
          const result = await save(snapshot.doc, version);
          if (stopped) return;
          if (result.conflict) {
            conflicted = true;
            onStatus('conflict');
            return;
          }
          if (!result.version) throw new Error('Missing saved version');
          version = result.version;
          if (!pending) onStatus('saved');
        } catch {
          if (!pending) pending = snapshot;
          if (!stopped) onStatus('error');
          return;
        }
      }
    })().finally(() => { running = null; });
    return running;
  };
  return {
    schedule(snapshot: Snapshot) {
      if (stopped || conflicted) return;
      pending = snapshot;
      onStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, delay);
    },
    flush,
    isDirty: () => Boolean(pending || running || conflicted),
    dispose() { stopped = true; clearTimeout(timer); },
  };
}
