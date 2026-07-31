import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "헬스장 업무 대시보드",
  description: "지점 · 회원 · 매출 · 근태 통합 관리",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171b1e" },
  ],
};

/**
 * 화면이 그려지기 전에 저장된 테마를 먼저 입힌다.
 * 이게 없으면 다크모드인데도 흰 화면이 한 번 번쩍인다.
 */
const THEME_BOOT = `
(function(){
  try {
    var t = localStorage.getItem("gym_theme");
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
