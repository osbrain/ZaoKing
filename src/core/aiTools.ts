import type { DesignOp } from './ops';

/** Function names belong to the tool-call envelope, never to its JSON arguments. */
export function parseAiToolCalls(calls: unknown): DesignOp[] {
  if (!Array.isArray(calls)) return [];
  return calls.flatMap((call): DesignOp[] => {
    try {
      const fn = call?.function;
      if (typeof fn?.arguments !== 'string') return [];
      const args = JSON.parse(fn.arguments);
      if (!args || typeof args !== 'object' || Array.isArray(args)) return [];
      const text = (key: string) => typeof args[key] === 'string' ? args[key].trim() : '';
      const room = text('room') || undefined;
      switch (fn.name) {
        case 'add_component':
        case 'set_floor_material':
          return text('query') ? [{ op: fn.name, room, query: text('query') }] : [];
        case 'replace_component':
          return text('target') ? [{ op: fn.name, room, target: text('target'), spec: text('spec') || undefined }] : [];
        case 'delete_component':
          return text('target') ? [{ op: fn.name, room, target: text('target') }] : [];
        case 'ask_user':
          return text('question') ? [{ op: fn.name, question: text('question') }] : [];
        default:
          return [];
      }
    } catch {
      return [];
    }
  });
}
