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
      const number = (key: string) => typeof args[key] === 'number' && Number.isFinite(args[key]) ? args[key] : undefined;
      const room = text('room') || undefined;
      const levelId = text('levelId') || undefined;
      const target = text('target') || undefined;
      const instanceId = text('instanceId') || undefined;
      switch (fn.name) {
        case 'add_component':
        case 'set_floor_material':
          return text('query') ? [{ op: fn.name, levelId, room, query: text('query') }] : [];
        case 'replace_component':
          return (target || instanceId) ? [{ op: fn.name, levelId, room, target, instanceId, spec: text('spec') || undefined }] : [];
        case 'delete_component':
          return (target || instanceId) ? [{ op: fn.name, levelId, room, target, instanceId }] : [];
        case 'move_component':
          return (target || instanceId) && [number('dxMm'), number('dyMm'), number('rotationDeltaDeg')].some((value) => value !== undefined)
            ? [{ op: fn.name, levelId, room, target, instanceId, dxMm: number('dxMm'), dyMm: number('dyMm'), rotationDeltaDeg: number('rotationDeltaDeg') }]
            : [];
        case 'resize_component':
          return (target || instanceId) && [number('widthMm'), number('depthMm'), number('heightMm')].some((value) => value !== undefined)
            ? [{ op: fn.name, levelId, room, target, instanceId, widthMm: number('widthMm'), depthMm: number('depthMm'), heightMm: number('heightMm') }]
            : [];
        case 'set_component_parameters': {
          if (!target && !instanceId) return [];
          const parameters = Object.fromEntries(
            ['compartments', 'openCompartments', 'shelves', 'drawers', 'seats']
              .map((key) => [key, number(key)])
              .filter(([, value]) => value !== undefined),
          );
          return Object.keys(parameters).length ? [{ op: fn.name, levelId, room, target, instanceId, ...parameters }] : [];
        }
        case 'set_component_color':
          return (target || instanceId) && text('query')
            ? [{ op: fn.name, levelId, room, target, instanceId, query: text('query') }]
            : [];
        case 'set_wall_color':
          return text('query') ? [{ op: fn.name, levelId, room, wallId: text('wallId') || undefined, query: text('query') }] : [];
        case 'set_wall_renovation':
          return text('wallId') && ['retained', 'new', 'demolished'].includes(text('status'))
            ? [{ op: fn.name, levelId, wallId: text('wallId'), status: text('status') as 'retained' | 'new' | 'demolished' }]
            : [];
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
