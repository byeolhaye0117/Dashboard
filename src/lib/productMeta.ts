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

/**
 * 상품 카테고리
 *
 * 오타 하나로 일곱 개가 되면 안 되니 여기 한 줄로 둔다. 적힌 차례가 화면에
 * 나오는 차례다. 이 파일은 구글 접속 코드를 안 물고 있어서 화면(브라우저)
 * 쪽에서도 그대로 쓸 수 있다 — 상품 화면이 따로 베껴 두었다가 어긋났었다.
 *
 * ── 「그룹수강권」을 따로 둔 까닭 ────────────────────────────
 * PT 잡기 화면에 그룹수업 이용권까지 섞여 떴다. 상품 이름에 「그룹」이
 * 들어 있는지로 갈랐더니, 이름을 그렇게 안 지은 상품이 1:1 목록에 들어왔다.
 * 이름에 기대면 오타 하나에 또 무너진다. 파는 자리에서 한 번 정하게 한다.
 */
export const KINDS = [
  "회원권", "수강권", "그룹수강권", "케어권", "부가상품권", "서비스",
] as const;

export type ProductMeta = {
  code: string;
  name: string;
  /** 회원권 / 1:1PT / 그룹수업 / 기타 / 서비스 / 옵션 */
  kind: string;
  /**
   * 기간을 무엇으로 세는가 — 「개월」 또는 「일」
   *
   * 예전에는 개월뿐이었다. 하루 이용권이나 10일권처럼 짧은 상품을 만들
   * 길이 없었다. 시트에 「기간단위」 칸이 없거나 비면 개월로 본다 —
   * 지금까지 만들어 둔 상품이 그대로 읽혀야 한다.
   */
  unit: "개월" | "일";
  /** 이용 개월 (결제 + 서비스). 단위가 「일」이면 0 이다 */
  months: number;
  /** 이용 일수 (결제 + 서비스). 단위가 「개월」이면 0 이다 */
  days: number;
  /** 이용 횟수 (결제 + 서비스) */
  count: number;
  cash: number;
  card: number;
  /** 돈을 안 받고 얹어주는 항목인가 */
  isService: boolean;
  /** 회원권에 붙는 추가 요금인가 */
  isOption: boolean;
  /** 상품 관리에서 끌어 정한 차례. 작을수록 위, 0이면 안 정한 것 */
  order: number;
};

export function readProduct(r: Row): ProductMeta {
  const payMonths = num(val(r, ["결제개월"]));
  const freeMonths = num(val(r, ["서비스개월"]));
  const totalMonths = num(val(r, ["총이용개월", "총개월", "이용개월"]));

  const payCount = num(val(r, ["결제횟수"]));
  const freeCount = num(val(r, ["서비스횟수"]));
  const totalCount = num(val(r, ["총횟수", "총이용횟수"]));

  const yes = (v: string) => ["y", "yes", "예", "o", "true", "✅"].includes(v.trim().toLowerCase());

  const unit: "개월" | "일" =
    val(r, ["기간단위", "단위"]).trim() === "일" ? "일" : "개월";
  const term = totalMonths || payMonths + freeMonths;

  return {
    code: val(r, ["상품코드"]),
    name: val(r, ["상품명"]),
    kind: val(r, ["상품분류", "분류", "구분"]),
    unit,
    months: unit === "개월" ? term : 0,
    days: unit === "일" ? term : 0,
    count: totalCount || payCount + freeCount,
    cash: num(val(r, ["현금가", "현금(계좌)가", "현금계좌가", "현금"])),
    card: num(val(r, ["카드가", "카드"])),
    isService: yes(val(r, ["서비스상품", "무료서비스상품여부", "서비스"])),
    isOption: yes(val(r, ["옵션상품", "옵션상품여부", "옵션"])),
    order: num(val(r, ["정렬순서", "순서", "정렬"])),
  };
}

/**
 * 기간을 사람이 읽는 말로
 *
 * 「3개월」 「10일」. 기간이 없는 상품(횟수제)은 빈 글자다.
 * 화면 여러 곳에서 같은 말이 나와야 해서 여기 한 줄로 둔다.
 */
export function termOf(p: { unit?: string; months?: number; days?: number }): string {
  if (p.unit === "일") return p.days ? `${p.days}일` : "";
  return p.months ? `${p.months}개월` : "";
}
