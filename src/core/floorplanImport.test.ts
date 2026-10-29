import { describe, expect, it } from 'vitest';
import { draftToDocument, FloorPlanPixelDraftSchema, pixelDraftToMmDraft, type FloorPlanDraft } from './floorplanImport';

const D = (o: Partial<FloorPlanDraft>): FloorPlanDraft => ({ walls: [], openings: [], rooms: [], ...o });

describe('floorplanImport · 草稿规整', () => {
  it('薄线段墙展开为 200 厚矩形（水平墙）', () => {
    const { doc, report } = draftToDocument(
      D({ walls: [{ x0: 0, y0: 1000, x1: 5000, y1: 1010 }] }),
      't',
    );
    expect(doc).not.toBeNull();
    const w = doc!.levels[0].walls[0];
    expect(w.y1 - w.y0).toBe(200);
    expect(w.x1 - w.x0).toBe(5000);
    expect(report.walls).toBe(1);
  });

  it('重复墙体去重并计入 dropped', () => {
    const wall = { x0: 0, y0: 0, x1: 3000, y1: 0 };
    const { report } = draftToDocument(D({ walls: [wall, { ...wall }] }), 't');
    expect(report.walls).toBe(1);
    expect(report.dropped).toBeGreaterThanOrEqual(1);
  });

  it('位于包围盒边缘的墙判为外墙，内部墙保持非承重', () => {
    const { doc } = draftToDocument(
      D({
        walls: [
          { x0: 0, y0: 0, x1: 6000, y1: 200 },        // 顶 → 外墙
          { x0: 0, y0: 4000, x1: 6000, y1: 4200 },    // 中部横墙 → partition
          { x0: 0, y0: 7000, x1: 6000, y1: 7200 },    // 底 → 外墙
        ],
      }),
      't',
    );
    expect(doc!.levels[0].walls[0].kind).toBe('exterior');
    expect(doc!.levels[0].walls[1].kind).toBe('partition');
    expect(doc!.levels[0].walls[2].kind).toBe('exterior');
  });

  it('中文墙型映射（承重 → bearing）', () => {
    const { doc } = draftToDocument(D({ walls: [{ x0: 0, y0: 0, x1: 3000, y1: 240, kind: '承重' }] }), 't');
    expect(doc!.levels[0].walls[0].kind).toBe('bearing');
  });

  it('双向过厚（非墙）与过短墙被丢弃', () => {
    const { report } = draftToDocument(
      D({ walls: [{ x0: 0, y0: 0, x1: 2000, y1: 1500 }, { x0: 0, y0: 3000, x1: 200, y1: 3100 }] }),
      't',
    );
    expect(report.walls).toBe(0);
    expect(report.dropped).toBe(2);
  });

  it('门洞吸附宿主墙：贴合墙厚并补齐铰链/开启方向/门宽', () => {
    const { doc } = draftToDocument(
      D({
        walls: [{ x0: 0, y0: 0, x1: 6000, y1: 240 }],
        openings: [{ kind: 'door', rect: [2000, 20, 2900, 220] }],
      }),
      't',
    );
    const o = doc!.levels[0].openings[0] as { rect: number[]; hinge: number[]; openDir: number[]; closeDir: number[]; span: number };
    expect(o.rect[1]).toBe(0);           // 吸附到墙内皮
    expect(o.rect[3]).toBe(240);         // 贴合墙厚
    expect(o.hinge).toEqual([o.rect[0], o.rect[1]]);
    expect(o.span).toBeGreaterThan(0);
    expect(o.closeDir).toEqual([0, 1]);
  });

  it('吸附不上的洞口被丢弃并给出告警', () => {
    const { report, doc } = draftToDocument(
      D({ walls: [{ x0: 0, y0: 0, x1: 3000, y1: 240 }], openings: [{ kind: 'window', rect: [20000, 20000, 21000, 20100] }] }),
      't',
    );
    expect(doc!.levels[0].openings).toHaveLength(0);
    expect(report.warnings.some((w) => w.includes('窗'))).toBe(true);
  });

  it('所在墙段过短时报告被忽略的洞口', () => {
    const { report } = draftToDocument(
      D({ walls: [{ x0: 0, y0: 0, x1: 400, y1: 0 }], openings: [{ kind: 'window', rect: [190, 0, 210, 20] }] }),
      't',
    );
    expect(report.dropped).toBe(1);
    expect(report.warnings.some((warning) => warning.includes('墙段过短'))).toBe(true);
  });

  it('房间材质启发：卫生间防滑砖 / 厨房地砖 / 客厅默认地砖；无效多边形剔除', () => {
    const { doc, report } = draftToDocument(
      D({
        walls: [{ x0: 0, y0: 0, x1: 9000, y1: 200 }],
        rooms: [
          { name: '卫生间', poly: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] },
          { name: '厨房', poly: [[0, 2000], [1000, 2000], [1000, 3000], [0, 3000]] },
          { name: '客厅', poly: [[0, 4000], [2000, 4000], [2000, 5000], [0, 5000]] },
          { name: '坏房间', poly: [[0, 0], [100, 100]] }, // 少于 3 点
        ],
      }),
      't',
    );
    expect(doc!.levels[0].rooms).toHaveLength(3);
    expect(doc!.levels[0].rooms[0].floorMaterialId).toBe('antislip');
    expect(doc!.levels[0].rooms[1].floorMaterialId).toBe('tile600');
    expect(doc!.levels[0].rooms[2].floorMaterialId).toBe('tile800');
    expect(report.warnings.some((w) => w.includes('坏房间'))).toBe(true);
  });

  it('输出文档通过 SceneDocumentSchema（函数仅在合法时返回 doc）', () => {
    const { doc } = draftToDocument(
      D({
        walls: [
          { x0: 0, y0: 0, x1: 9000, y1: 240 },
          { x0: 0, y0: 7000, x1: 9000, y1: 7240 },
          { x0: 0, y0: 240, x1: 240, y1: 7000 },
          { x0: 8760, y0: 240, x1: 9000, y1: 7000 },
        ],
        openings: [{ kind: 'entry', rect: [4000, 7000, 5000, 7240] }],
        rooms: [{ name: '一居室', poly: [[240, 240], [8760, 240], [8760, 7000], [240, 7000]] }],
      }),
      '截图导入',
    );
    expect(doc).not.toBeNull();
    expect(doc!.meta.name).toBe('截图导入');
    expect(doc!.levels[0].walls).toHaveLength(4);
    expect(doc!.levels[0].instances).toHaveLength(0);
  });

  it('空墙体输入返回 null 与告警', () => {
    const { doc, report } = draftToDocument(D({ walls: [] }), 't');
    expect(doc).toBeNull();
    expect(report.warnings[0]).toContain('墙体');
  });

  it('把识别出的像素坐标按用户标定长度转换为毫米，并平移到户型原点', () => {
    const pixels = FloorPlanPixelDraftSchema.parse({
      walls: [{ x0: 100, y0: 100, x1: 400, y1: 100, confidence: 0.9 }],
      rooms: [{ name: '客厅', poly: [[100, 100], [400, 100], [400, 300], [100, 300]], confidence: 0.8 }],
    });
    const mm = pixelDraftToMmDraft(pixels, { a: [0, 0], b: [100, 0], lengthMm: 3000 });
    expect(mm.walls[0]).toMatchObject({ x0: 0, y0: 0, x1: 9000, y1: 0 });
    expect(mm.rooms?.[0].poly).toEqual([[0, 0], [9000, 0], [9000, 6000], [0, 6000]]);
  });

  it('拒绝过短的标定线和不合理的实测尺寸', () => {
    const pixels = FloorPlanPixelDraftSchema.parse({ walls: [{ x0: 0, y0: 0, x1: 100, y1: 0 }] });
    expect(() => pixelDraftToMmDraft(pixels, { a: [0, 0], b: [5, 0], lengthMm: 3000 })).toThrow(/比例标定无效/);
    expect(() => pixelDraftToMmDraft(pixels, { a: [0, 0], b: [100, 0], lengthMm: 90000 })).toThrow(/比例标定无效/);
  });

  it('户型跨度过大时拒绝标定，不裁切坐标', () => {
    const pixels = FloorPlanPixelDraftSchema.parse({ walls: [{ x0: 0, y0: 0, x1: 30000, y1: 0 }] });
    expect(() => pixelDraftToMmDraft(pixels, { a: [0, 0], b: [10, 0], lengthMm: 50000 })).toThrow(/超过 99 米/);
  });

  it('拒绝坐标顺序颠倒的门窗识别框', () => {
    const result = FloorPlanPixelDraftSchema.safeParse({
      walls: [{ x0: 0, y0: 0, x1: 100, y1: 0 }],
      openings: [{ kind: 'window', rect: [80, 0, 20, 10] }],
    });
    expect(result.success).toBe(false);
  });
});
