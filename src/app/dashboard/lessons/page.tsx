import Coming from "../Coming";

export const dynamic = "force-dynamic";

export default async function LessonsPage() {
  return Coming({
    menu: "PT·수업",
    crumb: "PT · 수업",
    plan: [
      "트레이너별 오늘 수업 일정 — 시간, 회원, 남은 회차",
      "수업 진행 기록 — 했는지 · 미뤘는지 · 노쇼인지",
      "회원 이용권에서 회차 자동 차감",
      "그룹수업 정원과 예약",
      "트레이너별 이달 수업 수와 매출 기여",
    ],
  });
}
