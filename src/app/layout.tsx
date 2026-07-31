import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "헬스장 업무 대시보드",
  description: "지점 · 회원 · 매출 · 근태 통합 관리",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          background: "#f6f7f9",
          color: "#1a1a1a",
          fontFamily:
            "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
          WebkitTextSizeAdjust: "100%",
        }}
      >
        {children}
      </body>
    </html>
  );
}
