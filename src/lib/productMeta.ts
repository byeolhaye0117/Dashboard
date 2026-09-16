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
  /**
   * 개월수를 골라 파는 상품인가
   *
   * 「Y」면 그렇다, 「N」이면 아니다, 비어 있으면 갈래로 짐작한다.
   * 비어 있는 자리를 남겨 둔 까닭은, 이 칸이 생기기 전에 만든 상품이
   * 지금까지와 똑같이 팔려야 하기 때문이다 — 사물함이 갑자기 한 달치만
   * 팔리기 시작하면 안 된다.
   */
  perMonth: "Y" | "N" | "";
  /**
   * 지금 팔 수 있는 상품인가
   *
   * 판매중지된 상품도 목록에 담아 보낸다 — 이미 결제하신 회원의 이용권에서
   * 이름과 갈래를 찾아야 하기 때문이다. 파는 자리에서만 이 표시로 가린다.
   */
  onSale: boolean;
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

  let unit: "개월" | "일" =
    val(r, ["기간단위", "단위"]).trim() === "일" ? "일" : "개월";
  let term = totalMonths || payMonths + freeMonths;

  /*
   * 하루짜리 상품에 기간을 안 적어 두셨을 때
   *
   * 기간이 비어 있으면 화면이 1개월로 잡는다. 그래서 「일일권」을 팔면
   * 26-08-19 ~ 26-09-18 로 한 달이 잡혔다 — 하루 쓰고 가시는 분이 한 달
   * 회원으로 남는다.
   *
   * 이름이 하루를 말하고 있는데 기간이 비어 있으면 하루로 본다. 이름에
   * 기대는 것은 원래 좋지 않지만, 이건 적힌 값을 뒤집는 것이 아니라
   * 비어 있는 자리를 메우는 것이다. 상품 관리에서 기간단위를 「일」로,
   * 기간을 1로 적어 두시면 이 짐작은 아예 안 쓰인다.
   */
  const 이름 = val(r, ["상품명"]).replace(/\s/g, "");
  if (term === 0 && /일일권|1일권|원데이|데이패스|하루/i.test(이름)) {
    unit = "일";
    term = 1;
  }

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
    perMonth: perMonthOf(val(r, ["개월선택", "개월고르기", "월단위판매"])),
    /* 칸이 비어 있으면 판매중으로 본다 — 이 칸이 생기기 전 상품이 그렇다 */
    onSale: (val(r, ["판매상태", "상태", "판매"]) || "판매중") !== "판매중지",
    order: num(val(r, ["정렬순서", "순서", "정렬"])),
  };
}

/** 시트에 적힌 글자를 Y · N · 빈칸 셋 중 하나로 */
function perMonthOf(v: string): "Y" | "N" | "" {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return "";
  if (["y", "yes", "예", "o", "true", "✅"].includes(s)) return "Y";
  if (["n", "no", "아니오", "아니요", "x", "false"].includes(s)) return "N";
  return "";
}

/** 상품 화면에서 부가 상품으로 정한 이름들. 「기타」는 예전에 쓰던 이름이다 */
const EXTRA_KINDS = ["부가상품권", "부가상품", "부가", "기타", "용품"];

/**
 * 이 상품은 개월수를 골라 파는가
 *
 * ── 무엇이 달라지나 ────────────────────────────────────────
 * 그렇다고 하면 파는 자리에 「기간」 고르개가 서고, 상품에 적힌 기본 개월을
 * 한 단위로 보아 고른 개월만큼 값이 곱해진다. 1개월 11,000원짜리 사물함을
 * 3개월 고르면 33,000원이다.
 *
 * ── 왜 짐작이 남아 있나 ────────────────────────────────────
 * 이 칸이 생기기 전에 만든 상품에는 적힌 값이 없다. 그것들이 지금까지와
 * 똑같이 팔려야 해서, 비어 있으면 예전처럼 갈래로 짐작한다. 상품을 한 번
 * 열어 저장하시면 그때부터는 적힌 값이 먼저다.
 *
 * 횟수로 파는 것(PT 10회)은 몇 달 안에 쓰든 값이 같으므로 곱하면 안 된다.
 * 돈을 안 받고 얹어주는 서비스도 곱할 값이 없다.
 */
export function sellsByMonth(p: {
  perMonth?: string; kind?: string;
  isService?: boolean; isOption?: boolean; count?: number;
}): boolean {
  const v = (p.perMonth ?? "").trim().toUpperCase();
  if (v === "Y") return true;
  if (v === "N") return false;

  const k = (p.kind ?? "").replace(/\s/g, "");
  if (p.isService || k === "서비스") return false;
  const 횟수제 = (p.count ?? 0) > 0 || /PT|수업/.test(p.kind ?? "");
  if (횟수제) return false;
  return p.isOption || k === "옵션" || EXTRA_KINDS.includes(k);
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
