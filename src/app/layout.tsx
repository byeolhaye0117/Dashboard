import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "헬스장 업무 대시보드",
  description: "지점 · 회원 · 매출 · 근태 통합 관리",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 휴대폰 상단 표시줄 색 — globals.css 의 --bg 와 같은 값이어야 한다.
  // 안 맞으면 화면 위쪽에 다른 색 띠가 하나 더 있는 것처럼 보인다.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f3f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
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
        {/*
          글자체 — Pretendard (동적 서브셋)

          globals.css 의 --ko 에 이름만 적어두고 실제로 받아오지 않았다. 그래서
          맥에서만 제대로 보이고 윈도우에서는 맑은 고딕, 안드로이드에서는 기본
          고딕으로 떨어졌다. 자간·줄간격을 Pretendard 기준으로 맞춰 놨으니
          다른 글자체가 들어오면 그 값이 전부 어긋난다.

          동적 서브셋은 화면에 실제로 쓰인 글자에 해당하는 조각만 내려받는다
          (전체 2MB 대신 수십 KB). 첫 화면이 느려지지 않는다.

          CSS 의 @import 가 아니라 여기에 link 로 두는 이유 — @import 는
          globals.css 를 다 받은 뒤에야 글자체를 받으러 출발한다. head 의 link 는
          동시에 출발한다.
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
