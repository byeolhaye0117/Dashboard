import Coming from "../Coming";

export const dynamic = "force-dynamic";

export default async function FacilityPage() {
  return Coming({
    menu: "시설·재고",
    crumb: "시설 · 재고",
    plan: [
      "기구 목록과 상태 — 정상 · 점검 필요 · 수리 중",
      "고장 신고와 처리 이력",
      "비품 재고 (수건, 음료, 소모품) 와 부족 알림",
      "정기 점검 주기와 다음 점검일",
      "지점별 비품 사용량 비교",
    ],
  });
}
