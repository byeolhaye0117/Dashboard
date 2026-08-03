/**
 * 상품 한 줄에서 필요한 값 꺼내기
 *
 * 만료일과 금액을 자동으로 채우려면 상품의 개월 수·횟수·가격을 알아야 한다.
 * 시트 칸 이름이 조금 달라도 되도록 여러 후보를 본다.
 * 못 찾은 값은 0 이 되고, 화면에서 직원이 직접 채우면 된다.
 */
import type { Row } from "./sheets";
import { pick } from "./columns";

const num = (v: string) => {
  const n = Number((v ?? "").toString().replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function val(r: Row, candidates: string[]): string {
  const key = pick(Object.keys(r), candidates);
  return key ? (r[key] ?? "").trim() : "";
}

export type ProductMeta = {
  code: string;
  name: string;
  /** 회원권 / 1:1PT / 그룹수업 / 기타 / 서비스 / 옵션 */
  kind: string;
  /** 이용 개월 (결제 + 서비스) */
  months: number;
  /** 이용 횟수 (결제 + 서비스) */
  count: number;
  cash: number;
  card: number;
  /** 돈을 안 받고 얹어주는 항목인가 */
  isService: boolean;
  /** 회원권에 붙는 추가 요금인가 */
  isOption: boolean;
};

export function readProduct(r: Row): ProductMeta {
  const payMonths = num(val(r, ["결제개월"]));
  const freeMonths = num(val(r, ["서비스개월"]));
  const totalMonths = num(val(r, ["총이용개월", "총개월", "이용개월"]));

  const payCount = num(val(r, ["결제횟수"]));
  const freeCount = num(val(r, ["서비스횟수"]));
  const totalCount = num(val(r, ["총횟수", "총이용횟수"]));

  const yes = (v: string) => ["y", "yes", "예", "o", "true", "✅"].includes(v.trim().toLowerCase());

  return {
    code: val(r, ["상품코드"]),
    name: val(r, ["상품명"]),
    kind: val(r, ["상품분류", "분류", "구분"]),
    months: totalMonths || payMonths + freeMonths,
    count: totalCount || payCount + freeCount,
    cash: num(val(r, ["현금가", "현금(계좌)가", "현금계좌가", "현금"])),
    card: num(val(r, ["카드가", "카드"])),
    isService: yes(val(r, ["서비스상품", "무료서비스상품여부", "서비스"])),
    isOption: yes(val(r, ["옵션상품", "옵션상품여부", "옵션"])),
  };
}
