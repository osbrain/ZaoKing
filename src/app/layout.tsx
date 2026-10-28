import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZaoKing · 室内设计工作台',
  description: '2D 户型 + 3D 场景 + AI 驱动的 Web 室内设计工具',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
