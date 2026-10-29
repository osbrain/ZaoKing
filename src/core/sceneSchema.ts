import { z } from 'zod';
import { isSimplePolygon } from './geometry';
import { AssetDefinitionSchema, CustomAssetSchema } from './assetSchema';
import { assetCatalog, materialCatalog } from './assets';
import { MaterialSchema } from './materialSchema';
import { HexColorSchema } from './schemaPrimitives';

const MAX_COORDINATE_MM = 1_000_000;
const coordinate = z.number().finite().min(-MAX_COORDINATE_MM).max(MAX_COORDINATE_MM);
const positiveMeasure = z.number().finite().positive().max(MAX_COORDINATE_MM);
const identifier = z.string().trim().min(1).max(120);
const vec2Schema = z.tuple([coordinate, coordinate]);

const rectSchema = z.tuple([coordinate, coordinate, coordinate, coordinate]).superRefine((rect, ctx) => {
  if (rect[0] >= rect[2] || rect[1] >= rect[3]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rectangle bounds must have positive width and height' });
  }
});

const wallSchema = z.object({
  id: identifier,
  x0: coordinate,
  y0: coordinate,
  x1: coordinate,
  y1: coordinate,
  kind: z.enum(['bearing', 'exterior', 'partition', 'low']),
  height: positiveMeasure,
  color: HexColorSchema.optional(),
}).strict().superRefine((wall, ctx) => {
  if (wall.x0 >= wall.x1 || wall.y0 >= wall.y1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Wall bounds must have positive width and height' });
  }
});

const roomSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(120),
  poly: z.array(vec2Schema).min(3).max(256),
  labelAt: vec2Schema.optional(),
  floorMaterialId: identifier,
  counted: z.boolean().optional(),
}).strict().superRefine((room, ctx) => {
  if (!isSimplePolygon(room.poly)) {
    ctx.addIssue({ path: ['poly'], code: z.ZodIssueCode.custom, message: 'Room boundary must be a non-self-intersecting polygon with non-zero area' });
  }
});

const openingSchema = z.object({
  id: identifier,
  kind: z.enum(['door', 'entry', 'window', 'sliding']),
  rect: rectSchema,
  height: positiveMeasure,
  sill: coordinate.refine((value) => value >= 0, 'Sill height cannot be negative'),
  hinge: vec2Schema.optional(),
  openDir: vec2Schema.optional(),
  closeDir: vec2Schema.optional(),
  span: positiveMeasure.optional(),
  vertical: z.boolean().optional(),
}).strict().superRefine((opening, ctx) => {
  if (opening.kind === 'door' || opening.kind === 'entry') {
    for (const field of ['hinge', 'openDir', 'closeDir', 'span'] as const) {
      if (opening[field] === undefined) {
        ctx.addIssue({ path: [field], code: z.ZodIssueCode.custom, message: 'Required for a hinged door' });
      }
    }
  }
});

const componentInstanceSchema = z.object({
  id: identifier,
  assetId: identifier,
  t: z.object({ x: coordinate, y: coordinate, rot: z.number().finite() }).strict(),
  size: z.object({ w: positiveMeasure.optional(), d: positiveMeasure.optional(), h: positiveMeasure.optional() }).strict()
    .refine((size) => size.w !== undefined || size.d !== undefined || size.h !== undefined, 'At least one size override is required').optional(),
  parameters: z.object({
    compartments: z.number().int().min(1).max(8).optional(),
    openCompartments: z.number().int().min(0).max(8).optional(),
    shelves: z.number().int().min(0).max(12).optional(),
    drawers: z.number().int().min(1).max(8).optional(),
    seats: z.number().int().min(1).max(5).optional(),
  }).strict().refine((parameters) => Object.keys(parameters).length > 0, 'At least one parameter override is required').optional(),
  color: HexColorSchema.optional(),
  locked: z.boolean().optional(),
}).strict();

const levelSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(120),
  elevation: coordinate,
  walls: z.array(wallSchema).max(10000),
  rooms: z.array(roomSchema).max(5000),
  openings: z.array(openingSchema).max(10000),
  instances: z.array(componentInstanceSchema).max(20000),
}).strict().superRefine((level, ctx) => {
  const ids = new Set<string>();
  for (const collection of ['walls', 'rooms', 'openings', 'instances'] as const) {
    level[collection].forEach((item, index) => {
      if (ids.has(item.id)) {
        ctx.addIssue({ path: [collection, index, 'id'], code: z.ZodIssueCode.custom, message: 'Entity IDs must be unique within a level' });
      }
      ids.add(item.id);
    });
  }
});

export const SceneDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  meta: z.object({ name: z.string().trim().min(1).max(200), units: z.literal('mm') }).strict(),
  levels: z.array(levelSchema).min(1).max(100),
  assets: z.array(CustomAssetSchema).max(1000).optional(),
  assetSnapshots: z.array(AssetDefinitionSchema).max(1000).optional(),
  materialSnapshots: z.array(MaterialSchema).max(1000).optional(),
}).strict().superRefine((document, ctx) => {
  const knownAssets = assetCatalog([
    ...(document.assetSnapshots ?? []), ...(document.assets ?? []),
  ]);
  const knownAssetIds = new Set(knownAssets.map((asset) => asset.id));
  const knownMaterialIds = new Set(materialCatalog(document.materialSnapshots).map((material) => material.id));
  const assetIds = new Set<string>();
  for (const collection of ['assets', 'assetSnapshots'] as const) {
    document[collection]?.forEach((asset, index) => {
      if (assetIds.has(asset.id)) {
        ctx.addIssue({ path: [collection, index, 'id'], code: z.ZodIssueCode.custom, message: 'Asset IDs must be unique' });
      }
      assetIds.add(asset.id);
      if (collection === 'assetSnapshots' && asset.id.startsWith('custom:')) {
        ctx.addIssue({ path: [collection, index, 'id'], code: z.ZodIssueCode.custom, message: 'Custom assets must be stored in assets' });
      }
    });
  }
  const materialIds = new Set<string>();
  document.materialSnapshots?.forEach((material, index) => {
    if (materialIds.has(material.id)) {
      ctx.addIssue({ path: ['materialSnapshots', index, 'id'], code: z.ZodIssueCode.custom, message: 'Material IDs must be unique' });
    }
    materialIds.add(material.id);
  });
  const ids = new Set<string>();
  document.levels.forEach((level, index) => {
    if (ids.has(level.id)) {
      ctx.addIssue({ path: ['levels', index, 'id'], code: z.ZodIssueCode.custom, message: 'Level IDs must be unique' });
    }
    ids.add(level.id);
    level.instances.forEach((instance, instanceIndex) => {
      if (!knownAssetIds.has(instance.assetId)) {
        ctx.addIssue({ path: ['levels', index, 'instances', instanceIndex, 'assetId'], code: z.ZodIssueCode.custom, message: 'Component asset does not exist in this document or the built-in catalog' });
      }
      if (instance.parameters) {
        const asset = knownAssets.find((candidate) => candidate.id === instance.assetId);
        const effectiveParameters = { ...asset?.geometry?.parameters, ...instance.parameters };
        if (effectiveParameters.compartments !== undefined && effectiveParameters.openCompartments !== undefined
          && effectiveParameters.openCompartments > effectiveParameters.compartments) {
          ctx.addIssue({
            path: ['levels', index, 'instances', instanceIndex, 'parameters', 'openCompartments'],
            code: z.ZodIssueCode.custom,
            message: 'Open compartments cannot exceed total compartments',
          });
        }
      }
    });
    level.rooms.forEach((room, roomIndex) => {
      if (!knownMaterialIds.has(room.floorMaterialId)) {
        ctx.addIssue({ path: ['levels', index, 'rooms', roomIndex, 'floorMaterialId'], code: z.ZodIssueCode.custom, message: 'Floor material does not exist in this document or the built-in catalog' });
      }
    });
  });
});

export type ValidatedSceneDocument = z.infer<typeof SceneDocumentSchema>;

export function formatSceneIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}
