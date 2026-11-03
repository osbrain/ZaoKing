# ZaoKing

ZaoKing 是一款面向装修业主和独立设计师的 Web 室内设计工具，提供户型编辑、家具布置、材质调整、AI 辅助设计和 2D / 3D 同步预览。

## 当前功能

- 编辑墙体、房间、门窗和户型尺寸，并在 2D 平面图与 3D 场景之间切换。
- 从组件库添加家具，调整位置、朝向和尺寸；支持自定义组件与材质。
- 使用自然语言让 AI 辅助修改设计。文本设计助手通过 DeepSeek 兼容接口接入。
- 上传户型截图并调用视觉模型生成可编辑的户型草稿。
- 保存项目与 AI 对话；导入、导出参数化设计数据包。
- 使用 PBR 地板贴图和 HDRI 环境光改善 3D 预览效果。

## 技术栈

- Next.js 14 App Router、React 18、TypeScript、Tailwind CSS
- Three.js、React Three Fiber、Zustand
- Prisma ORM、SQLite（本地默认配置）
- Zod、Vitest

## 本地运行

需要 Node.js 20 或更新的 LTS 版本，以及 npm。

```bash
cp .env.example .env
npm install
npx prisma db push
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

在 `.env` 中设置 `DEEPSEEK_API_KEY` 启用 AI 文本助手；设置 `VISION_API_KEY` 启用户型截图识别。密钥只保存在本地环境文件中，不要提交 `.env`。

## 常用命令

```bash
npm run typecheck
npm test
npm run build
npm start
```

`npm run build` 会写入 Next.js 构建目录 `.next`。不要与正在运行的开发服务器并行执行；构建后如遇开发缓存错误，重启 `npm run dev`。

## 代码结构

```text
src/
  app/          页面与 API 路由
  core/         设计文档、Schema、几何、命令和校验等领域逻辑
  features/     编辑器、2D/3D 画布、组件库、AI 助手等功能模块
  lib/          数据库、AI Provider、请求与自动保存等基础服务
  stores/       Zustand 编辑器与场景状态
tests/unit/     按领域、功能和 API 分组的单元测试
prisma/         Prisma 数据模型
public/textures/ 3D 场景使用的地板和环境贴图
```

## 数据与部署说明

默认 Prisma 数据源为 SQLite，数据库文件位于 `prisma/dev.db`，该本地文件已加入 Git 忽略规则。当前 schema 以本地开发为目标；部署前应根据目标数据库配置 Prisma provider、连接字符串、迁移流程和备份策略。

项目代码尚未声明开源许可证。公开仓库前请确认你希望采用的代码许可证；贴图素材的来源与授权说明见 [public/textures/README.md](public/textures/README.md)。
