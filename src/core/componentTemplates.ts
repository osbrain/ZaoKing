import type { CustomFinish, CustomShape } from './types';

export interface ComponentTemplate {
  shape: CustomShape;
  name: string;
  group: string;
  category: string;
  dimensions: { w: number; d: number; h: number };
  finish: CustomFinish;
  parameters?: { compartments?: number; shelves?: number; drawers?: number; seats?: number };
}

/** Parametric templates are the extension point for custom 2D/3D component types. */
export const COMPONENT_TEMPLATES: ComponentTemplate[] = [
  { shape: 'box', name: '基础柜体 / 占位方块', group: '基础体块', category: '自定义', dimensions: { w: 600, d: 600, h: 800 }, finish: 'paint' },
  { shape: 'cylinder', name: '基础圆柱', group: '基础体块', category: '自定义', dimensions: { w: 600, d: 600, h: 800 }, finish: 'paint' },
  { shape: 'cabinet', name: '定制地柜', group: '柜体与收纳', category: '自定义', dimensions: { w: 1200, d: 600, h: 900 }, finish: 'wood', parameters: { compartments: 2 } },
  { shape: 'wallCabinet', name: '吊柜 / 墙柜', group: '柜体与收纳', category: '餐厨', dimensions: { w: 1200, d: 350, h: 700 }, finish: 'wood', parameters: { compartments: 2 } },
  { shape: 'wardrobe', name: '平开门衣柜', group: '柜体与收纳', category: '卧室', dimensions: { w: 1800, d: 600, h: 2400 }, finish: 'wood', parameters: { compartments: 3 } },
  { shape: 'bookcase', name: '开放式书架', group: '柜体与收纳', category: '书房 · 休闲', dimensions: { w: 1200, d: 350, h: 2100 }, finish: 'wood', parameters: { compartments: 3, shelves: 5 } },
  { shape: 'dresser', name: '抽屉柜', group: '柜体与收纳', category: '卧室', dimensions: { w: 1000, d: 450, h: 850 }, finish: 'wood', parameters: { drawers: 4 } },
  { shape: 'tvConsole', name: '电视矮柜', group: '柜体与收纳', category: '客厅', dimensions: { w: 1800, d: 400, h: 500 }, finish: 'wood', parameters: { compartments: 3 } },
  { shape: 'vanity', name: '浴室镜柜与台盆', group: '柜体与收纳', category: '卫浴', dimensions: { w: 900, d: 550, h: 850 }, finish: 'ceramic', parameters: { drawers: 2 } },
  { shape: 'kitchenIsland', name: '厨房岛台', group: '柜体与收纳', category: '餐厨', dimensions: { w: 1800, d: 900, h: 900 }, finish: 'wood', parameters: { compartments: 3 } },
  { shape: 'sofa', name: '布艺沙发', group: '软体家具', category: '客厅', dimensions: { w: 2200, d: 900, h: 850 }, finish: 'fabric', parameters: { seats: 3 } },
  { shape: 'cornerSofa', name: 'L 型转角沙发', group: '软体家具', category: '客厅', dimensions: { w: 2800, d: 1700, h: 850 }, finish: 'fabric', parameters: { seats: 4 } },
  { shape: 'armchair', name: '单人休闲椅', group: '软体家具', category: '客厅', dimensions: { w: 850, d: 850, h: 850 }, finish: 'fabric' },
  { shape: 'bed', name: '软包床与床头', group: '软体家具', category: '卧室', dimensions: { w: 1800, d: 2100, h: 1100 }, finish: 'fabric' },
  { shape: 'roundTable', name: '圆餐桌', group: '桌椅', category: '餐厨', dimensions: { w: 1100, d: 1100, h: 750 }, finish: 'wood' },
  { shape: 'diningTable', name: '长餐桌', group: '桌椅', category: '餐厨', dimensions: { w: 1600, d: 800, h: 750 }, finish: 'wood' },
  { shape: 'desk', name: '书桌 / 工作台', group: '桌椅', category: '书房 · 休闲', dimensions: { w: 1400, d: 700, h: 750 }, finish: 'wood' },
  { shape: 'chair', name: '餐椅', group: '桌椅', category: '餐厨', dimensions: { w: 480, d: 520, h: 900 }, finish: 'wood' },
  { shape: 'rug', name: '地毯 / 地垫', group: '桌椅', category: '客厅', dimensions: { w: 2000, d: 1500, h: 20 }, finish: 'fabric' },
  { shape: 'bathtub', name: '独立浴缸', group: '卫浴设备', category: '卫浴', dimensions: { w: 1700, d: 800, h: 600 }, finish: 'ceramic' },
  { shape: 'toilet', name: '坐便器', group: '卫浴设备', category: '卫浴', dimensions: { w: 400, d: 700, h: 780 }, finish: 'ceramic' },
  { shape: 'shower', name: '玻璃淋浴房', group: '卫浴设备', category: '卫浴', dimensions: { w: 1000, d: 1000, h: 2100 }, finish: 'glass' },
  { shape: 'planter', name: '花盆与绿植', group: '灯具与绿植', category: '客厅', dimensions: { w: 600, d: 600, h: 1500 }, finish: 'ceramic' },
  { shape: 'floorLamp', name: '落地灯', group: '灯具与绿植', category: '客厅', dimensions: { w: 450, d: 450, h: 1650 }, finish: 'metal' },
  { shape: 'pendantLight', name: '吊灯', group: '灯具与绿植', category: '餐厨', dimensions: { w: 500, d: 500, h: 500 }, finish: 'metal' },
];

export const componentTemplateByShape = (shape: CustomShape) =>
  COMPONENT_TEMPLATES.find(template => template.shape === shape)!;
