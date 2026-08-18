/**
 * 회원 · 이용권 · 결제
 *
 * 회원 한 명 아래에 이용권이 여러 개 달린다. (헬스 + PT + 락커)
 * 한 번 등록할 때 낸 돈은 결제 한 줄로 묶이고, 그 결제에 이용권 여러 개가 매달린다.
 *
 * 시트 칸 이름이 조금 달라도 되도록 columns.ts 로 이어준다.
 */
import {
  readSheet, appendRow, appendRows, updateRow, updateRows,
  addColumns, createSheet, listSheetNames, type Row,
} from "./sheets";
import { resolve, toSheetRow, get, type ColumnMap, type ColumnSpec } from "./columns";
import { now, today, addDays, daysBetween } from "./time";
import { formatPhone } from "./phone";
import { patchConsultation } from "./consultations";
import { addMonths } from "./dateCalc";
import type { ProductMeta } from "./productMeta";

export const SHEET_M = "회원";
export const SHEET_V = "이용권";
/** 이용권에 얹어준 서비스·옵션 (회원권을 팔 때 같이 준 것) */
export const SHEET_VS = "이용권서비스";
export const SHEET_P = "결제";
/** 상품 원장 — 갈래(상품분류)가 여기 있다 */
export const SHEET_PROD = "상품";


/* ── 칸 이름 후보 ──────────────────────────── */

const M_COLS: ColumnSpec = {
  회원번호: { names: ["회원 번호", "회원ID"], required: true },
  이름: { names: ["회원명", "성명"], required: true },
  전화번호: { names: ["휴대폰", "연락처", "휴대폰번호", "전화"], required: true },
  성별: { names: [] },
  나이대: { names: ["연령대", "나이"] },
  거주동네: { names: ["거주지역", "거주지", "동네"] },
  /* 뒤늦게 생긴 칸이다. 없으면 저장할 때 스스로 만든다 */
  직업: { names: ["하는 일", "업종"] },
  지점코드: { names: ["소속지점", "등록지점", "지점"], required: true },
  가입일: { names: ["최초등록일", "등록일", "가입일자"], required: true },
  담당직원사번: { names: ["담당트레이너사번", "담당직원", "담당트레이너", "담당사번"] },
  회원상태: { names: ["상태"] },
  상담번호: { names: ["전환상담번호", "유입상담번호"] },
  메모: { names: ["특이사항", "비고"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

/**
 * 정지와 양도에 쓰는 칸들 — 뒤늦게 생긴 것이라 없으면 만든다
 *
 * 정지일수만 있으면 "며칠 밀렸나"는 알아도 "지금 멈춰 있나"를 알 수 없다.
 */
const HOLD_COLUMNS = ["정지시작일", "정지종료예정일"];

/** 이용권이 누구에게서 누구에게 넘어갔는지 — 돈이 걸린 일이라 기록을 남긴다 */
export const SHEET_TR = "이용권양도";
export const TR_HEADERS = [
  "양도번호", "이용권번호", "준회원번호", "받은회원번호", "양도일",
  "수수료", "결제번호", "메모", "등록일시", "등록자", "삭제여부",
];

const TR_COLS: ColumnSpec = {
  양도번호: { names: ["양도 번호"], required: true },
  이용권번호: { names: [], required: true },
  준회원번호: { names: ["양도인", "보낸회원번호"], required: true },
  받은회원번호: { names: ["양수인"], required: true },
  양도일: { names: [] },
  수수료: { names: ["양도수수료"] },
  결제번호: { names: [] },
  메모: { names: ["비고"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  삭제여부: { names: [] },
};

const V_COLS: ColumnSpec = {
  이용권번호: { names: ["이용권 번호", "이용권ID"], required: true },
  회원번호: { names: ["회원 번호"], required: true },
  상품코드: { names: ["상품", "상품번호"], required: true },
  지점코드: { names: ["지점", "등록지점"], required: true },
  시작일: { names: ["이용시작일"], required: true },
  종료일: { names: ["만료일", "이용종료일"], required: true },
  총횟수: { names: ["총 횟수", "전체횟수"] },
  잔여횟수: { names: ["남은횟수", "잔여 횟수"] },
  정지일수: { names: ["홀딩일수"] },
  정지시작일: { names: ["홀딩시작일"] },
  정지종료예정일: { names: ["홀딩종료예정일", "정지예정일"] },
  금액: { names: ["결제금액", "판매금액", "가격"] },
  할인: { names: ["할인액", "할인금액"] },
  미수금: { names: ["미수금액", "외상"] },
  담당트레이너사번: { names: ["담당트레이너", "담당직원사번", "담당직원"] },
  등록직원사번: { names: ["등록처리직원", "등록직원", "처리직원사번"] },
  상태: { names: ["이용권상태", "진행상태"] },
  결제번호: { names: ["결제 번호"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

const VS_COLS: ColumnSpec = {
  번호: { names: ["이용권서비스번호", "서비스번호", "순번"] },
  이용권번호: { names: ["이용권 번호"], required: true },
  상품코드: { names: ["상품", "상품번호"], required: true },
  추가금액: { names: ["금액", "옵션금액"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

const P_COLS: ColumnSpec = {
  결제번호: { names: ["결제 번호", "결제ID"], required: true },
  회원번호: { names: ["회원 번호"], required: true },
  이용권번호: { names: ["이용권 번호"] },
  지점코드: { names: ["지점", "등록지점"], required: true },
  결제일시: { names: ["결제일", "결제일자"], required: true },
  결제금액: { names: ["총결제금액", "금액", "결제 금액"], required: true },
  결제수단: { names: ["결제유형", "결제방법"], required: true },
  // 현금·카드·계좌를 나눠 적는 시트라면 여기에도 같이 넣는다 (카드+계좌 분납 대비)
  현금액: { names: ["현금"] },
  카드액: { names: ["카드"] },
  계좌액: { names: ["계좌", "계좌이체액"] },
  매출유형: { names: [] },
  미수금액: { names: ["미수금"] },
  미수금결제예정일: { names: ["미수금예정일"] },
  담당직원사번: { names: ["담당직원", "처리직원사번", "등록직원사번"] },
  환불여부: { names: [] },
  환불액: { names: ["환불금액"] },
  // 아래 넷은 시트에 없어도 화면이 돌아가야 한다. 없으면 빈 값으로 읽힌다
  환불진행상태: { names: ["환불상태"] },
  환불사유: { names: ["환불사유내용"] },
  환불신청일: { names: ["환불접수일"] },
  환불완료일: { names: ["환불지급일"] },
  메모: { names: ["비고"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

/* ── 읽기 ──────────────────────────────────── */

export type Member = {
  id: string;
  이름: string;
  전화번호: string;
  성별: string;
  나이대: string;
  거주동네: string;
  직업: string;
  지점코드: string;
  가입일: string;
  담당직원사번: string;
  회원상태: string;
  상담번호: string;
  메모: string;
  등록일시: string;
  등록자: string;
  수정일시: string;
  수정자: string;
  rowNumber: number;
};

export type Ticket = {
  id: string;
  회원번호: string;
  상품코드: string;
  지점코드: string;
  시작일: string;
  종료일: string;
  총횟수: string;
  잔여횟수: string;
  정지일수: string;
  /** 비어 있지 않으면 지금 멈춰 있다 */
  정지시작일: string;
  /** 미리 정해 둔 정지 끝나는 날. 비어 있으면 "재개할 때까지" */
  정지종료예정일: string;
  담당트레이너사번: string;
  상태: string;
  결제번호: string;
  금액: string;
  /** 정가에서 깎아 드린 금액 */
  할인: string;
  /** 이 상품에서 아직 못 받은 돈 */
  미수금: string;
  /** 언제 만들어진 줄인지 — 결제번호가 없던 옛 줄을 날짜로 이어 붙일 때 쓴다 */
  등록일시: string;
};

export type Payment = {
  id: string;
  회원번호: string;
  결제일시: string;
  결제금액: string;
  결제수단: string;
  지점코드: string;
  미수금액: string;
  미수금결제예정일: string;
  환불여부: string;
  환불액: string;
  환불진행상태: string;
  환불사유: string;
  환불신청일: string;
  환불완료일: string;
  매출유형: string;
  현금액: string;
  카드액: string;
  계좌액: string;
  담당직원사번: string;
  /** 이 줄을 넣은 사람과 시각 — 「내가 한 적 없는데」를 확인할 유일한 자리다 */
  등록자: string;
  등록일시: string;
};

export async function listMembers(): Promise<{
  cols: ColumnMap;
  headers: string[];
  items: Member[];
}> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_M);
  const cols = resolve(SHEET_M, headers, M_COLS);
  const items: Member[] = [];
  rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(r, cols, "회원번호");
    if (!id) return;
    items.push({
      id,
      이름: get(r, cols, "이름"),
      전화번호: get(r, cols, "전화번호"),
      성별: get(r, cols, "성별"),
      나이대: get(r, cols, "나이대"),
      거주동네: get(r, cols, "거주동네"),
      직업: get(r, cols, "직업"),
      지점코드: get(r, cols, "지점코드"),
      가입일: get(r, cols, "가입일"),
      담당직원사번: get(r, cols, "담당직원사번"),
      회원상태: get(r, cols, "회원상태") || "유효",
      상담번호: get(r, cols, "상담번호"),
      메모: get(r, cols, "메모"),
      등록일시: get(r, cols, "등록일시"),
      등록자: get(r, cols, "등록자"),
      수정일시: get(r, cols, "수정일시"),
      수정자: get(r, cols, "수정자"),
      rowNumber: rowNumbers[i],
    });
  });
  items.sort((a, b) => (b.가입일 ?? "").localeCompare(a.가입일 ?? ""));
  return { cols, headers, items };
}

export async function listTickets(): Promise<Ticket[]> {
  const { headers, rows } = await readSheet(SHEET_V);
  const cols = resolve(SHEET_V, headers, V_COLS);
  const out: Ticket[] = [];
  rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(r, cols, "이용권번호");
    if (!id) return;
    out.push({
      id,
      회원번호: get(r, cols, "회원번호"),
      상품코드: get(r, cols, "상품코드"),
      지점코드: get(r, cols, "지점코드"),
      시작일: get(r, cols, "시작일"),
      종료일: get(r, cols, "종료일"),
      총횟수: get(r, cols, "총횟수"),
      잔여횟수: get(r, cols, "잔여횟수"),
      정지일수: get(r, cols, "정지일수"),
      정지시작일: get(r, cols, "정지시작일"),
      정지종료예정일: get(r, cols, "정지종료예정일"),
      금액: get(r, cols, "금액"),
      할인: get(r, cols, "할인"),
      미수금: get(r, cols, "미수금"),
      담당트레이너사번: get(r, cols, "담당트레이너사번"),
      상태: get(r, cols, "상태") || "진행중",
      결제번호: get(r, cols, "결제번호"),
      등록일시: get(r, cols, "등록일시"),
    });
  });
  return out;
}

export type TicketService = {
  id: string;
  이용권번호: string;
  상품코드: string;
  추가금액: string;
};

/**
 * 이용권에 얹어준 서비스·옵션
 *
 * 회원권을 팔 때 직원이 무료 서비스나 옵션을 골라 얹어준 기록이다.
 * 기간이나 횟수를 따로 세지 않고 "무엇을 줬는지"만 남긴다.
 */
export async function listTicketServices(): Promise<TicketService[]> {
  const { headers, rows } = await readSheet(SHEET_VS);
  const cols = resolve(SHEET_VS, headers, VS_COLS);
  const out: TicketService[] = [];
  rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const ticket = get(r, cols, "이용권번호");
    const code = get(r, cols, "상품코드");
    if (!ticket || !code) return;
    out.push({
      id: get(r, cols, "번호") || `${ticket}-${i}`,
      이용권번호: ticket,
      상품코드: code,
      추가금액: get(r, cols, "추가금액"),
    });
  });
  return out;
}

export async function listPayments(): Promise<Payment[]> {
  const { headers, rows } = await readSheet(SHEET_P);
  const cols = resolve(SHEET_P, headers, P_COLS);
  const out: Payment[] = [];
  rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(r, cols, "결제번호");
    if (!id) return;
    out.push({
      id,
      회원번호: get(r, cols, "회원번호"),
      결제일시: get(r, cols, "결제일시"),
      결제금액: get(r, cols, "결제금액"),
      결제수단: get(r, cols, "결제수단"),
      지점코드: get(r, cols, "지점코드"),
      미수금액: get(r, cols, "미수금액"),
      미수금결제예정일: get(r, cols, "미수금결제예정일"),
      환불여부: get(r, cols, "환불여부"),
      환불액: get(r, cols, "환불액"),
      환불진행상태: get(r, cols, "환불진행상태"),
      환불사유: get(r, cols, "환불사유"),
      환불신청일: get(r, cols, "환불신청일"),
      환불완료일: get(r, cols, "환불완료일"),
      매출유형: get(r, cols, "매출유형"),
      현금액: get(r, cols, "현금액"),
      카드액: get(r, cols, "카드액"),
      계좌액: get(r, cols, "계좌액"),
      담당직원사번: get(r, cols, "담당직원사번"),
      /* 「이 결제 누가 넣었지」를 물을 수 있어야 한다. 시트를 열지 않고도 알게 */
      등록자: get(r, cols, "등록자"),
      등록일시: get(r, cols, "등록일시"),
    });
  });
  return out;
}

/* ── 번호 만들기 ──────────────────────────── */

function nextId(existing: string[], prefix: string, width: number): string {
  let max = 0;
  existing.forEach((v) => {
    const m = (v ?? "").match(new RegExp(`^${prefix}(\\d+)$`));
    if (!m) return;
    const n = Number(m[1]);
    if (n > max) max = n;
  });
  return prefix + String(max + 1).padStart(width, "0");
}

/* ── 등록 ──────────────────────────────────── */

export type NewTicket = {
  /** 정가에서 깎아 드린 금액 */
  할인?: string;
  /** 이 상품에서 아직 못 받은 돈 */
  미수금?: string;
  상품코드: string;
  시작일: string;
  종료일: string;
  총횟수?: string;
  담당트레이너사번?: string;
  /** 이 상품으로 실제 받은 금액 — 상품별 매출을 보려면 있어야 한다 */
  금액?: string;
};

export type NewMember = {
  이름: string;
  전화번호: string;
  성별?: string;
  나이대?: string;
  거주동네?: string;
  직업?: string;
  지점코드: string;
  가입일: string;
  담당직원사번?: string;
  /** 이 판매를 누구 실적으로 다는가 — 회원의 담당 트레이너와 다른 값이다 */
  결제담당사번?: string;
  메모?: string;
  /** 상담에서 넘어온 경우 그 상담번호 */
  상담번호?: string;
  이용권: NewTicket[];
  /** 회원권에 얹어준 서비스·옵션 */
  부가서비스?: { 상품코드: string; 추가금액?: string }[];
  결제수단: string;
  결제금액: string;
  /** 카드+계좌처럼 나눠 낸 경우 각각의 금액 */
  카드액?: string;
  현금액?: string;
  계좌액?: string;
  미수금액?: string;
  미수금결제예정일?: string;
  매출유형?: string;
};

/** "550,000원" 같은 글자에서 숫자만 남긴다 */
const won = (v?: string) => Number((v ?? "").replace(/[^0-9]/g, "")) || 0;

/**
 * 결제수단에 맞는 칸에 금액을 나눠 담는다
 *
 * 카드+계좌처럼 나눠 낸 경우 직원이 적은 금액을 그대로 쓰고,
 * 한 가지 수단이면 총액을 그 칸에 넣는다.
 */
function splitAmount(input: Purchase, total: number) {
  const card = won(input.카드액);
  const cash = won(input.현금액);
  const bank = won(input.계좌액);
  if (card + cash + bank > 0) return { card, cash, bank };

  const m = (input.결제수단 ?? "").trim();
  if (m === "현금") return { card: 0, cash: total, bank: 0 };
  if (m === "계좌") return { card: 0, cash: 0, bank: total };
  return { card: total, cash: 0, bank: 0 };
}

/** 한 번의 구매 — 결제 한 줄 + 이용권 여러 줄 + 얹어준 서비스 */
export type Purchase = {
  이용권: NewTicket[];
  /** 회원권에 얹어준 서비스·옵션 */
  부가서비스?: { 상품코드: string; 추가금액?: string }[];
  결제수단: string;
  결제금액: string;
  /** 카드+계좌처럼 나눠 낸 경우 각각의 금액 */
  카드액?: string;
  현금액?: string;
  계좌액?: string;
  미수금액?: string;
  미수금결제예정일?: string;
  매출유형?: string;
  /** 이 판매를 누구 실적으로 다는가. 비면 저장한 사람이다 */
  결제담당사번?: string;
  담당직원사번?: string;
  메모?: string;
};

/**
 * 구매 한 건을 시트에 적는다
 *
 * 처음 등록할 때도, 나중에 재등록·추가할 때도 똑같이 쓴다.
 * 두 곳에서 따로 짜면 한쪽만 고쳐서 어긋나기 때문이다.
 */
async function writePurchase(
  memberId: string,
  branch: string,
  input: Purchase,
  staffId: string
): Promise<{ payId: string; firstTicket: string }> {
  /* 이용권 줄이 결제번호와 금액을 들고 있어야 「이 134,000원이 무엇이었나」를
     되짚을 수 있다. 시트에 그 칸이 없으면 적어도 조용히 사라진다 —
     실제로 금액 칸이 없어 상품별 금액이 전부 비어 있었다 */
  await addColumns(SHEET_V, ["결제번호", "금액", "할인", "미수금"]);

  const stamp = now();

  // 1) 결제 — 돈을 받은 건에 한해서만 한 줄 만든다
  const amount =
    won(input.결제금액) || won(input.카드액) + won(input.현금액) + won(input.계좌액);
  let payId = "";
  if (amount > 0) {
    const p = await readSheet(SHEET_P);
    const pCols = resolve(SHEET_P, p.headers, P_COLS);
    payId = nextId(p.rows.map((r) => get(r, pCols, "결제번호")), "PAY", 5);
    const { card, cash, bank } = splitAmount(input, amount);

    await appendRow(
      SHEET_P,
      p.headers,
      toSheetRow(
        {
          결제번호: payId,
          회원번호: memberId,
          이용권번호: "",
          지점코드: branch,
          결제일시: stamp,
          결제금액: String(amount),
          결제수단: input.결제수단,
          현금액: String(cash),
          카드액: String(card),
          계좌액: String(bank),
          매출유형: input.매출유형 ?? "",
          미수금액: String(won(input.미수금액)),
          미수금결제예정일: input.미수금결제예정일 ?? "",
          /* 데스크에서 대신 넣어 주는 일이 흔하다. 고른 사람이 있으면 그 사람이
             실적을 가져간다 — 매출 화면의 「직원별 매출」이 이 값을 그대로 센다.
             안 골랐으면 저장한 사람이다 */
          담당직원사번: (input.결제담당사번 ?? "").trim() || staffId,
          환불여부: "",
          환불액: "",
          메모: input.메모 ?? "",
          등록일시: stamp,
          등록자: staffId,
          수정일시: stamp,
          수정자: staffId,
          삭제여부: "",
        },
        pCols
      )
    );
  }

  // 2) 이용권 — 회원권 · PT · 부가 상품을 각각 한 줄로
  let firstTicket = "";
  if (input.이용권.length > 0) {
    const v = await readSheet(SHEET_V);
    const vCols = resolve(SHEET_V, v.headers, V_COLS);
    const used = v.rows.map((r) => get(r, vCols, "이용권번호"));

    for (const t of input.이용권) {
      const ticketId = nextId(used, "V", 5);
      used.push(ticketId);
      if (!firstTicket) firstTicket = ticketId;

      await appendRow(
        SHEET_V,
        v.headers,
        toSheetRow(
          {
            이용권번호: ticketId,
            회원번호: memberId,
            상품코드: t.상품코드,
            지점코드: branch,
            시작일: t.시작일,
            종료일: t.종료일,
            총횟수: t.총횟수 ?? "",
            잔여횟수: t.총횟수 ?? "",
            정지일수: "0",
            정지시작일: "",
            정지종료예정일: "",
            금액: String(won(t.금액)),
            /* 얼마를 깎았고 얼마를 못 받았는지. 나중에 「이건 왜 이 값이지」를
               답할 자리다. 결제 줄에는 합계만 남아 상품별로 되짚을 수가 없다 */
            할인: String(won(t.할인)),
            미수금: String(won(t.미수금)),
            /* 고른 사람만 담는다. 예전에는 안 고르면 결제 담당이 그대로
               트레이너로 박혔는데, 데스크에서 판 사람이 PT 를 맡는 것은
               아니다 — 실제로 그렇게 어긋났다 */
            담당트레이너사번: t.담당트레이너사번 ?? "",
            등록직원사번: staffId,
            상태: "진행중",
            결제번호: payId,
            등록일시: stamp,
            등록자: staffId,
            수정일시: stamp,
            수정자: staffId,
            삭제여부: "",
          },
          vCols
        )
      );
    }
  }

  // 3) 얹어준 서비스·옵션 — 이용권에 매달아 둔다
  const extras = input.부가서비스 ?? [];
  if (extras.length > 0 && firstTicket) {
    try {
      const vs = await readSheet(SHEET_VS);
      const vsCols = resolve(SHEET_VS, vs.headers, VS_COLS);
      const used = vs.rows.map((r) => get(r, vsCols, "번호"));

      for (const s of extras) {
        const id = nextId(used, "VS", 5);
        used.push(id);
        await appendRow(
          SHEET_VS,
          vs.headers,
          toSheetRow(
            {
              번호: id,
              이용권번호: firstTicket,
              상품코드: s.상품코드,
              추가금액: String(won(s.추가금액)),
              등록일시: stamp,
              등록자: staffId,
              수정일시: stamp,
              수정자: staffId,
              삭제여부: "",
            },
            vsCols
          )
        );
      }
    } catch (e: any) {
      // 서비스 기록에 실패해도 이용권·결제는 이미 들어갔다.
      // 여기서 되돌리면 오히려 더 꼬이므로 알리기만 한다.
      throw new Error(`저장은 됐지만 서비스 항목을 남기지 못했습니다: ${e?.message ?? e}`);
    }
  }

  return { payId, firstTicket };
}

/**
 * 회원 등록
 *
 * 회원 한 줄 + 결제 한 줄 + 이용권 여러 줄을 함께 만든다.
 * 상담에서 넘어온 경우 그 상담을 "등록"으로 바꾼다. 직원이 상담 화면에
 * 다시 들어가 상태를 고칠 필요가 없게 하기 위해서다.
 */
export async function createMember(input: NewMember, staffId: string): Promise<string> {
  const stamp = now();

  /* 뒤늦게 생긴 칸들. 없는 칸에 적으면 조용히 사라진다 */
  await addColumns(SHEET_M, ["직업", "상담번호"]);

  const m = await readSheet(SHEET_M);
  const mCols = resolve(SHEET_M, m.headers, M_COLS);
  const memberId = nextId(m.rows.map((r) => get(r, mCols, "회원번호")), "M", 5);

  await appendRow(
    SHEET_M,
    m.headers,
    toSheetRow(
      {
        회원번호: memberId,
        이름: input.이름.trim(),
        전화번호: formatPhone(input.전화번호),
        성별: input.성별 ?? "",
        나이대: input.나이대 ?? "",
        거주동네: input.거주동네 ?? "",
        직업: input.직업 ?? "",
        지점코드: input.지점코드,
        가입일: input.가입일 || today(),
        담당직원사번: input.담당직원사번 ?? "",
        회원상태: "유효",
        상담번호: input.상담번호 ?? "",
        메모: input.메모 ?? "",
        등록일시: stamp,
        등록자: staffId,
        수정일시: stamp,
        수정자: staffId,
        삭제여부: "",
      },
      mCols
    )
  );

  await writePurchase(memberId, input.지점코드, input, staffId);

  // 상담에서 넘어온 사람이면 그 상담을 등록으로 바꾼다
  if (input.상담번호) {
    try {
      await patchConsultation(
        input.상담번호,
        { 진행상태: "등록", 등록여부: "Y", 전환회원번호: memberId, 미등록사유: "" },
        staffId
      );
    } catch {
      // 상담을 못 고쳐도 회원 등록 자체는 이미 끝났다. 여기서 실패로 되돌리지 않는다.
    }
  }

  return memberId;
}

/**
 * 이미 있는 회원에게 상품을 더한다 (재등록 · PT 추가 · 사물함 등)
 *
 * 회원 줄은 건드리지 않고 이용권 · 결제만 새로 만든다.
 */
export async function addPurchase(
  memberId: string,
  branch: string,
  input: Purchase,
  staffId: string
): Promise<void> {
  if (input.이용권.length === 0 && (input.부가서비스 ?? []).length === 0) {
    throw new Error("더할 상품을 하나 이상 골라주세요.");
  }
  await writePurchase(memberId, branch, input, staffId);
}

/** 회원 정보 고치기 */
export async function patchMember(
  id: string,
  changes: Partial<Record<string, string>>,
  staffId: string
): Promise<void> {
  if (changes["직업"] !== undefined) await addColumns(SHEET_M, ["직업"]);

  const { headers, rows, rowNumbers } = await readSheet(SHEET_M);
  const cols = resolve(SHEET_M, headers, M_COLS);
  const i = rows.findIndex((r) => get(r, cols, "회원번호") === id);
  if (i < 0) throw new Error("해당 회원을 찾지 못했습니다.");

  const patch: Record<string, string> = { ...changes, 수정일시: now(), 수정자: staffId };
  if (patch["전화번호"]) patch["전화번호"] = formatPhone(patch["전화번호"]);

  const merged: Row = { ...rows[i], ...toSheetRow(patch, cols) };
  await updateRow(SHEET_M, rowNumbers[i], headers, merged);
}

/* ── 이용권 · 결제 고치기 ─────────────────── */

/**
 * 한 줄만 골라 고친다
 *
 * 시트에서 못 보던 칸까지 지우지 않도록 원래 줄 위에 덮어쓴다.
 */
async function patchOne(
  sheet: string,
  spec: ColumnSpec,
  idKey: string,
  id: string,
  changes: Record<string, string>,
  staffId: string
): Promise<void> {
  const { headers, rows, rowNumbers } = await readSheet(sheet);
  const cols = resolve(sheet, headers, spec);
  const i = rows.findIndex((r) => get(r, cols, idKey) === id);
  if (i < 0) throw new Error(`${sheet}에서 ${id} 을(를) 찾지 못했습니다.`);

  const patch = { ...changes, 수정일시: now(), 수정자: staffId };
  await updateRow(sheet, rowNumbers[i], headers, { ...rows[i], ...toSheetRow(patch, cols) });
}

/** 이용권 고치기 (기간 · 횟수 · 홀딩 · 환불) */
export async function patchTicket(
  id: string,
  changes: Record<string, string>,
  staffId: string
): Promise<void> {
  /* 뒤늦게 생긴 칸이다. 없는 칸에 적으면 조용히 사라진다 */
  if (["금액", "할인", "미수금"].some((k) => changes[k] !== undefined)) {
    await addColumns(SHEET_V, ["금액", "할인", "미수금"]);
  }
  await patchOne(SHEET_V, V_COLS, "이용권번호", id, changes, staffId);
}

/**
 * 여러 이용권의 잔여횟수를 한 번에 고친다
 *
 * 그룹수업 한 타임을 완료 처리하면 참석자 수만큼 이용권이 움직인다.
 * 하나씩 고치면 요청이 그만큼 나가서 느리고, 중간에 끊기면 일부만 빠진다.
 * delta 가 양수면 빼고, 음수면 되돌려준다.
 */
export async function bumpTicketCounts(
  moves: { id: string; delta: number }[],
  staffId: string
): Promise<void> {
  if (moves.length === 0) return;
  const { headers, rows, rowNumbers } = await readSheet(SHEET_V);
  const cols = resolve(SHEET_V, headers, V_COLS);
  const stamp = now();

  const items: { rowNumber: number; row: Row }[] = [];
  moves.forEach(({ id, delta }) => {
    const i = rows.findIndex((r) => get(r, cols, "이용권번호") === id);
    if (i < 0) return;
    const left = won(get(rows[i], cols, "잔여횟수"));
    items.push({
      rowNumber: rowNumbers[i],
      row: {
        ...rows[i],
        ...toSheetRow(
          { 잔여횟수: String(Math.max(0, left - delta)), 수정일시: stamp, 수정자: staffId },
          cols
        ),
      },
    });
  });
  await updateRows(SHEET_V, headers, items);
}

/* ── 상품 갈래 고치기 ─────────────────────── */

/**
 * 상품의 「상품분류」를 바꾼다
 *
 * 갈래(회원권 · 수강권 · 케어권 · 부가상품권)는 이 칸 하나로 정해진다.
 * 시트를 열어 고치게 하면 "왜 케어권으로 안 나오지"를 알아챈 자리에서
 * 두 화면을 오가야 한다. 알아챈 자리에서 바로 고치는 편이 맞다.
 *
 * 이 상품으로 판 이용권 전부가 같이 옮겨간다 — 상품 한 줄의 성격이 바뀌는 것이지
 * 이용권 한 줄이 바뀌는 것이 아니기 때문이다.
 */
export async function setProductKind(
  상품코드: string,
  상품분류: string,
  staffId: string
): Promise<void> {
  const code = (상품코드 ?? "").trim();
  const kind = (상품분류 ?? "").trim();
  if (!code) throw new Error("상품을 찾지 못했습니다.");
  if (!kind) throw new Error("갈래를 골라주세요.");

  const { headers, rows, rowNumbers } = await readSheet(SHEET_PROD);
  // 시트마다 칸 이름이 조금씩 달라 후보를 본다
  const codeKey = headers.find((h) => h.replace(/\s/g, "") === "상품코드");
  const kindKey =
    headers.find((h) => h.replace(/\s/g, "") === "상품분류") ??
    headers.find((h) => ["분류", "구분"].includes(h.replace(/\s/g, "")));
  if (!codeKey) throw new Error("상품 탭에 「상품코드」 칸이 없습니다.");
  if (!kindKey) throw new Error("상품 탭에 「상품분류」 칸이 없습니다.");

  const i = rows.findIndex((r) => (r[codeKey] ?? "").trim() === code);
  if (i < 0) throw new Error("해당 상품을 찾지 못했습니다.");

  const patch: Row = { ...rows[i], [kindKey]: kind };
  if (headers.includes("수정일시")) patch["수정일시"] = now();
  if (headers.includes("수정자")) patch["수정자"] = staffId;
  await updateRow(SHEET_PROD, rowNumbers[i], headers, patch);
}

/* ── 정지 · 재개 ──────────────────────────── */

/** 정지 칸이 없으면 만든다 — 예전에 만든 시트에는 없다 */
async function ensureHoldColumns(headers: string[]): Promise<boolean> {
  const missing = HOLD_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length === 0) return false;
  await addColumns(SHEET_V, missing);
  return true;
}

/**
 * 이용권을 멈춘다
 *
 * 멈추는 동안은 종료일을 건드리지 않는다. 며칠 쉬었는지는 다시 켤 때
 * 확정되기 때문이다 — 미리 밀어 두면 일찍 돌아왔을 때 되돌려야 하고,
 * 되돌리다 틀리면 회원에게 하루를 더 주거나 덜 주게 된다.
 *
 * 끝나는 날을 미리 알면 적어 둔다. 그날이 지나면 화면이 「재개하세요」라고 알린다.
 */
export async function holdTicket(
  id: string,
   시작일: string,
   종료예정일: string,
  staffId: string
): Promise<void> {
  let v = await readSheet(SHEET_V);
  if (await ensureHoldColumns(v.headers)) v = await readSheet(SHEET_V);
  const cols = resolve(SHEET_V, v.headers, V_COLS);
  const i = v.rows.findIndex((r) => get(r, cols, "이용권번호") === id);
  if (i < 0) throw new Error("해당 이용권을 찾지 못했습니다.");

  const from = (시작일 || today()).slice(0, 10);
  const until = (종료예정일 ?? "").slice(0, 10);
  if (until && until < from) throw new Error("정지 끝나는 날이 시작하는 날보다 빠릅니다.");
  if (get(v.rows[i], cols, "정지시작일")) throw new Error("이미 정지 중인 이용권입니다.");

  await updateRow(SHEET_V, v.rowNumbers[i], v.headers, {
    ...v.rows[i],
    ...toSheetRow(
      { 상태: "정지", 정지시작일: from, 정지종료예정일: until, 수정일시: now(), 수정자: staffId },
      cols
    ),
  });
}

/**
 * 다시 쓰게 한다
 *
 * 멈춰 있던 날수만큼 종료일을 뒤로 민다. 끝나는 날을 미리 정해 뒀다면
 * 그날까지만 쳐 준다 — 재개 버튼을 늦게 눌렀다고 공짜 날이 붙어서는 안 된다.
 */
export async function resumeTicket(
  id: string,
  staffId: string
): Promise<{ 늘어난일수: number; 새종료일: string }> {
  let v = await readSheet(SHEET_V);
  if (await ensureHoldColumns(v.headers)) v = await readSheet(SHEET_V);
  const cols = resolve(SHEET_V, v.headers, V_COLS);
  const i = v.rows.findIndex((r) => get(r, cols, "이용권번호") === id);
  if (i < 0) throw new Error("해당 이용권을 찾지 못했습니다.");

  const row = v.rows[i];
  const from = get(row, cols, "정지시작일").slice(0, 10);
  if (!from) throw new Error("정지 중인 이용권이 아닙니다.");

  const until = get(row, cols, "정지종료예정일").slice(0, 10);
  const nowDay = today();
  const to = until && until < nowDay ? until : nowDay;

  const days = Math.max(0, daysBetween(from, to));
  const end = get(row, cols, "종료일").slice(0, 10);
  const 새종료일 = end ? addDays(end, days) : end;
  const 누적 = (Number(get(row, cols, "정지일수")) || 0) + days;

  await updateRow(SHEET_V, v.rowNumbers[i], v.headers, {
    ...row,
    ...toSheetRow(
      {
        상태: "진행중",
        정지시작일: "",
        정지종료예정일: "",
        정지일수: String(누적),
        ...(새종료일 ? { 종료일: 새종료일 } : {}),
        수정일시: now(),
        수정자: staffId,
      },
      cols
    ),
  });

  return { 늘어난일수: days, 새종료일 };
}

/* ── 양도 ─────────────────────────────────── */

/**
 * 이용권을 다른 회원에게 넘긴다
 *
 * 이용권 줄의 주인을 바꾸고, 누가 누구에게 언제 넘겼는지를 따로 남긴다.
 * 주인만 바꿔 놓으면 나중에 "이게 왜 여기 있나"를 아무도 설명하지 못한다.
 *
 * 수수료를 받으면 받은 사람 앞으로 결제 한 줄을 만든다 — 매출에 잡혀야 한다.
 */
export async function transferTicket(
  input: {
    이용권번호: string;
    받는회원번호: string;
    양도일: string;
    수수료: string;
    결제수단: string;
    메모: string;
  },
  staffId: string
): Promise<{ 양도번호: string; 결제번호: string }> {
  const v = await readSheet(SHEET_V);
  const vCols = resolve(SHEET_V, v.headers, V_COLS);
  const i = v.rows.findIndex((r) => get(r, vCols, "이용권번호") === input.이용권번호);
  if (i < 0) throw new Error("해당 이용권을 찾지 못했습니다.");

  const 준회원번호 = get(v.rows[i], vCols, "회원번호");
  if (준회원번호 === input.받는회원번호) {
    throw new Error("같은 회원에게는 넘길 수 없습니다.");
  }

  const { items } = await listMembers();
  const 받는이 = items.find((m) => m.id === input.받는회원번호);
  if (!받는이) throw new Error("받을 회원을 찾지 못했습니다.");

  const stamp = now();
  const 양도일 = (input.양도일 || today()).slice(0, 10);
  const fee = won(input.수수료);

  // 1) 수수료 — 받은 사람 앞으로 결제 한 줄
  let payId = "";
  if (fee > 0) {
    const pSheet = await readSheet(SHEET_P);
    const pCols = resolve(SHEET_P, pSheet.headers, P_COLS);
    payId = nextId(pSheet.rows.map((r) => get(r, pCols, "결제번호")), "PAY", 5);
    const { card, cash, bank } = splitAmount(
      { 이용권: [], 결제수단: input.결제수단, 결제금액: String(fee) },
      fee
    );
    await appendRow(SHEET_P, pSheet.headers, toSheetRow({
      결제번호: payId,
      회원번호: 받는이.id,
      이용권번호: input.이용권번호,
      지점코드: 받는이.지점코드,
      결제일시: stamp,
      결제금액: String(fee),
      결제수단: input.결제수단,
      현금액: String(cash),
      카드액: String(card),
      계좌액: String(bank),
      매출유형: "양도수수료",
      미수금액: "0",
      담당직원사번: staffId,
      메모: input.메모 || `${준회원번호} → ${받는이.id} 양도 수수료`,
      등록일시: stamp,
      등록자: staffId,
      수정일시: stamp,
      수정자: staffId,
      삭제여부: "",
    }, pCols));
  }

  // 2) 양도 기록
  await createSheet(SHEET_TR, TR_HEADERS);
  const tr = await readSheet(SHEET_TR);
  const trCols = resolve(SHEET_TR, tr.headers, TR_COLS);
  const 양도번호 = nextId(tr.rows.map((r) => get(r, trCols, "양도번호")), "TF", 5);
  await appendRow(SHEET_TR, tr.headers, toSheetRow({
    양도번호,
    이용권번호: input.이용권번호,
    준회원번호,
    받은회원번호: 받는이.id,
    양도일,
    수수료: String(fee),
    결제번호: payId,
    메모: input.메모 ?? "",
    등록일시: stamp,
    등록자: staffId,
    삭제여부: "",
  }, trCols));

  // 3) 주인 바꾸기 — 지점도 받는 사람 쪽으로 따라간다
  await updateRow(SHEET_V, v.rowNumbers[i], v.headers, {
    ...v.rows[i],
    ...toSheetRow(
      {
        회원번호: 받는이.id,
        지점코드: 받는이.지점코드,
        수정일시: stamp,
        수정자: staffId,
      },
      vCols
    ),
  });

  return { 양도번호, 결제번호: payId };
}

/** 이 이용권이 지금까지 누구를 거쳐 왔나 */
export type Transfer = {
  id: string;
  이용권번호: string;
  준회원번호: string;
  받은회원번호: string;
  양도일: string;
  수수료: string;
};

export async function listTransfers(): Promise<Transfer[]> {
  const names = await listSheetNames();
  if (!names.includes(SHEET_TR)) return [];
  const tr = await readSheet(SHEET_TR);
  const cols = resolve(SHEET_TR, tr.headers, TR_COLS);
  const out: Transfer[] = [];
  tr.rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(r, cols, "양도번호");
    if (!id) return;
    out.push({
      id,
      이용권번호: get(r, cols, "이용권번호"),
      준회원번호: get(r, cols, "준회원번호"),
      받은회원번호: get(r, cols, "받은회원번호"),
      양도일: get(r, cols, "양도일").slice(0, 10),
      수수료: get(r, cols, "수수료"),
    });
  });
  return out;
}

/** 이용권 지우기 — 잘못 넣은 줄을 되돌릴 때 */
export async function softDeleteTicket(id: string, staffId: string): Promise<void> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_V);
  const cols = resolve(SHEET_V, headers, V_COLS);
  const i = rows.findIndex((r) => get(r, cols, "이용권번호") === id);
  if (i < 0) throw new Error("해당 이용권을 찾지 못했습니다.");
  await updateRow(SHEET_V, rowNumbers[i], headers, {
    ...rows[i],
    삭제여부: "Y",
    ...toSheetRow({ 수정일시: now(), 수정자: staffId }, cols),
  });
}

/**
 * 결제 고치기
 *
 * 금액을 고치면 현금·카드·계좌 칸도 같이 맞춘다.
 * 총액만 바꾸고 나머지를 두면 시트 안에서 숫자가 서로 안 맞게 된다.
 */
/**
 * 결제 한 줄을 지운다
 *
 * 회원을 지워도 그 회원의 결제는 남는다. 그래서 이름이 안 나오는 결제만
 * 매출에 덩그러니 남는 일이 생긴다 — 지울 방법이 화면에 없었다.
 * 줄을 진짜로 없애지 않고 표시만 남긴다. 돈이 오간 기록이라 흔적은 있어야 한다.
 */
export async function softDeletePayment(id: string, byId: string): Promise<void> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_P);
  const cols = resolve(SHEET_P, headers, P_COLS);
  const i = rows.findIndex((r) => get(r, cols, "결제번호") === id);
  if (i < 0) throw new Error("해당 결제를 찾지 못했습니다.");

  await updateRow(SHEET_P, rowNumbers[i], headers, {
    ...rows[i],
    ...(toSheetRow({ 삭제여부: "Y", 수정일시: now(), 수정자: byId }, cols) as Row),
  });
}

export async function patchPayment(
  id: string,
  changes: Record<string, string>,
  staffId: string
): Promise<void> {
  const next = { ...changes };
  const total = won(next["결제금액"]);
  const split = won(next["카드액"]) + won(next["현금액"]) + won(next["계좌액"]);

  if (split > 0) {
    next["결제금액"] = String(split);
  } else if (total > 0 && next["결제수단"]) {
    const m = next["결제수단"].trim();
    next["현금액"] = String(m === "현금" ? total : 0);
    next["계좌액"] = String(m === "계좌" ? total : 0);
    next["카드액"] = String(m !== "현금" && m !== "계좌" ? total : 0);
  }

  await patchOne(SHEET_P, P_COLS, "결제번호", id, next, staffId);
}

/** 회원 삭제 — 줄을 지우지 않고 표시만 남긴다 */
export async function softDeleteMember(id: string, staffId: string): Promise<void> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_M);
  const cols = resolve(SHEET_M, headers, M_COLS);
  const i = rows.findIndex((r) => get(r, cols, "회원번호") === id);
  if (i < 0) throw new Error("해당 회원을 찾지 못했습니다.");

  await updateRow(SHEET_M, rowNumbers[i], headers, {
    ...rows[i],
    삭제여부: "Y",
    ...toSheetRow({ 수정일시: now(), 수정자: staffId }, cols),
  });
}

/**
 * 여러 명을 한 번에 지운다
 *
 * 한 명씩 보내면 사람 수만큼 시트를 두드린다. 중간에 끊기면 절반만 지워진
 * 상태로 남는데, 지우는 일은 특히 그런 상태가 남으면 안 된다.
 */
export async function softDeleteMembers(ids: string[], staffId: string): Promise<number> {
  if (ids.length === 0) throw new Error("지울 회원을 골라주세요.");
  const { headers, rows, rowNumbers } = await readSheet(SHEET_M);
  const cols = resolve(SHEET_M, headers, M_COLS);
  const want = new Set(ids);
  const stamp = now();

  const items: { rowNumber: number; row: Row }[] = [];
  rows.forEach((r, i) => {
    if (!want.has(get(r, cols, "회원번호"))) return;
    items.push({
      rowNumber: rowNumbers[i],
      row: { ...r, 삭제여부: "Y", ...toSheetRow({ 수정일시: stamp, 수정자: staffId }, cols) },
    });
  });
  if (items.length === 0) throw new Error("고르신 회원을 찾지 못했습니다.");

  await updateRows(SHEET_M, headers, items);

  /*
   * 딸린 이용권·결제도 같이 지운다
   *
   * 회원만 지우면 그 사람의 결제가 매출에 그대로 남는다. 이름은 안 나오고
   * 회원번호만 덩그러니 남아서, 나중에 「이 1만원은 뭐지」를 아무도 못 푼다.
   * 실제로 그렇게 됐다. 사람을 지우면 그 사람 것도 같이 내린다.
   */
  for (const [sheet, spec] of [[SHEET_V, V_COLS], [SHEET_P, P_COLS]] as const) {
    let data;
    try {
      data = await readSheet(sheet);
    } catch {
      continue;
    }
    const c = resolve(sheet, data.headers, spec as any);
    const hits: { rowNumber: number; row: Row }[] = [];
    data.rows.forEach((r, i) => {
      if (!want.has(get(r, c, "회원번호"))) return;
      if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
      hits.push({
        rowNumber: data.rowNumbers[i],
        row: { ...r, 삭제여부: "Y", ...toSheetRow({ 수정일시: stamp, 수정자: staffId }, c) },
      });
    });
    if (hits.length > 0) await updateRows(sheet, data.headers, hits);
  }

  return items.length;
}

/* ── 예전에 넣었던 화면 확인용 가짜 자료 지우기 ──────────────
 *
 * 자료가 없을 때 화면이 어떻게 보이는지 보려고, 가짜 회원·이용권·결제를
 * 13개월치 넣는 기능이 있었다. 진짜 자료가 들어온 지금은 만드는 쪽은 지웠다.
 * 다만 예전에 넣어 둔 줄이 남아 있을 수 있어 지우는 쪽만 남긴다.
 *
 * 가짜로 넣은 줄에는 메모에 [샘플] 표시가 붙어 있다. 그 표시가 있는 것만 지운다 —
 * 진짜 자료를 건드리지 않는 유일한 기준이다.
 * ────────────────────────────────────────────────────────── */

export const SAMPLE_TAG = "[샘플]";

export async function removeSampleData(byId: string): Promise<number> {
  const stamp = now();
  let n = 0;

  /* 회원 → 그 회원의 이용권 → 그 회원의 결제 차례로 지운다.
     회원을 먼저 찾아 두어야 딸린 줄을 알아볼 수 있다. */
  const m = await readSheet(SHEET_M);
  const mCols = resolve(SHEET_M, m.headers, M_COLS);
  const ids = new Set<string>();
  const mHits: { n: number; r: Row }[] = [];
  m.rows.forEach((r, i) => {
    if (!get(r, mCols, "메모").startsWith(SAMPLE_TAG)) return;
    ids.add(get(r, mCols, "회원번호"));
    mHits.push({ n: m.rowNumbers[i], r });
  });

  if (ids.size === 0) return 0;

  for (const h of mHits) {
    await updateRow(SHEET_M, h.n, m.headers, {
      ...h.r,
      ...(toSheetRow({ 삭제여부: "Y", 수정일시: stamp, 수정자: byId }, mCols) as Row),
    });
    n += 1;
  }

  for (const [sheet, spec, key] of [
    [SHEET_V, V_COLS, "회원번호"],
    [SHEET_P, P_COLS, "회원번호"],
  ] as const) {
    let data;
    try {
      data = await readSheet(sheet);
    } catch {
      continue;
    }
    const cols = resolve(sheet, data.headers, spec as any);
    for (let i = 0; i < data.rows.length; i += 1) {
      const r = data.rows[i];
      if (!ids.has(get(r, cols, key))) continue;
      if ((r["삭제여부"] ?? "").toUpperCase() === "Y") continue;
      await updateRow(sheet, data.rowNumbers[i], data.headers, {
        ...r,
        ...(toSheetRow({ 삭제여부: "Y", 수정일시: stamp, 수정자: byId }, cols) as Row),
      });
      n += 1;
    }
  }

  return n;
}

/* ── 상담이 등록으로 바뀌면 회원 목록에 올린다 ────────────────
 *
 * 지금까지는 상담에서 「등록」으로 바꿔도 회원 목록에는 아무 일도 없었다.
 * 그래서 같은 사람을 회원 화면에서 한 번 더 손으로 넣어야 했고,
 * 그러다 빠뜨리면 등록으로 잡힌 상담과 회원 수가 어긋났다.
 *
 * 다만 상담만으로는 무엇을 얼마에 파셨는지 알 수 없다. 그래서 여기서는
 * 회원 줄만 만든다 — 이용권과 결제는 회원 화면에서 「상품 추가」로 넣으신다.
 * 없는 결제를 지어내면 매출이 틀어지고, 그건 되돌리기 어렵다.
 * ──────────────────────────────────────────────────────── */

/** 010-1234-5678 과 01012345678 을 같은 번호로 본다 */
const phoneKey = (v: string) => (v ?? "").replace(/\D/g, "");

export type Enrolled = {
  회원번호: string;
  /** 이번에 새로 만들었는가 (false 면 이미 있던 회원과 이었다) */
  새로: boolean;
  /** 이어진 회원의 이름 — 이름이 다를 때 화면에서 알려주기 위해서다 */
  이름: string;
};

/**
 * 이 상담을 회원으로 올린다. 이미 있으면 그 회원을 돌려준다
 *
 * 같은 사람인지는 전화번호로 본다. 이름은 「홍서연」과 「홍서연님」처럼
 * 조금씩 다르게 적히지만 번호는 그렇지 않다. 번호가 같은데 이름이 다르면
 * 새로 만들지 않고 이어 붙이되, 이어 붙인 회원의 이름을 돌려준다 —
 * 화면에서 그대로 보여드려야 잘못 이어졌을 때 바로 아신다.
 */
export async function enrollFromConsultation(
  c: {
    상담번호: string;
    이름: string;
    전화번호: string;
    지점코드: string;
    성별?: string;
    나이대?: string;
    담당직원사번?: string;
    메모?: string;
  },
  staffId: string
): Promise<Enrolled> {
  const key = phoneKey(c.전화번호);
  if (!c.이름?.trim()) throw new Error("이름이 없어 회원으로 올릴 수 없습니다.");
  if (!key) throw new Error("전화번호가 없어 회원으로 올릴 수 없습니다.");
  if (!c.지점코드) throw new Error("지점이 없어 회원으로 올릴 수 없습니다.");

  /* 「상담번호」 칸이 없는 시트면 어디서 온 사람인지 자국이 안 남는다.
     그러면 등록을 되돌렸을 때 어느 회원을 내려야 할지 알 수가 없다 */
  await addColumns(SHEET_M, ["상담번호", "직업"]);

  const m = await readSheet(SHEET_M);
  const mCols = resolve(SHEET_M, m.headers, M_COLS);

  /* 이미 있는 사람인가 — 지운 회원은 세지 않는다 */
  const hit = m.rows.find(
    (r) =>
      (r["삭제여부"] ?? "").toUpperCase() !== "Y" &&
      phoneKey(get(r, mCols, "전화번호")) === key
  );
  if (hit) {
    return {
      회원번호: get(hit, mCols, "회원번호"),
      새로: false,
      이름: get(hit, mCols, "이름"),
    };
  }

  const stamp = now();
  const memberId = nextId(m.rows.map((r) => get(r, mCols, "회원번호")), "M", 5);

  await appendRow(
    SHEET_M,
    m.headers,
    toSheetRow(
      {
        회원번호: memberId,
        이름: c.이름.trim(),
        전화번호: formatPhone(c.전화번호),
        성별: c.성별 ?? "",
        나이대: c.나이대 ?? "",
        거주동네: "",
        직업: "",
        지점코드: c.지점코드,
        가입일: today(),
        담당직원사번: c.담당직원사번 ?? "",
        회원상태: "유효",
        /* 어디서 온 사람인지 남긴다. 이 줄이 있으면 상담과 회원을 짝지어 볼 수 있다 */
        상담번호: c.상담번호,
        메모: c.메모 ?? "",
        등록일시: stamp,
        등록자: staffId,
        수정일시: stamp,
        수정자: staffId,
        삭제여부: "",
      },
      mCols
    )
  );

  return { 회원번호: memberId, 새로: true, 이름: c.이름.trim() };
}

/**
 * 등록을 되돌리면 자동으로 올렸던 회원을 내린다
 *
 * 상담에서 「등록」을 잘못 눌렀다가 「약속전환」으로 되돌리는 일이 있다.
 * 그때 회원 목록에 올려둔 줄이 그대로 남으면, 실제로는 등록하지 않은 사람이
 * 회원 수에 계속 잡힌다.
 *
 * 다만 무엇이든 지우지는 않는다. 지우는 것은 되돌리기 어려운 일이라
 * 아래 셋 중 하나라도 걸리면 그대로 두고 이유를 돌려준다.
 *   - 이 상담에서 만든 회원이 아니다 (원래 있던 분과 이어 붙였던 경우)
 *   - 이용권이 있다
 *   - 결제가 있다
 * 돈이 얽힌 줄을 상담 화면에서 조용히 지우면, 매출이 왜 줄었는지
 * 아무도 설명하지 못하게 된다.
 */
export type Unenrolled = {
  회원번호: string;
  이름: string;
  /** 실제로 내렸는가 */
  지움: boolean;
  /** 안 내렸다면 왜 */
  이유: string;
};

export async function unenrollFromConsultation(
  상담번호: string,
  회원번호: string,
  전화번호: string,
  staffId: string
): Promise<Unenrolled | null> {
  const m = await readSheet(SHEET_M);
  const mCols = resolve(SHEET_M, m.headers, M_COLS);
  const live = (r: Row) => (r["삭제여부"] ?? "").toUpperCase() !== "Y";

  /*
   * 어느 회원을 내려야 하는지 찾는다
   *
   * 근거가 센 것부터 본다.
   *   1) 상담에 적어 둔 전환회원번호
   *   2) 회원 줄에 남은 상담번호
   *   3) 전화번호
   *
   * 1·2 는 「이 상담이 만든 회원」이라는 자국이다. 3 은 자국이 아니라 짐작이다.
   * 실제로 시트에 그 칸들이 아예 없던 동안 만들어진 회원이 있어서, 3 이 없으면
   * 영영 못 찾는다. 대신 3 으로 찾은 것은 아래에서 훨씬 조심스럽게 다룬다.
   */
  const key = phoneKey(전화번호);
  let i = 회원번호 ? m.rows.findIndex((r) => get(r, mCols, "회원번호") === 회원번호) : -1;
  let 자국있음 = i >= 0;
  if (i < 0 && 상담번호) {
    i = m.rows.findIndex((r) => live(r) && get(r, mCols, "상담번호") === 상담번호);
    자국있음 = i >= 0;
  }
  if (i < 0 && key) {
    i = m.rows.findIndex((r) => live(r) && phoneKey(get(r, mCols, "전화번호")) === key);
  }
  if (i < 0) return null;

  const row = m.rows[i];
  const id = get(row, mCols, "회원번호");
  const 이름 = get(row, mCols, "이름");
  if (!live(row)) return null;

  /* 다른 상담이 만든 회원이면 손대지 않는다 */
  const 자국 = get(row, mCols, "상담번호");
  if (자국 && 상담번호 && 자국 !== 상담번호) {
    return 자국있음
      ? { 회원번호: id, 이름, 지움: false,
          이유: "다른 상담에서 만든 회원이라 회원 목록은 그대로 두었습니다." }
      : null;
  }

  /*
   * 돈이 얽혀 있으면 지우지 않는다
   *
   * 지우는 것은 되돌리기 어려운 일이다. 상담 화면에서 조용히 지우면
   * 매출이 왜 줄었는지 아무도 설명하지 못하게 된다.
   *
   * 자국 없이 전화번호로만 찾은 경우에는 아예 아무 말도 하지 않는다.
   * 그건 「원래 다니시던 분이 상담을 한 번 더 남긴 것」일 뿐이라,
   * 저장할 때마다 알림이 뜨면 그게 더 성가시다.
   */
  const [tickets, pays] = await Promise.all([listTickets(), listPayments()]);
  const 이용권수 = tickets.filter((t) => t.회원번호 === id).length;
  const 결제수 = pays.filter((p) => p.회원번호 === id).length;
  if (이용권수 > 0 || 결제수 > 0) {
    if (!자국있음) return null;
    return {
      회원번호: id, 이름, 지움: false,
      이유:
        `이용권 ${이용권수}건 · 결제 ${결제수}건이 붙어 있어 회원 목록은 그대로 두었습니다. ` +
        `지우실 거면 회원 화면에서 확인하고 지워주세요.`,
    };
  }

  await updateRow(SHEET_M, m.rowNumbers[i], m.headers, {
    ...row,
    삭제여부: "Y",
    ...(toSheetRow({ 수정일시: now(), 수정자: staffId }, mCols) as Row),
  });
  return {
    회원번호: id, 이름, 지움: true,
    이유: 자국있음 ? "" : "전화번호가 같고 이용권·결제가 없어 이 상담이 올린 회원으로 봤습니다.",
  };
}
