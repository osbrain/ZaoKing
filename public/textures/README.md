# 地板 / 环境贴图素材

全部为 CC0（公有领域）授权，可免费商用，无需署名。

## floors/ — PBR 地板贴图（ambientCG.com）

每套含 `color.jpg`（sRGB 漫反射）、`normal.jpg`（OpenGL 法线）、`roughness.jpg`（粗糙度），部分含 `ao.jpg`（环境光遮蔽，当前未接入）。1K JPG，无缝平铺。

| 目录 | 平铺尺寸 | 来源资产 (ambientCG) |
| --- | --- | --- |
| wood | 1.05 m | WoodFloor007 |
| walnut | 1.05 m | WoodFloor037 |
| tile800 | 0.8 m | Marble015 |
| tile600 | 0.6 m | Marble014 |
| marble | 1.2 m | Marble012 |
| terrazzo | 1.0 m | Terrazzo007 |
| carpet | 0.5 m | Carpet014 |
| antislip | 1.8 m | Tiles095 |

`src/features/canvas3d/modelFactory.js` 中的 `PBR_FLOORS` 引用这些目录；`coverM` 对应上表平铺尺寸。

## env/ — HDRI 环境光（polyhaven.com）

- `studio_small_03_1k.hdr`：室内工作室环境光，由 `Scene3D.tsx` 经 PMREM 预过滤后作为 IBL 环境贴图。

## 更换 / 新增素材

1. 从 ambientCG / Poly Haven 下载 1K JPG（或 HDR）；
2. 按上表目录结构放入，重命名为 `color/normal/roughness.jpg`；
3. 在 `PBR_FLOORS` 中登记目录与 `coverM`（贴图覆盖的真实米数，决定平铺密度）。
