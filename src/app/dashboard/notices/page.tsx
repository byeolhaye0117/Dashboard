import Coming from "../Coming";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  return Coming({
    menu: "공지",
    crumb: "공지 · 업무",
    plan: [
      "대표·점장이 올리는 공지 — 지점별 또는 전체",
      "누가 읽었는지 확인",
      "매일 반복되는 업무 체크리스트 (청소, 마감 점검 등)",
      "오늘 안 끝난 일 모아보기",
      "지점 간 인수인계 메모",
    ],
  });
}
