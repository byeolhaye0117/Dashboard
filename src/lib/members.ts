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
      담당트레이너사번: get(r, cols, "담당트레이너사번"),
      상태: get(r, cols, "상태") || "진행중",
      결제번호: get(r, cols, "결제번호"),
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
  지점코드: string;
  가입일: string;
  담당직원사번?: string;
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
          담당직원사번: staffId,
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
            담당트레이너사번: t.담당트레이너사번 ?? input.담당직원사번 ?? "",
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
  return items.length;
}

/* ── 화면 확인용 샘플 자료 ─────────────────── */

/** 샘플로 넣은 줄임을 표시한다. 지울 때 이 표시를 보고 찾는다 */
export const SAMPLE_TAG = "[샘플]";

const NAMES = [
  "김민준", "이서연", "박지훈", "최수아", "정예린", "강도현", "윤하은", "임재원",
  "한지우", "오채원", "서준영", "신유진", "권태윤", "황서윤", "안현우", "송다인",
  "배준호", "문가영", "조성민", "노아름", "홍민우", "전소율", "구본석", "남지호",
];

/** 같은 결과가 나오도록 씨앗을 두고 굴린다 */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/**
 * 화면을 확인해 볼 수 있게 지난 13개월치 회원·이용권·결제를 만들어 넣는다
 *
 * 지점·상품·날짜를 섞어 넣어야 지점 비교와 전년 대비가 실제로 어떻게
 * 보이는지 알 수 있다. 넣은 줄은 모두 메모에 표시를 남겨 한 번에 지울 수 있다.
 */
export async function addSampleData(
  branches: string[],
  products: ProductMeta[],
  staffIds: string[],
  byId: string
): Promise<number> {
  if (branches.length === 0) throw new Error("지점 정보를 읽지 못했습니다.");
  if (products.length === 0) throw new Error("상품 정보를 읽지 못했습니다.");

  const pick = (kind: string) => products.filter((x) => (x.kind ?? "").includes(kind) && (x.card || x.cash));
  const memberships = pick("회원권");
  const pts = pick("PT");
  const classes = pick("수업");
  const etcs = products.filter(
    (x) => (x.kind ?? "") === "기타" && (x.card || x.cash) && !x.isOption
  );
  if (memberships.length === 0) throw new Error("상품 탭에 회원권이 없습니다.");

  const [m, v, pay] = await Promise.all([
    readSheet(SHEET_M),
    readSheet(SHEET_V),
    readSheet(SHEET_P),
  ]);
  const mCols = resolve(SHEET_M, m.headers, M_COLS);
  const vCols = resolve(SHEET_V, v.headers, V_COLS);
  const pCols = resolve(SHEET_P, pay.headers, P_COLS);

  const usedM = m.rows.map((r) => get(r, mCols, "회원번호"));
  const usedV = v.rows.map((r) => get(r, vCols, "이용권번호"));
  const usedP = pay.rows.map((r) => get(r, pCols, "결제번호"));

  const stamp = now();
  const today0 = today();
  const [ty, tm] = today0.slice(0, 7).split("-").map(Number);

  const rand = rng(20260803);
  const one = <T,>(list: T[]) => list[Math.floor(rand() * list.length) % list.length];
  const weightedBranch = () => {
    const r = rand();
    if (branches.length < 2) return branches[0];
    if (r < 0.4) return branches[0];
    if (r < 0.7) return branches[1] ?? branches[0];
    if (r < 0.88) return branches[2] ?? branches[0];
    return branches[3] ?? branches[0];
  };

  const mRows: Row[] = [];
  const vRows: Row[] = [];
  const pRows: Row[] = [];
  let nameAt = 0;

  // 13개월 전부터 이번 달까지 — 전년 같은 달 비교가 가능해야 한다
  for (let back = 12; back >= 0; back--) {
    const d = new Date(Date.UTC(ty, tm - 1 - back, 1));
    const ym = d.toISOString().slice(0, 7);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    // 1월은 신규가 몰리는 달이다. 그런 결이 보여야 추이 차트가 뜻을 갖는다
    const busy = ym.endsWith("-01") ? 5 : ym.endsWith("-08") ? 4 : 3;

    for (let k = 0; k < busy; k++) {
      const branch = weightedBranch();
      const day = Math.min(lastDay, 1 + Math.floor(rand() * lastDay));
      const date = `${ym}-${String(day).padStart(2, "0")}`;
      const memberId = nextId(usedM, "M", 5);
      usedM.push(memberId);
      const name = NAMES[nameAt % NAMES.length] + (nameAt >= NAMES.length ? String(Math.floor(nameAt / NAMES.length) + 1) : "");
      nameAt += 1;
      const staff = staffIds.length > 0 ? one(staffIds) : byId;

      mRows.push(
        toSheetRow(
          {
            회원번호: memberId,
            이름: name,
            전화번호: `010-0000-${String(1000 + nameAt).slice(0, 4)}`,
            성별: rand() < 0.55 ? "남자" : "여자",
            나이대: one(["20대", "30대", "40대", "50대"]),
            거주동네: "",
            지점코드: branch,
            가입일: date,
            담당직원사번: staff,
            회원상태: "유효",
            상담번호: "",
            메모: `${SAMPLE_TAG} 화면 확인용 자료`,
            등록일시: stamp,
            등록자: byId,
            수정일시: stamp,
            수정자: byId,
            삭제여부: "",
          },
          mCols
        )
      );

      // 이 회원이 산 것 — 회원권은 늘 사고, PT·수업·기타는 가끔 얹는다
      const buys: { pr: ProductMeta; months: number }[] = [];
      buys.push({ pr: one(memberships), months: 0 });
      if (pts.length > 0 && rand() < 0.35) buys.push({ pr: one(pts), months: 0 });
      if (classes.length > 0 && rand() < 0.15) buys.push({ pr: one(classes), months: 0 });
      if (etcs.length > 0 && rand() < 0.3) buys.push({ pr: one(etcs), months: 3 });

      const payId = nextId(usedP, "PAY", 5);
      usedP.push(payId);

      let total = 0;
      const cashSide = rand() < 0.35;
      buys.forEach((b) => {
        const ticketId = nextId(usedV, "V", 5);
        usedV.push(ticketId);
        const unit = (cashSide ? b.pr.cash : b.pr.card) || b.pr.cash || b.pr.card || 0;
        const months = b.months || b.pr.months || 1;
        const amount = b.months ? unit * b.months : unit;
        total += amount;

        vRows.push(
          toSheetRow(
            {
              이용권번호: ticketId,
              회원번호: memberId,
              상품코드: b.pr.code,
              지점코드: branch,
              시작일: date,
              종료일: addMonths(date, months),
              총횟수: b.pr.count ? String(b.pr.count) : "",
              잔여횟수: b.pr.count ? String(b.pr.count) : "",
              정지일수: "0",
              금액: String(amount),
              담당트레이너사번: staff,
              등록직원사번: byId,
              상태: "진행중",
              결제번호: payId,
              등록일시: stamp,
              등록자: byId,
              수정일시: stamp,
              수정자: byId,
              삭제여부: "",
            },
            vCols
          )
        );
      });

      // 회원권을 산 적이 있는 달이 지났으면 재등록으로 본다
      const 매출유형 = back <= 6 && rand() < 0.35 ? "재등록" : "신규";
      const 미수금 = rand() < 0.12 ? Math.round(total * 0.3) : 0;
      const 환불 = rand() < 0.04;
      const method = cashSide ? (rand() < 0.5 ? "현금" : "계좌") : "카드";

      pRows.push(
        toSheetRow(
          {
            결제번호: payId,
            회원번호: memberId,
            이용권번호: "",
            지점코드: branch,
            결제일시: `${date} 15:00`,
            결제금액: String(total),
            결제수단: method,
            현금액: String(method === "현금" ? total : 0),
            카드액: String(method === "카드" ? total : 0),
            계좌액: String(method === "계좌" ? total : 0),
            매출유형,
            미수금액: String(미수금),
            미수금결제예정일: "",
            담당직원사번: staff,
            환불여부: 환불 ? "Y" : "",
            환불액: 환불 ? String(total) : "",
            메모: `${SAMPLE_TAG} 화면 확인용 자료`,
            등록일시: stamp,
            등록자: byId,
            수정일시: stamp,
            수정자: byId,
            삭제여부: "",
          },
          pCols
        )
      );
    }
  }

  await appendRows(SHEET_M, m.headers, mRows);
  await appendRows(SHEET_V, v.headers, vRows);
  await appendRows(SHEET_P, pay.headers, pRows);
  return mRows.length;
}

/**
 * 샘플로 넣은 줄을 모두 지운다
 *
 * 줄을 실제로 없애지 않고 삭제 표시만 남긴다. 다른 자료와 같은 방식이다.
 */
export async function removeSampleData(byId: string): Promise<number> {
  const stamp = now();
  const m = await readSheet(SHEET_M);
  const mCols = resolve(SHEET_M, m.headers, M_COLS);

  const ids = new Set<string>();
  const jobs: Promise<unknown>[] = [];

  m.rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    if (!get(r, mCols, "메모").startsWith(SAMPLE_TAG)) return;
    ids.add(get(r, mCols, "회원번호"));
    jobs.push(
      updateRow(SHEET_M, m.rowNumbers[i], m.headers, {
        ...r,
        삭제여부: "Y",
        ...toSheetRow({ 수정일시: stamp, 수정자: byId }, mCols),
      })
    );
  });

  if (ids.size === 0) return 0;

  const [v, pay] = await Promise.all([readSheet(SHEET_V), readSheet(SHEET_P)]);
  const vCols = resolve(SHEET_V, v.headers, V_COLS);
  const pCols = resolve(SHEET_P, pay.headers, P_COLS);

  v.rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    if (!ids.has(get(r, vCols, "회원번호"))) return;
    jobs.push(updateRow(SHEET_V, v.rowNumbers[i], v.headers, { ...r, 삭제여부: "Y" }));
  });

  pay.rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    if (!ids.has(get(r, pCols, "회원번호"))) return;
    jobs.push(updateRow(SHEET_P, pay.rowNumbers[i], pay.headers, { ...r, 삭제여부: "Y" }));
  });

  await Promise.all(jobs);
  return ids.size;
}
