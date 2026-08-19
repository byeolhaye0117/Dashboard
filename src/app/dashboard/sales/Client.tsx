"use client";

/**
 * 매출 대시보드
 *
 * 결제 탭이 원장이고, 이 화면은 거기서 읽은 것을 묶기만 한다.
 *
 * 내용마다 그림을 따로 골랐다.
 *  - 이번 달 매출     : 숫자 하나 + 목표 게이지 (그래프로 만들 것이 아니다)
 *  - 월별 흐름        : 꺾은선 — 흐름을 보는 자리다
 *  - 매출 구성        : 도넛 — 전체를 나눠 갖는 비중이다
 *  - 신규 · 재등록    : 가로 누적막대 — 둘뿐이라 원형은 오히려 안 읽힌다
 *  - 지점별          : 막대 + 목표 눈금 — 규모와 달성 여부를 같이 봐야 한다
 *
 * 색은 눈대중으로 고르지 않았다. 색각이상에서도 구분되는지 검사를 돌려
 * 통과한 조합만 썼다(밝은 화면·어두운 화면 각각).
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { today } from "@/lib/time";
import type { ProductMeta } from "@/lib/productMeta";
import { stageNow, baseDate } from "@/lib/stage";
import { fitsKind, KIND_PT, KIND_GROUP } from "@/lib/lessonMeta";

type Payment = {
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
  등록자: string;
  등록일시: string;
};

type Ticket = {
  id: string; 상품코드: string; 결제번호: string; 금액: string;
  /* 결제번호가 없던 옛 줄을 날짜로 잇고, 신규·재등록을 가르는 데 쓴다 */
  회원번호?: string; 시작일?: string; 등록일시?: string; 지점코드?: string;
  /* 결제 상세에서 「이 36만원이 무엇이었나」를 답하는 값들 */
  종료일?: string; 할인?: string; 미수금?: string; 총횟수?: string;
};
type Named = { code: string; name: string };
type Goal = { 지점코드: string; 연월: string; 목표금액: number };
/** 전환율·상담왕을 내기 위한 상담 한 줄 */
type Lead = {
  지점코드: string; 상담날짜: string; 약속일시: string;
  진행상태: string; 상담자사번: string;
};

/** 어떤 분들이 등록하셨나 — 회원 한 줄에서 사람을 말하는 값만 */
type Person = {
  지점코드: string; 가입일: string;
  성별: string; 나이대: string; 거주동네: string; 직업: string; 방문경로: string;
};

type Props = {
  payments: Payment[];
  people: Person[];
  /** 선택목록에 정해 둔 값들 — 아무도 안 고른 갈래도 0명으로 세우는 데 쓴다 */
  options: Record<string, string[]>;
  tickets: Ticket[];
  products: ProductMeta[];
  goals: Goal[];
  leads: Lead[];
  branches: Named[];
  staffNames: Record<string, string>;
  memberNames: Record<string, string>;
  /** 결제 탭에 아직 없는 환불 칸 이름 */
  missingRefund: string[];
  /** 시트에 칸을 만들 수 있는 사람인지 (대표) */
  canSetup: boolean;
  /** 결제 한 줄을 지울 수 있는가 — 회원 삭제 권한을 따른다 */
  canWipePay: boolean;
  problem: string;
};

type Part = { total: number; 신규: number; 재등록: number };
type Bucket = { 회원권: Part; PT: Part; 수업: Part; 기타: Part; 미분류: Part };

/**
 * 매출 다섯 갈래
 *
 * 회원권만 신규·재등록으로 쪼갠다. PT 는 한 덩어리다 — 대표님이 정하신
 * 것이다. PT 를 둘로 갈라 놓으니 도넛에 0원짜리 조각이 둘 붙어 자리만
 * 차지했고, 정작 「PT 가 얼마나 팔렸나」는 두 줄을 더해야 알 수 있었다.
 * 신규·재등록을 따로 보실 일이 생기면 그때 다시 가르면 된다.
 *
 * 마지막 「기타」는 총액에서 앞의 넷을 뺀 나머지다. 그래야 다섯을 더한
 * 값이 총매출과 어긋나지 않는다.
 */
function sixOf(b: Bucket, total: number) {
  const four = [
    { key: "회원권 · 신규", sum: b.회원권.신규 },
    { key: "회원권 · 재등록", sum: b.회원권.재등록 },
    { key: "PT", sum: b.PT.total },
    { key: "그룹수업", sum: b.수업.total },
  ];
  const rest = Math.max(0, total - four.reduce((s, x) => s + x.sum, 0));
  return [...four, { key: "기타", sum: rest }];
}

const money = (n: number) => n.toLocaleString("ko-KR");
const num = (v?: string) => Number((v ?? "").replace(/[^0-9-]/g, "")) || 0;
const isRefund = (x: Payment) => (x.환불여부 ?? "").toUpperCase() === "Y";

/*
 * 돈은 줄여 쓰지 않는다
 *
 * 「23만」처럼 만 단위로 줄여 놓았더니, 실제로 얼마인지 알 수가 없었다.
 * 232,000원과 234,500원이 화면에서 똑같이 「23만」으로 보인다. 매출은
 * 눈대중으로 보는 숫자가 아니라 맞춰 봐야 하는 숫자다.
 *
 * 세로 눈금(axisLabel)만 줄여 쓴다. 그건 눈금이지 금액이 아니다.
 */

/** 세로 눈금 — 4000만 대신 4천만처럼 읽히게 */
function axisLabel(n: number): string {
  if (n <= 0) return "0";
  if (n >= 100_000_000) return `${Number((n / 100_000_000).toFixed(1))}억`;
  if (n >= 10_000_000) return `${Number((n / 10_000_000).toFixed(1))}천만`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return money(n);
}

/** 큰 숫자를 사람이 말하듯 — 124,500,000 → 1억 2,450만 */
function koShort(n: number): string {
  if (n < 10_000) return money(n);
  const eok = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  if (eok > 0) return man > 0 ? `${eok}억 ${money(man)}만` : `${eok}억`;
  return `${money(man)}만`;
}

/**
 * 결제 한 건을 상품별로 나눈다
 *
 * ── 왜 그냥 비율로 안 나누나 ─────────────────────────────────
 * 예전에는 결제 금액 전체를 상품 값 비율로 나눴다. 그런데 이용권에 금액이
 * 적혀 있는 줄과 안 적힌 줄이 섞여 있으면, 적힌 값까지 같이 늘었다 줄었다
 * 했다. 사물함 15,000원이 14,780원으로 잡히고 그만큼이 회원권으로 옮겨가,
 * 「기타 매출이 왜 45,000원이 아니지」가 됐다.
 *
 * 적힌 값은 그대로 쓴다. 그것이 기록이다. 남은 돈만 안 적힌 줄에 정가
 * 비율로 나눈다. 적힌 합이 결제 금액보다 크면(결제 줄에만 할인을 적은
 * 경우) 그때는 어쩔 수 없이 전체를 비율로 줄인다.
 *
 * 어느 쪽이든 나눈 값의 합은 결제 금액과 정확히 같다 — 잔돈은 마지막
 * 줄에서 맞춘다. 나누다 남은 돈이 사라지면 매출이 안 맞는다.
 */
function shareOut(
  amt: number,
  ts: Ticket[],
  productOf: (code: string) => ProductMeta | undefined
): number[] | null {
  const 정가 = (t: Ticket) => {
    const pr = productOf(t.상품코드);
    return pr?.card || pr?.cash || 0;
  };
  /* 안 적힌 줄은 -1 로 표시한다. 0원짜리 서비스와 구분해야 한다 */
  const 적힘 = ts.map((t) => ((t.금액 ?? "").trim() !== "" ? num(t.금액) : -1));
  const 적힌합 = 적힘.filter((v) => v >= 0).reduce((a, b) => a + b, 0);
  const 빈칸 = 적힘.filter((v) => v < 0).length;

  if (적힌합 <= amt) {
    const out = 적힘.map((v) => (v >= 0 ? v : 0));
    let 남은 = amt - 적힌합;

    if (빈칸 > 0) {
      /* 정가를 모르는 줄도 몫이 있어야 한다 — 1 로 두면 똑같이 나눠 갖는다 */
      const w = ts.map((t, i) => (적힘[i] >= 0 ? 0 : 정가(t) || 1));
      const wsum = w.reduce((a, b) => a + b, 0);
      let 마지막 = -1;
      적힘.forEach((v, i) => { if (v < 0) 마지막 = i; });
      let 쓴 = 0;
      ts.forEach((_, i) => {
        if (적힘[i] >= 0) return;
        const 몫 = i === 마지막 ? 남은 - 쓴 : Math.round((남은 * w[i]) / wsum);
        쓴 += 몫;
        out[i] = 몫;
      });
    } else if (남은 !== 0) {
      /* 다 적혀 있는데 결제 금액과 다르다 — 차액은 마지막 줄에 붙인다.
         조용히 버리면 갈래 합이 총매출과 어긋난다 */
      out[out.length - 1] += 남은;
    }
    return out;
  }

  /* 적힌 합이 결제 금액보다 크다 — 결제 줄에만 할인을 적은 경우다 */
  const w = ts.map((t, i) => (적힘[i] >= 0 ? 적힘[i] : 정가(t)));
  const wsum = w.reduce((a, b) => a + b, 0);
  if (wsum <= 0) return null;
  const out: number[] = [];
  let 쓴 = 0;
  ts.forEach((_, i) => {
    const 몫 = i === ts.length - 1 ? amt - 쓴 : Math.round((amt * w[i]) / wsum);
    쓴 += 몫;
    out.push(몫);
  });
  return out;
}

const typeOf = (v: string) => {
  const t = (v ?? "").trim();
  if (t.startsWith("재등")) return "재등록";
  if (t.startsWith("신규")) return "신규";
  if (t) return "기타매출";
  return "미분류";
};

function shiftMonth(m: string, delta: number): string {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthsBack(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(from, -(count - 1 - i)));
}

export default function Client(p: Props) {
  const now = today();
  const thisMonth = now.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [branch, setBranch] = useState("전체");
  /* 지우기는 한 번 더 묻는다. 돈이 오간 기록이라 되돌리기가 번거롭다 */
  const [wipe, setWipe] = useState<Payment | null>(null);
  /** 결제 한 줄을 눌러 여는 상세 — 무엇을 얼마에 팔았는지 */
  const [detail, setDetail] = useState<Payment | null>(null);
  const [wiping, setWiping] = useState(false);
  const [wipeErr, setWipeErr] = useState("");

  async function doWipe() {
    if (!wipe || wiping) return;
    setWiping(true);
    setWipeErr("");
    try {
      const res = await fetch("/api/members/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "del", id: wipe.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "지우지 못했습니다.");
      location.reload();
    } catch (e: any) {
      setWipeErr(String(e.message ?? e));
      setWiping(false);
    }
  }

  const branchName = (c: string) => p.branches.find((b) => b.code === c)?.name ?? c;
  const productOf = (code: string) => p.products.find((x) => x.code === code);

  /** 한 달치를 한 번에 계산한다 — 이번 달·지난달·추이를 이 함수 하나로 만든다 */
  const monthStat = useMemo(() => {
    return (m: string, code?: string) => {
      const rows = p.payments.filter(
        (x) =>
          (x.결제일시 ?? "").startsWith(m) &&
          (code ? x.지점코드 === code : branch === "전체" || x.지점코드 === branch)
      );
      const live = rows.filter((x) => !isRefund(x));
      const sum = live.reduce((s, x) => s + num(x.결제금액), 0);
      const unpaid = live.reduce((s, x) => s + num(x.미수금액), 0);
      const refund = rows
        .filter(isRefund)
        .reduce((s, x) => s + (num(x.환불액) || num(x.결제금액)), 0);
      const goal = p.goals
        .filter(
          (g) =>
            g.연월 === m &&
            (code ? g.지점코드 === code : branch === "전체" || g.지점코드 === branch)
        )
        .reduce((s, g) => s + g.목표금액, 0);
      return { m, rows, live, sum, unpaid, refund, goal, count: live.length };
    };
  }, [p.payments, p.goals, branch]);

  const cur = monthStat(month);
  const prev = monthStat(shiftMonth(month, -1));
  /** 전년 같은 달 — 헬스장은 계절을 타므로 지난달보다 이쪽이 더 맞는 비교다 */
  const yoy = monthStat(shiftMonth(month, -12));
  const trend = useMemo(() => monthsBack(month, 12).map((m) => monthStat(m)), [month, monthStat]);

  /** 이번 달 지점별 값 */
  const branchNow = useMemo(
    () =>
      p.branches.map((b) => {
        const c = monthStat(month, b.code);
        const q = monthStat(shiftMonth(month, -1), b.code);
        return {
          ...b,
          sum: c.sum,
          count: c.count,
          goal: c.goal,
          rate: c.goal > 0 ? Math.round((c.sum / c.goal) * 100) : null,
          mom: q.sum > 0 ? Math.round(((c.sum - q.sum) / q.sum) * 100) : null,
          avg: c.count > 0 ? Math.round(c.sum / c.count) : 0,
          spark: monthsBack(month, 6).map((m) => monthStat(m, b.code).sum),
        };
      }),
    [p.branches, month, monthStat]
  );

  const delta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const rate = cur.goal > 0 ? Math.round((cur.sum / cur.goal) * 100) : null;

  /** 이번 달이면 지금까지 지난 날 기준으로 월말 매출을 어림한다 */
  const pace = useMemo(() => {
    if (month !== thisMonth) return null;
    const day = Number(now.slice(8, 10));
    if (day < 3 || cur.sum <= 0) return null;
    const [y, mm] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    return { day, last, left: last - day, expect: Math.round((cur.sum / day) * last) };
  }, [month, thisMonth, now, cur.sum]);

  /**
   * 결제수단
   *
   * 금액은 현금·카드·계좌 세 칸에 나뉘어 적힌다.
   * "묶음"은 한 건을 두 가지 이상으로 나눠 낸 건이다.
   * 그 건의 금액은 이미 위 세 칸에 들어가 있으므로 따로 더하면 겹친다.
   * 그래서 묶음은 건수와 그 건들의 합계만 따로 센다.
   */
  const methodOf = useMemo(
    () => (live: Payment[]) => {
      const cash = live.reduce((s, x) => s + num(x.현금액), 0);
      const card = live.reduce((s, x) => s + num(x.카드액), 0);
      const bank = live.reduce((s, x) => s + num(x.계좌액), 0);
      const mixed = live.filter(
        (x) => [num(x.현금액), num(x.카드액), num(x.계좌액)].filter((v) => v > 0).length >= 2
      );
      const named = cash + card + bank;
      return {
        rows: [
          { key: "현금", sum: cash },
          { key: "카드", sum: card },
          { key: "계좌", sum: bank },
        ],
        named,
        /** 세 칸 어디에도 안 적힌 금액 — 시트에 나눠 적지 않은 건 */
        unknown: Math.max(0, live.reduce((s, x) => s + num(x.결제금액), 0) - named),
        mixed: { count: mixed.length, sum: mixed.reduce((s, x) => s + num(x.결제금액), 0) },
      };
    },
    []
  );
  const method = methodOf(cur.live);

  /**
   * 결제 금액을 상품 갈래로 나눈다
   *
   * 이용권에 적힌 금액이 있으면 그대로 쓰고, 없으면 상품 정가로 나눈다.
   * 결제 한 건에 회원권과 사물함이 같이 들어 있어도 각각 얼마인지 알 수 있다.
   */
  /*
   * 이용권을 결제에 잇는다
   *
   * 이용권 줄이 결제번호를 들고 있으면 그대로 쓴다. 「결제번호」 칸이 없던
   * 동안 판 줄은 자국이 없어서, 같은 날 결제가 하나뿐일 때만 그 결제 것으로
   * 본다. 여러 건이면 어느 쪽인지 알 수 없어 손대지 않는다 —
   * 틀리게 붙이는 것보다 낫다.
   *
   * 갈래를 세는 셈과 결제 상세 창이 같은 것을 봐야 한다. 한쪽에만 두었다가
   * 화면마다 다른 답이 나오는 일을 이미 겪었다.
   */
  const byPay = useMemo(() => {
    const out: Record<string, Ticket[]> = {};
    /* 회원과 날짜로 함께 찾는다. 날짜만 보면 같은 날 다른 회원이 결제했을 때
       그 결제가 여러 건이라는 이유로 이어 붙이기를 포기하게 된다 —
       실제로 13만원이 그것 때문에 계속 기타로 남았다 */
    const byWho: Record<string, Payment[]> = {};
    p.payments.forEach((x) => {
      const d = (x.결제일시 ?? "").slice(0, 10);
      if (d) (byWho[`${x.회원번호 ?? ""}|${d}`] ??= []).push(x);
    });
    p.tickets.forEach((t) => {
      const pid = (t.결제번호 ?? "").trim();
      if (pid) return void ((out[pid] ??= []).push(t));
      const d = (t.등록일시 ?? t.시작일 ?? "").slice(0, 10);
      const same = byWho[`${t.회원번호 ?? ""}|${d}`] ?? [];
      if (same.length === 1) (out[same[0].id] ??= []).push(t);
    });
    return out;
  }, [p.payments, p.tickets]);

  const bucketOf = useMemo(() => {
    /*
     * 이 상품은 어느 갈래인가
     *
     * ── 왜 고쳤나 ──────────────────────────────────────────────
     * 상품분류에 「PT」라는 글자가 들어 있는지로만 봤다. 그런데 상품 관리의
     * 분류는 「회원권 · 수강권 · 그룹수강권 · 케어권 · 부가상품권 · 서비스」다.
     * 수강권으로 만든 PT 상품에는 「PT」라는 글자가 없어서 전부 「기타」로
     * 몰렸다 — 실제로 PT 매출 463,400원이 통째로 기타에 잡혔다.
     *
     * 수업 화면과 같은 규칙(fitsKind)을 쓴다. 두 화면이 다른 규칙으로
     * 갈래를 정하면 「수업에서는 PT 인데 매출에서는 기타」가 된다.
     * 그룹을 먼저 본다 — 「수강권」은 이름에 「그룹」이 들어 있으면 그룹이다.
     */
    const where = (pr?: ProductMeta) => {
      const k = (pr?.kind ?? "").replace(/\s/g, "");
      const n = pr?.name ?? "";
      if (k.includes("회원권")) return "회원권" as const;
      if (fitsKind(k, n, KIND_GROUP)) return "수업" as const;
      if (fitsKind(k, n, KIND_PT)) return "PT" as const;
      /* 케어권 · 부가상품권 · 서비스는 여기로 온다 */
      return "기타" as const;
    };

    /*
     * 신규인가 재등록인가
     *
     * 결제 줄의 「매출유형」이 신규·재등록이라고 적혀 있으면 그 말이 먼저다.
     * 「기타매출」처럼 적혀 있거나 비어 있으면 이 회원이 그 갈래를 전에도
     * 끊었는지 본다. 전에 끊은 적이 있으면 재등록, 없으면 신규다.
     * 적힌 말만 믿으면 회원권 13만원이 통째로 기타로 잡힌다 — 실제로 그랬다.
     */
    const 앞선것 = (t: Ticket) => {
      const k = where(productOf(t.상품코드));
      return p.tickets.some(
        (o) =>
          o.회원번호 === t.회원번호 &&
          o.id !== t.id &&
          where(productOf(o.상품코드)) === k &&
          (o.시작일 ?? "") < (t.시작일 ?? "")
      );
    };

    const zero = () => ({ total: 0, 신규: 0, 재등록: 0 });

    return (live: Payment[]) => {
      const out = {
        회원권: zero(), PT: zero(), 수업: zero(), 기타: zero(), 미분류: zero(),
      };
      const put = (k: keyof typeof out, amt: number, type: string) => {
        out[k].total += amt;
        if (type === "신규") out[k].신규 += amt;
        else if (type === "재등록") out[k].재등록 += amt;
      };

      live.forEach((pay) => {
        const amt = num(pay.결제금액);
        if (amt <= 0) return;
        const 적힌유형 = typeOf(pay.매출유형);
        const ts = byPay[pay.id] ?? [];
        if (ts.length === 0) {
          put("미분류", amt, 적힌유형);
          return;
        }
        const parts = shareOut(amt, ts, productOf);
        if (!parts) {
          put("미분류", amt, 적힌유형);
          return;
        }
        ts.forEach((t, i) => {
          const 몫 = parts[i];
          const 갈래 = where(productOf(t.상품코드));
          /*
           * 상품마다 유형을 따로 본다
           *
           * 회원권과 사물함을 한 번에 결제하면 결제 줄은 하나뿐이라 유형도
           * 하나다. 그 한 줄에 「신규」라고 적혀 있으면 사물함 15,000원까지
           * 신규 매출로 세어졌다 — 그건 회원권 얘기지 사물함 얘기가 아니다.
           *
           * 사물함 · 운동복 · 케어권 같은 것은 신규도 재등록도 아니다. 갈래가
           * 기타면 적힌 유형과 상관없이 기타매출로 본다. 그래서 대표님은
           * 「신규」 하나만 고르시면 되고, 회원권은 신규로 부가상품은 기타매출로
           * 알아서 갈린다.
           */
          const type =
            갈래 === "기타"
              ? "기타매출"
              : 적힌유형 === "신규" || 적힌유형 === "재등록"
                ? 적힌유형
                : (앞선것(t) ? "재등록" : "신규");
          put(갈래, 몫, type);
        });
      });
      return out;
    };
  }, [byPay, p.tickets, p.products]);

  const bucket = bucketOf(cur.live);

  /** 전 지점 다섯 갈래 */
  const six = sixOf(bucket, cur.sum);

  /** 지점별 다섯 갈래 · 결제수단 — 지점 비교 두 자리가 같이 쓴다 */
  const branchMix = useMemo(
    () =>
      p.branches.map((b) => {
        const rows = cur.live.filter((x) => x.지점코드 === b.code);
        const sum = rows.reduce((s, x) => s + num(x.결제금액), 0);
        return { ...b, sum, six: sixOf(bucketOf(rows), sum), method: methodOf(rows) };
      }),
    [p.branches, cur.live, bucketOf, methodOf]
  );

  /**
   * 상담 — 상담 화면과 같은 규칙으로 센다
   *
   * 약속을 잡은 건은 약속 날짜, 아직 없는 건은 문의가 들어온 날 기준이다.
   * 아직 결판이 안 난 건(예약·약속전환)은 진행중으로 따로 센다.
   */
  const leadRows = useMemo(
    () =>
      p.leads.filter(
        (c) => baseDate(c).startsWith(month) && (branch === "전체" || c.지점코드 === branch)
      ),
    [p.leads, month, branch]
  );

  const tally = (rows: Lead[]) => {
    const done = rows.filter((c) => stageNow(c, now) === "등록").length;
    const fail = rows.filter((c) => stageNow(c, now) === "미등록").length;
    const settled = done + fail;
    return {
      base: rows.length,
      done,
      fail,
      going: rows.length - settled,
      /** 결판난 건 중 등록 비율 — 아직 진행중인 건은 빼고 본다 */
      winRate: settled > 0 ? Math.round((done / settled) * 100) : null,
      failRate: settled > 0 ? Math.round((fail / settled) * 100) : null,
    };
  };

  const lead = tally(leadRows);

  /** 지점별 문의 → 등록 전환율 */
  const convByBranch = useMemo(
    () =>
      p.branches
        .map((b) => ({ ...b, ...tally(p.leads.filter(
          (c) => baseDate(c).startsWith(month) && c.지점코드 === b.code
        )) }))
        .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1)),
    [p.branches, p.leads, month, now]
  );

  /**
   * 이 달의 상담왕 — 지점 통합
   *
   * 상담을 몇 건 맡아 몇 건을 등록시켰고, 그래서 얼마를 만들었는지.
   *
   * 세는 기준이 둘이다 — 대표님이 정하신 대로다.
   *   상담 · 실패 : 상담 탭의 상담자
   *   등록 · 매출 : 결제 탭의 담당직원
   *
   * 상담은 한 사람이 하고 결제는 데스크에서 받는 일이 흔해서, 상담 탭의
   * 「등록」으로 세면 실제로 판 사람의 실적이 남에게 간다.
   *
   * 성공률은 상담 몇 건을 맡아 몇 건을 팔았는가다. 상담 기록 없이 판 건은
   * 100%로 본다 — 상담 탭에 안 남았을 뿐 판 것은 판 것이다.
   */
  const champions = useMemo(() => {
    const map: Record<string, { rows: Lead[]; sum: number; count: number }> = {};
    const put = (id: string) => (map[id] ??= { rows: [], sum: 0, count: 0 });
    leadRows.forEach((c) => {
      if (!c.상담자사번) return;
      put(c.상담자사번).rows.push(c);
    });
    cur.live.forEach((x) => {
      if (!x.담당직원사번) return;
      const v = put(x.담당직원사번);
      v.sum += num(x.결제금액);
      v.count += 1;
    });
    return Object.entries(map)
      .map(([id, v]) => {
        const t = tally(v.rows);
        return {
          id,
          name: p.staffNames[id] ?? id,
          sum: v.sum,
          count: v.count,
          ...t,
          /*
            맡은 상담 대비 실제로 판 건수

            상담 기록이 없는데 판 건이 있으면 100%로 본다 — 상담 탭에
            안 남았을 뿐 판 것은 판 것이다. 「-」로 두면 그 사람만 성적이
            없는 것처럼 보인다.
            둘 다 없을 때만 잴 것이 없다.

            100 을 넘기지 않는다. 상담 없이 판 건을 100%로 세기로 한 이상,
            상담 하나에 두 건을 팔았다고 200%가 되면 규칙이 어긋난다.
          */
          sellRate:
            t.base > 0
              ? Math.min(100, Math.round((v.count / t.base) * 100))
              : v.count > 0 ? 100 : null,
        };
      })
      .filter((s) => s.base > 0 || s.sum > 0)
      .sort((a, b) => b.sum - a.sum);
  }, [leadRows, cur.live, p.staffNames, now]);

  /** 미수금 명단 — 누가, 언제, 얼마 */
  const unpaidList = useMemo(
    () =>
      cur.live
        .filter((x) => num(x.미수금액) > 0)
        .map((x) => ({
          id: x.id,
          name: p.memberNames[x.회원번호] || x.회원번호 || "-",
          branch: branchName(x.지점코드),
          date: (x.결제일시 ?? "").slice(0, 10),
          due: (x.미수금결제예정일 ?? "").slice(0, 10),
          amount: num(x.미수금액),
          total: num(x.결제금액),
          staff: p.staffNames[x.담당직원사번] ?? "-",
        }))
        .sort((a, b) => b.amount - a.amount),
    [cur.live, p.memberNames, p.staffNames]
  );

  /** 환불 목록 — 진행상태·사유 칸은 아직 시트에 없다 */
  const refundList = useMemo(
    () =>
      cur.rows
        .filter(isRefund)
        .map((x) => ({
          id: x.id,
          name: p.memberNames[x.회원번호] || x.회원번호 || "-",
          branch: branchName(x.지점코드),
          date: (x.결제일시 ?? "").slice(0, 10),
          amount: num(x.환불액) || num(x.결제금액),
          stage: (x.환불진행상태 ?? "").trim(),
          reason: (x.환불사유 ?? "").trim(),
          asked: (x.환불신청일 ?? "").slice(0, 10),
          done: (x.환불완료일 ?? "").slice(0, 10),
          staff: p.staffNames[x.담당직원사번] ?? "-",
        }))
        .sort((a, b) => b.amount - a.amount),
    [cur.rows, p.memberNames, p.staffNames]
  );

  const byStaff = useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {};
    cur.live.forEach((x) => {
      const id = x.담당직원사번 || "-";
      const v = (map[id] ??= { sum: 0, count: 0 });
      v.sum += num(x.결제금액);
      v.count += 1;
    });
    return Object.entries(map)
      .map(([id, v]) => ({ id, name: p.staffNames[id] ?? id, ...v }))
      .sort((a, b) => b.sum - a.sum);
  }, [cur.live, p.staffNames]);

  /*
   * 날짜별 — 얼마를 무엇으로 받았나
   *
   * 막대만 있으면 모양은 보여도 얼마인지 알 수 없고, 합계만 있으면 그 날
   * 회원권이 팔린 건지 사물함이 팔린 건지 알 수 없다. 도넛과 같은 갈래로
   * 날마다 나눠 적는다 — 같은 셈(bucketOf)을 그대로 쓰므로 위아래 숫자가
   * 어긋날 일이 없다.
   */
  /*
   * 등록한 분들의 갈래
   *
   * 고른 지점 · 고른 달에 등록한 분만 센다. 화면 전체가 그 달 이야기인데
   * 여기만 전체 회원이면 위아래가 다른 말을 하게 된다.
   * 「전체 회원」으로 넘기면 지금까지 다니시는 분 전부를 본다.
   */
  const [who, setWho] = useState<"month" | "all">("month");
  const dist = useMemo(() => {
    const 사람 = p.people
      .filter((m) => branch === "전체" || m.지점코드 === branch)
      .filter((m) => who === "all" || (m.가입일 ?? "").startsWith(month));

    const 세기 = (k: keyof Person, 정해둔?: string[]) => {
      const map = new Map<string, number>();
      /* 정해 둔 값을 0 으로 먼저 세워 둔다. 이 달에 아무도 안 고른 갈래도
         자리를 지켜야 지난달과 견줄 수 있다 */
      (정해둔 ?? []).forEach((v) => {
        const t = (v ?? "").trim();
        if (t) map.set(t, 0);
      });
      사람.forEach((m) => {
        const v = (m[k] as string) || "모름";
        map.set(v, (map.get(v) ?? 0) + 1);
      });

      return [...map.entries()]
        .map(([key, n]) => ({ key, n }))
        /* 「모름」은 늘 맨 아래. 개수가 많다고 맨 위에 오면 그 갈래가
           제일 큰 무리인 것처럼 읽힌다 */
        /* ㄱㄴㄷ 순. 많은 것부터 세우면 달마다 줄 차례가 바뀌어, 지난달과
           견주려고 눈이 매번 이름을 다시 찾아야 한다.
           「모름」만 맨 아래다 — 값이 아니라 빈 자리라서 갈래 사이에 끼면
           그것도 한 갈래처럼 읽힌다 */
        .sort((a, b) =>
          (a.key === "모름" ? 1 : 0) - (b.key === "모름" ? 1 : 0) ||
          a.key.localeCompare(b.key, "ko")
        );
    };

    const 경로목록 = p.options["문의채널"] ?? p.options["방문경로"];

    return {
      total: 사람.length,
      성별: 세기("성별", p.options["성별"]),
      나이대: 세기("나이대", p.options["나이대"]),
      거주동네: 세기("거주동네", p.options["거주동네"]),
      직업: 세기("직업", p.options["직업"]),
      방문경로: 세기("방문경로", 경로목록),
    };
  }, [p.people, p.options, branch, month, who]);

  const byDay = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const map: Record<string, Payment[]> = {};
    cur.live.forEach((x) => {
      const d = (x.결제일시 ?? "").slice(0, 10);
      if (d) (map[d] ??= []).push(x);
    });
    const list = Array.from({ length: last }, (_, i) => {
      const key = `${month}-${String(i + 1).padStart(2, "0")}`;
      const rows = map[key] ?? [];
      const sum = rows.reduce((a, x) => a + num(x.결제금액), 0);
      return { day: i + 1, key, sum, count: rows.length, six: sixOf(bucketOf(rows), sum) };
    });
    return { list, top: Math.max(1, ...list.map((d) => d.sum)) };
  }, [cur.live, month, bucketOf]);

  if (p.problem) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">매출</h1>
            <p className="page-sub">시트를 읽지 못했습니다</p>
          </div>
        </div>
        <div className="alert-bad" style={{ lineHeight: 1.7 }}>{p.problem}</div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">매출</h1>
          <p className="page-sub">
            결제 기준 · 환불 건 제외
            {branch !== "전체" && ` · ${branchName(branch)}`}
          </p>
        </div>
        <div className="filter-right">
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))}
                  aria-label="지난달">‹</button>
          <select className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
            {monthsBack(thisMonth, 24).slice().reverse().map((m) => (
              <option key={m} value={m}>
                {m.slice(0, 4)}년 {Number(m.slice(5, 7))}월
              </option>
            ))}
          </select>
          <button className="icon-btn" disabled={month >= thisMonth}
                  onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음달">›</button>
        </div>
      </div>

      {p.branches.length > 1 && (
        <div className="bchips">
          <button className={`bchip${branch === "전체" ? " on" : ""}`} onClick={() => setBranch("전체")}>
            <span className="nm">전 지점</span>
            <span className="am num">{money(cur.sum)}</span>
          </button>
          {branchNow.map((b) => (
            <button key={b.code} className={`bchip${branch === b.code ? " on" : ""}`}
                    onClick={() => setBranch(b.code)}>
              <span className="nm">{b.name}</span>
              <span className="am num">{b.sum > 0 ? money(b.sum) : "-"}</span>
            </button>
          ))}
        </div>
      )}

      {/* 이번 달 — 숫자 하나가 주인공이라 그래프를 쓰지 않는다 */}
      <div className="hero">
        <div className="hero-main">
          <span className="lb">
            {Number(month.slice(5, 7))}월 매출 · {branch === "전체" ? "전 지점" : branchName(branch)}
          </span>
          <b className="big num">
            {koShort(cur.sum)}<em>원</em>
          </b>
          <span className="exact num">{money(cur.sum)}원 · 결제 {cur.count}건</span>
        </div>

        <div className="hero-delta">
          <div><span>지난달</span><Delta v={delta(cur.sum, prev.sum)} /></div>
          <div><span>작년 {Number(month.slice(5, 7))}월</span><Delta v={delta(cur.sum, yoy.sum)} /></div>
        </div>

        <div className="hero-goal">
          {cur.goal > 0 ? (
            <>
              <div className="r">
                <span>목표 {koShort(cur.goal)}원</span>
                <b className="num">{rate}%</b>
              </div>
              <div className="mtrack">
                <i style={{ width: `${Math.min(100, (cur.sum / cur.goal) * 100)}%` }} />
              </div>
              <p className="sub">
                {cur.sum >= cur.goal
                  ? `목표를 ${koShort(cur.sum - cur.goal)}원 넘겼습니다`
                  : `${koShort(cur.goal - cur.sum)}원 더 필요합니다`}
                {pace && (
                  <>
                    {` · 남은 ${pace.left}일 · 이 속도면 `}
                    <b>{koShort(pace.expect)}원</b>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="sub">월매출목표가 입력되지 않았습니다.</p>
          )}
        </div>
      </div>

      {/* 매출 바로 밑에 오는 네 칸 — 돈이 새는 곳과 상담 성적 */}
      <div className="tiles four">
        <div className="tile">
          <span className="lb">미수금</span>
          <b className={`vl num${cur.unpaid > 0 ? " bad" : ""}`}>{money(cur.unpaid)}원</b>
          <span className="sub">
            {cur.unpaid > 0
              ? `${unpaidList.length}건 · 실입금 ${money(cur.sum - cur.unpaid)}원`
              : "전액 입금"}
          </span>
          <div className="mini">
            <i className={cur.unpaid > 0 ? "bad" : ""}
               style={{ width: `${cur.sum > 0 ? Math.min(100, (cur.unpaid / cur.sum) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="tile">
          <span className="lb">환불</span>
          <b className="vl num">{money(cur.refund)}원</b>
          <span className="sub">
            {cur.rows.filter(isRefund).length}건
            {cur.sum > 0 && ` · 매출의 ${((cur.refund / cur.sum) * 100).toFixed(1)}%`}
          </span>
          <div className="mini">
            <i style={{ width: `${cur.sum > 0 ? Math.min(100, (cur.refund / cur.sum) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="tile">
          <span className="lb">등록성공률</span>
          <b className="vl num">{lead.winRate === null ? "-" : `${lead.winRate}%`}</b>
          <span className="sub">
            {lead.base > 0 ? `상담 ${lead.base}건 중 ${lead.done}건 등록` : "이 달 상담 없음"}
          </span>
          <div className="mini">
            <i className="good" style={{ width: `${lead.winRate ?? 0}%` }} />
          </div>
        </div>
        <div className="tile">
          <span className="lb">등록실패율</span>
          <b className="vl num">{lead.failRate === null ? "-" : `${lead.failRate}%`}</b>
          <span className="sub">
            {lead.base > 0 ? `상담 ${lead.base}건 중 ${lead.fail}건 미등록` : "이 달 상담 없음"}
          </span>
          <div className="mini">
            <i className={lead.failRate !== null && lead.failRate >= 50 ? "bad" : "warn"}
               style={{ width: `${lead.failRate ?? 0}%` }} />
          </div>
        </div>
      </div>

      {/*
        어떤 분들이 등록하셨나

        매출은 「얼마」만 말한다. 「누가」를 같이 봐야 다음 달에 어디에 힘을
        쓸지 정할 수 있다 — 20대 여성이 몰리는데 광고는 40대 남성에게 나가고
        있으면 숫자만 보고는 모른다.
      */}
      <div className="sec-head">
        <div>
          <h2 className="sec-title">등록한 분들</h2>
          <p className="sec-sub">
            {who === "month"
              ? `${Number(month.slice(5, 7))}월에 등록한 ${dist.total}명`
              : `지금 다니시는 ${dist.total}명 전부`}
            {" · 안 적힌 것은 「모름」으로 셉니다"}
          </p>
        </div>
        <div className="chips">
          <button className={`chip${who === "month" ? " on" : ""}`} onClick={() => setWho("month")}>
            이 달 등록
          </button>
          <button className={`chip${who === "all" ? " on" : ""}`} onClick={() => setWho("all")}>
            전체 회원
          </button>
        </div>
      </div>
      {dist.total === 0 ? (
        <div className="viz">
          <p className="dim mini-note">
            {who === "month" ? "이 달에 등록한 회원이 없습니다." : "회원이 없습니다."}
          </p>
        </div>
      ) : (
        <div className="viz-2 viz-dist">
          <Dist title="성별" rows={dist.성별} total={dist.total} />
          <Dist title="나이대" rows={dist.나이대} total={dist.total} />
          <Dist title="거주 동네" rows={dist.거주동네} total={dist.total} />
          <Dist title="직업" rows={dist.직업} total={dist.total} />
          <Dist title="방문 경로" rows={dist.방문경로} total={dist.total} />
        </div>
      )}

      {/* 월별 흐름 — 시간에 따른 변화라 꺾은선 */}
      <h2 className="sec-title">월별 흐름</h2>
      <p className="sec-sub">최근 12개월 · 점선은 그달의 목표 · 눌러서 그달로 넘어갑니다</p>
      <div className="viz">
        <LineChart rows={trend} current={month} onPick={setMonth} />
        <div className="vkey">
          <span><i className="ln s1" />월 매출</span>
          <span><i className="ln dash" />월 목표</span>
        </div>
      </div>

      <div className="viz-2">
        {/* 매출 구성 — 전체를 나눠 갖는 비중이라 도넛 */}
        <div className="viz">
          <h3 className="viz-title">무엇을 팔았나</h3>
          <p className="viz-sub">회원권만 신규 · 재등록으로 가른 다섯 갈래</p>
          {cur.sum <= 0 ? (
            <p className="dim mini-note">이 달에 잡힌 매출이 없습니다.</p>
          ) : (
            <div className="dwrap">
              <Donut rows={six} center={`${money(cur.sum)}원`}
                     label="상품 갈래별 매출 비중 도넛 그래프" />
              <ul className="dlist">
                {six.map((k, i) => (
                  <li key={k.key} className={k.sum > 0 ? "" : "off"}>
                    <i className={`sw s${i + 1}`} />
                    <span className="nm">{k.key}</span>
                    <span className="vl num">{money(k.sum)}</span>
                    <span className="pc num">{Math.round((k.sum / cur.sum) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/*
            소계 한 줄을 뺐다

            오른쪽 목록이 이미 갈래마다 금액을 적고 있어서, 아래 줄은 그것을
            더한 값을 한 번 더 말하는 것뿐이었다. 같은 값을 두 군데서 말하면
            읽는 사람이 「이 둘이 왜 다르지」를 확인하느라 시간을 쓴다.
          */}
        </div>

        {/* 결제수단 — 어떻게 받았는지 */}
        <div className="viz">
          <h3 className="viz-title">어떻게 받았나</h3>
          <p className="viz-sub">현금 · 계좌 · 카드로 나눠 적힌 금액</p>
          {method.named <= 0 ? (
            <p className="dim mini-note">
              현금 · 카드 · 계좌를 나눠 적은 결제가 없습니다.
            </p>
          ) : (
            <div className="dwrap">
              <Donut rows={method.rows} center={`${money(method.named)}원`}
                     label="결제수단별 금액 비중 도넛 그래프" />
              <ul className="dlist">
                {method.rows.map((r, i) => (
                  <li key={r.key} className={r.sum > 0 ? "" : "off"}>
                    <i className={`sw s${i + 1}`} />
                    <span className="nm">{r.key}</span>
                    <span className="vl num">{money(r.sum)}</span>
                    <span className="pc num">
                      {Math.round((r.sum / method.named) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="subtot">
            <span>
              묶음 결제 <b className="num">{method.mixed.count}건</b>
              {method.mixed.count > 0 && ` · ${money(method.mixed.sum)}원`}
            </span>
            {method.unknown > 0 && (
              <span className="warn-text">수단 미기재 <b className="num">{money(method.unknown)}</b></span>
            )}
          </div>
        </div>
      </div>

      {/*
        일별 · 직원별 · 결제 내역

        접어 두었던 자리다. 눌러야 보이니 아무도 안 눌렀고, 정작 「1만원은
        뭐냐」를 확인하는 자리가 여기였다. 펼쳐 둔다 — 접는 데 드는 품보다
        못 보고 지나치는 값이 크다.
      */}
      <h2 className="sec-title">자세히 보기</h2>

      <h3 className="viz-title mt">일별</h3>
      <div className="viz">
        {cur.count === 0 ? (
          <p className="dim mini-note">이 달에 등록된 결제가 없습니다.</p>
        ) : (
          <>
            <WeekLines list={byDay.list} month={month} />

          </>
        )}
      </div>

      {byStaff.length > 0 && (
        <>
          <h3 className="viz-title mt">결제 담당별 매출</h3>
          {/*
            상담 담당과 다른 값이다

            상담을 정예진이 받았어도 실제로 판 사람은 다를 수 있다. 여기 세는
            것은 상품을 팔 때 고른 「결제 담당」이지 상담 담당이 아니다.
            이름만 「담당」이라고 적어 두면 그 둘을 같은 것으로 읽는다.
          */}
          <p className="viz-sub">
            상품을 팔 때 고른 <b>결제 담당</b> 기준입니다. 상담을 받은 사람과 다를 수 있습니다.
          </p>
          <div className="table-wrap t2wrap">
            <table className="grid t2">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>순위</th>
                  <th>직원</th>
                  <th className="r">매출</th>
                  <th>비중</th>
                  <th className="r">건수</th>
                  <th className="r">건당 평균</th>
                </tr>
              </thead>
              <tbody>
                {byStaff.map((s, i) => (
                  <tr key={s.id}>
                    <td><i className={`rk${i === 0 ? " one" : ""}`}>{i + 1}</i></td>
                    <td><span className="nm">{s.name}</span></td>
                    <td className="r big num">{money(s.sum)}</td>
                    <td>
                      <span className="wbar">
                        <span>
                          <i style={{ width: `${cur.sum > 0 ? (s.sum / cur.sum) * 100 : 0}%` }} />
                        </span>
                        <b className="num">
                          {cur.sum > 0 ? `${Math.round((s.sum / cur.sum) * 100)}%` : "-"}
                        </b>
                      </span>
                    </td>
                    <td className="r dim num">{s.count}</td>
                    <td className="r dim num">{money(Math.round(s.sum / s.count))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="viz-title mt">결제 내역 {cur.rows.length}건</h3>
      {cur.rows.length === 0 ? (
        <div className="empty">
          <Icon name="card" size={26} />
          <b>이 달에 등록된 결제가 없습니다</b>
          <p>회원 등록이나 상품 추가로 결제가 쌓이면 여기에 나옵니다.</p>
        </div>
      ) : (
        <div className="table-wrap t2wrap">
          <table className="grid t2">
            <thead>
              <tr>
                <th>결제일</th>
                <th>회원</th>
                <th>지점</th>
                <th>유형</th>
                <th>수단</th>
                <th>결제 담당</th>
                {/* 「이 결제 누가 넣었지」는 시트를 열지 않고도 답할 수 있어야 한다 */}
                <th>등록자</th>
                <th className="r">금액</th>
                <th className="r">미수금</th>
                {p.canWipePay && <th />}
              </tr>
            </thead>
            <tbody>
              {cur.rows
                .slice()
                .sort((a, b) => (b.결제일시 ?? "").localeCompare(a.결제일시 ?? ""))
                .map((x) => (
                  /* 줄을 누르면 「이 36만원이 무엇이었나」가 열린다.
                     지우기 단추는 눌러도 상세가 안 열리게 따로 막는다 */
                  <tr key={x.id} onClick={() => setDetail(x)}>
                    <td className="num dim">{(x.결제일시 ?? "").slice(5, 10)}</td>
                    <td>{p.memberNames[x.회원번호] ?? x.회원번호 ?? "-"}</td>
                    <td className="dim">{branchName(x.지점코드)}</td>
                    <td>
                      <span className={`pill${isRefund(x) ? " bad" : ""}`}>
                        {isRefund(x) ? "환불" : typeOf(x.매출유형)}
                      </span>
                    </td>
                    <td className="dim">{x.결제수단 || "-"}</td>
                    <td className="dim">{p.staffNames[x.담당직원사번] ?? "-"}</td>
                    <td className="dim" title={x.등록일시 ?? ""}>
                      {p.staffNames[x.등록자] ?? x.등록자 ?? "-"}
                    </td>
                    <td className="r big num">{money(num(x.결제금액))}</td>
                    <td className={`num r ${num(x.미수금액) > 0 ? "bad" : "dim"}`}>
                      {num(x.미수금액) > 0 ? money(num(x.미수금액)) : "-"}
                    </td>
                    {p.canWipePay && (
                      <td className="r">
                        <button type="button" className="linkish"
                                onClick={(e) => { e.stopPropagation(); setWipe(x); }}>
                          지우기
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 지점별 — 규모와 목표 달성 여부를 한 줄에서 같이 본다 */}
      {p.branches.length > 1 && branch === "전체" && (
        <>
          <h2 className="sec-title">지점별</h2>
          <p className="sec-sub">
            막대는 이번 달 매출, 세로선은 그 지점의 목표 · 맨 오른쪽 작은 선은 최근 6개월 흐름
          </p>
          <div className="viz">
            {branchNow
              .slice()
              .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.sum - a.sum)
              .map((b) => {
                const top = Math.max(
                  1,
                  ...branchNow.map((x) => Math.max(x.sum, x.goal))
                ) * 1.05;
                return (
                  <button key={b.code} type="button" className="brow"
                          onClick={() => setBranch(b.code)}>
                    <span className="nm">{b.name}</span>
                    {b.sum > 0 || b.goal > 0 ? (
                      <span className="bt">
                        <i style={{ width: `${(b.sum / top) * 100}%` }} />
                        {b.goal > 0 && <u style={{ left: `${(b.goal / top) * 100}%` }} />}
                      </span>
                    ) : (
                      <span className="norow">이 달 매출 없음</span>
                    )}
                    <span className="am num">
                      {b.sum > 0 ? money(b.sum) : "-"}
                      <small>{b.goal > 0 ? `목표 ${money(b.goal)}` : "목표 없음"}</small>
                    </span>
                    <span className="pc num">
                      {b.rate === null ? "-" : `${b.rate}%`}
                      {b.rate !== null && b.rate < 70 && <em className="miss">▼ 미달</em>}
                    </span>
                    <MiniLine rows={b.spark} />
                  </button>
                );
              })}
          </div>
        </>
      )}

      {/* 지점 비교 — 같은 100% 띠를 나란히 놓아야 눈으로 비교된다 */}
      {p.branches.length > 1 && branch === "전체" && (
        <div className="viz-2">
          <div className="viz">
            <h3 className="viz-title">지점별 무엇을 팔았나</h3>
            <p className="viz-sub">지점마다 매출을 100%로 놓고 갈래별 비중</p>
            {branchMix.every((b) => b.sum <= 0) ? (
              <p className="dim mini-note">이 달에 잡힌 매출이 없습니다.</p>
            ) : (
              <>
                <div className="cmp-rows">
                  {branchMix.map((b) => (
                    <div className="cmp-row" key={b.code}>
                      <span className="nm">{b.name}</span>
                      <Ratio rows={b.six} />
                      <span className="tot num">{b.sum > 0 ? money(b.sum) : "-"}</span>
                    </div>
                  ))}
                </div>
                <div className="vkey">
                  {six.map((k, i) => (
                    <span key={k.key}><i className={`sw s${i + 1}`} />{k.key}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="viz">
            <h3 className="viz-title">지점별 어떻게 받았나</h3>
            {branchMix.every((b) => b.method.named <= 0) ? (
              <p className="dim mini-note">나눠 적은 결제가 없습니다.</p>
            ) : (
              <>
                <div className="cmp-rows">
                  {branchMix.map((b) => (
                    <div className="cmp-row" key={b.code}>
                      <span className="nm">{b.name}</span>
                      <Ratio rows={b.method.rows} />
                      <span className="tot num">
                        {b.method.mixed.count > 0 ? `묶음 ${b.method.mixed.count}건` : "-"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="vkey">
                  {method.rows.map((r, i) => (
                    <span key={r.key}><i className={`sw s${i + 1}`} />{r.key}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 문의 → 등록 전환율 */}
      <h2 className="sec-title">문의 → 등록 전환율</h2>
      <p className="sec-sub">
        결판이 난 상담만 셉니다 · 아직 진행중인 건은 전환율에서 뺍니다
      </p>
      <div className="viz">
        {(branch === "전체" ? convByBranch : convByBranch.filter((b) => b.code === branch))
          .map((b) => (
            <div className="conv" key={b.code}
                 title={`문의 ${b.base}건 · 등록 ${b.done} · 미등록 ${b.fail} · 진행중 ${b.going}`}>
              <span className="nm">{b.name}</span>
              {b.winRate === null ? (
                <span className="norow">
                  {b.base > 0 ? `상담 ${b.base}건 모두 진행중` : "이 달 상담 없음"}
                </span>
              ) : (
                <span className="tr"><i style={{ width: `${b.winRate}%` }} /></span>
              )}
              <span className="pc num">{b.winRate === null ? "-" : `${b.winRate}%`}</span>
            </div>
          ))}
        {branch === "전체" && (
          <div className="conv all" title={`문의 ${lead.base}건 · 등록 ${lead.done} · 미등록 ${lead.fail}`}>
            <span className="nm">전 지점</span>
            {lead.winRate === null ? (
              <span className="norow">결판난 상담이 아직 없습니다</span>
            ) : (
              <span className="tr"><i style={{ width: `${lead.winRate}%` }} /></span>
            )}
            <span className="pc num">{lead.winRate === null ? "-" : `${lead.winRate}%`}</span>
          </div>
        )}
      </div>

      {/* 이 달의 상담왕 */}
      <h2 className="sec-title">이 달의 상담왕</h2>
      <p className="sec-sub">
        상담 · 실패는 <b>상담 탭의 상담자</b>, 등록 · 매출은{" "}
        <b>결제 탭의 담당직원</b> 기준입니다
      </p>
      {champions.length === 0 ? (
        <div className="viz"><p className="dim mini-note">이 달에 쌓인 상담·결제가 없습니다.</p></div>
      ) : (
        <div className="table-wrap t2wrap">
          <table className="grid t2">
            <thead>
              <tr>
                <th style={{ width: 40 }}>순위</th>
                <th>직원</th>
                <th className="r">상담</th>
                <th className="r">등록</th>
                <th className="r">실패</th>
                <th>성공률</th>
                <th className="r">등록 매출</th>
                <th className="r">건당</th>
              </tr>
            </thead>
            <tbody>
              {champions.map((s, i) => (
                <tr key={s.id}>
                  <td><i className={`rk${i === 0 ? " one" : ""}`}>{i + 1}</i></td>
                  <td><span className="nm">{s.name}</span></td>
                  <td className="r dim num">{s.base > 0 ? s.base : "-"}</td>
                  {/* 등록은 결제 담당 기준이다 — 실제로 판 사람의 건수 */}
                  <td className="r big num">{s.count > 0 ? s.count : "-"}</td>
                  <td className="r bad num">{s.fail > 0 ? s.fail : "-"}</td>
                  <td>
                    {s.sellRate === null ? (
                      <span className="dim">-</span>
                    ) : (
                      <span className="wbar">
                        <span><i style={{ width: `${s.sellRate}%` }} /></span>
                        <b className="num">{s.sellRate}%</b>
                      </span>
                    )}
                  </td>
                  <td className="r big num">{money(s.sum)}</td>
                  <td className="r dim num">
                    {s.count > 0 ? money(Math.round(s.sum / s.count)) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 미수금 — 누가, 언제, 얼마 */}
      {unpaidList.length > 0 && (
        <>
          <h2 className="sec-title">미수금 {unpaidList.length}건</h2>
          <p className="sec-sub">받기로 한 날이 지난 건은 붉게 표시됩니다</p>
          <div className="lwrap">
            {unpaidList.map((u) => (
              <div className="lrow" key={u.id}>
                <div className="who">
                  <b>{u.name}</b>
                  <span>
                    {u.branch} · {u.date.slice(5)} 결제 {money(u.total)}원 · 담당 {u.staff}
                  </span>
                </div>
                <div className="mid">
                  {u.due ? (
                    <span className={`pill${u.due < now ? " bad" : ""}`}>
                      {u.due.slice(5)} {u.due < now ? "지남" : "받기로"}
                    </span>
                  ) : (
                    <span className="pill">날짜 미정</span>
                  )}
                </div>
                <div className="amt">
                  <b className="bad num">{money(u.amount)}원</b>
                  <span>못 받은 돈</span>
                </div>
              </div>
            ))}
            <div className="lfoot">
              <span>합계 {unpaidList.length}건</span>
              <b className="num">{money(cur.unpaid)}원</b>
            </div>
          </div>
        </>
      )}

      {/*
        환불

        환불이 0건이어도 자리를 없애지 않는다.
        칸을 만들었는데 화면에서 통째로 사라지면, 잘된 건지 안 된 건지 알 수 없다.
      */}
      <>
          <h2 className="sec-title">환불 {refundList.length}건</h2>
          <p className="sec-sub">신청일부터 완료일까지 어디까지 왔는지</p>

          {p.missingRefund.length > 0 ? (
            <SetupRefund missing={p.missingRefund} can={p.canSetup} />
          ) : (
            refundList.length === 0 && (
              <div className="viz">
                <p className="dim mini-note">
                  이 달 환불이 없습니다 · 기록할 칸(진행상태 · 사유 · 신청일 · 완료일)은
                  준비돼 있습니다.
                </p>
              </div>
            )
          )}

          {refundList.length > 0 && (
            <div className="lwrap">
              {refundList.map((r) => (
                <div className="lrow" key={r.id}>
                  <div className="who">
                    <b>{r.name}</b>
                    <span>
                      {r.branch} · {r.date.slice(5)} 결제 · 담당 {r.staff}
                      {r.reason && ` · ${r.reason}`}
                      {r.asked && ` · ${r.asked.slice(5)} 신청`}
                      {r.done && ` → ${r.done.slice(5)} 완료`}
                    </span>
                  </div>
                  <div className="mid">
                    {r.stage ? (
                      <span className={`pill${r.stage === "반려" ? " bad" : r.stage === "환불완료" ? " good" : ""}`}>
                        {r.stage}
                      </span>
                    ) : (
                      <span className="pill">상태 미입력</span>
                    )}
                  </div>
                  <div className="amt">
                    <b className="bad num">{money(r.amount)}원</b>
                    <span>환불액</span>
                  </div>
                </div>
              ))}
              <div className="lfoot">
                <span>합계 {refundList.length}건</span>
                <b className="num">{money(cur.refund)}원</b>
              </div>
            </div>
          )}
      </>


      {detail && (
        <PayDetail
          x={detail}
          items={byPay[detail.id] ?? []}
          productOf={productOf}
          memberName={p.memberNames[detail.회원번호] ?? detail.회원번호 ?? "-"}
          branch={branchName(detail.지점코드)}
          staffNames={p.staffNames}
          onClose={() => setDetail(null)}
        />
      )}

      {wipe && (
        <div className="modal-back" onClick={() => !wiping && setWipe(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>이 결제를 지웁니다</h3>
            <div className="kv">
              <div className="kv-row"><span>결제일</span><b>{(wipe.결제일시 ?? "").slice(0, 10)}</b></div>
              <div className="kv-row">
                <span>회원</span>
                <b>{p.memberNames[wipe.회원번호] ?? `${wipe.회원번호} (지워진 회원)`}</b>
              </div>
              <div className="kv-row"><span>금액</span><b className="num">{money(num(wipe.결제금액))}</b></div>
              <div className="kv-row">
                <span>등록자</span>
                <b>{p.staffNames[wipe.등록자] ?? wipe.등록자 ?? "-"}
                  {wipe.등록일시 ? ` · ${wipe.등록일시.slice(0, 16)}` : ""}</b>
              </div>
            </div>
            <p className="stat-note">
              매출에서 빠집니다. 줄은 시트에 남고 지운 표시만 붙으므로, 나중에 되짚어 볼 수 있습니다.
            </p>
            {wipeErr && <div className="alert-bad">{wipeErr}</div>}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setWipe(null)} disabled={wiping}>그만두기</button>
              <button className="btn-danger" onClick={doWipe} disabled={wiping}>
                {wiping ? "지우는 중…" : "지웁니다"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── 조각들 ────────────────────────────────── */

/**
 * 결제 한 건의 상세
 *
 * 표에는 합계 하나만 있다. 「이 363,000원이 무엇이었나」는 표만 봐서는
 * 답이 안 나오고, 그때마다 회원 화면으로 건너가야 했다. 매출을 맞춰 보는
 * 자리에서 그 걸음이 제일 잦다.
 *
 * 상품마다 정가 · 할인 · 결제 · 미수를 나눠 적는다. 이용권 줄에 적힌 값만
 * 쓰고 짐작해서 채우지 않는다 — 안 적힌 것은 안 적혔다고 둔다. 예전에
 * 비율로 나눠 채웠다가 실제 결제와 전혀 안 맞았다.
 */
function PayDetail({
  x, items, productOf, memberName, branch, staffNames, onClose,
}: {
  x: Payment;
  /** 이 결제에 딸린 이용권 줄 */
  items: Ticket[];
  productOf: (code: string) => ProductMeta | undefined;
  memberName: string;
  branch: string;
  staffNames: Record<string, string>;
  onClose: () => void;
}) {
  const 합 = num(x.결제금액);
  const 미수 = num(x.미수금액);
  const ways = [
    { k: "현금", v: num(x.현금액) },
    { k: "카드", v: num(x.카드액) },
    { k: "계좌", v: num(x.계좌액) },
  ].filter((w) => w.v > 0);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{memberName} · {money(합)}원</h3>
        <p className="page-sub" style={{ margin: "2px 0 12px" }}>
          {(x.결제일시 ?? "").slice(0, 16).replace("T", " ")} · {branch} · {x.id}
        </p>

        <div className="kv">
          <div className="kv-row"><span>유형</span>
            <b>{isRefund(x) ? "환불" : typeOf(x.매출유형)}</b></div>
          <div className="kv-row"><span>수단</span><b>{x.결제수단 || "-"}</b></div>
          <div className="kv-row"><span>결제 담당</span>
            <b>{staffNames[x.담당직원사번] ?? "-"}</b></div>
          <div className="kv-row"><span>등록자</span>
            <b>{staffNames[x.등록자] ?? x.등록자 ?? "-"}
              {x.등록일시 ? ` · ${x.등록일시.slice(0, 16).replace("T", " ")}` : ""}</b></div>
          {ways.length > 0 && (
            <div className="kv-row"><span>나눠 받음</span>
              <b className="num">{ways.map((w) => `${w.k} ${money(w.v)}`).join(" · ")}</b></div>
          )}
          {미수 > 0 && (
            <div className="kv-row"><span>미수금</span>
              <b className="num bad">{money(미수)}
                {x.미수금결제예정일 ? ` · ${x.미수금결제예정일.slice(0, 10)}까지` : ""}</b></div>
          )}
          {isRefund(x) && (
            <div className="kv-row"><span>환불</span>
              <b className="num bad">{money(num(x.환불액))}
                {x.환불사유 ? ` · ${x.환불사유}` : ""}</b></div>
          )}
        </div>

        <h4 className="viz-title mt">무엇을 팔았나</h4>
        {items.length === 0 ? (
          /* 이어 붙일 이용권을 못 찾은 경우. 짐작해서 채우지 않는다 */
          <p className="stat-note">
            이 결제에 이어진 이용권을 찾지 못했습니다. 이용권 시트에 「결제번호」 칸이 없던
            동안 판 것이고, 같은 날 같은 회원의 결제가 여러 건이면 어느 쪽인지 알 수 없어
            잇지 않습니다.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>상품</th>
                  <th className="r">결제</th>
                  <th className="r">할인</th>
                  <th className="r">미수</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const pr = productOf(t.상품코드);
                  const 적힘 = (t.금액 ?? "").trim() !== "";
                  const 기간 = [
                    (t.시작일 ?? "").slice(0, 10),
                    (t.종료일 ?? "").slice(0, 10),
                  ].filter(Boolean).join(" ~ ");
                  return (
                    <tr key={t.id}>
                      <td>
                        <b>{pr?.name || t.상품코드}</b>
                        {(기간 || t.총횟수) && (
                          <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                            {[기간, t.총횟수 ? `${t.총횟수}회` : ""].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="r num">
                        {적힘 ? money(num(t.금액)) : <span className="dim">기록 없음</span>}
                      </td>
                      <td className="r num dim">{num(t.할인) > 0 ? money(num(t.할인)) : "-"}</td>
                      <td className={`r num ${num(t.미수금) > 0 ? "bad" : "dim"}`}>
                        {num(t.미수금) > 0 ? money(num(t.미수금)) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}


/**
 * 환불 칸 만들기
 *
 * 시트를 직접 여시지 않아도 되게 버튼 하나로 끝낸다.
 * 이 앱이 구글 열쇠를 갖고 있으니 대신 칸을 만들어 준다.
 * 두 번 눌러도 이미 있는 칸은 건너뛰므로 겹쳐 생기지 않는다.
 */
function SetupRefund({ missing, can }: { missing: string[]; can: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");

  if (done) {
    return (
      <div className="setup done">
        <div>{done} <b>새로고침</b>하면 환불 표가 채워집니다.</div>
      </div>
    );
  }

  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/sheet-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: "환불" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "칸을 만들지 못했습니다.");
      // 무엇을 만들었는지 그대로 알려준다. 아무것도 안 만들었으면 그렇다고 말한다
      setDone(
        data.added?.length
          ? `결제 탭에 ${data.added.join(" · ")} 칸을 만들었습니다.`
          : "칸이 이미 있었습니다."
      );
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <div>
        <b>결제 탭에 칸 {missing.length}개가 없습니다</b>
        <p>
          {missing.join(" · ")} — 이 칸이 있어야 환불이 어디까지 왔는지, 왜 환불했는지
          적을 수 있습니다.
        </p>
        {msg && <p className="err">{msg}</p>}
      </div>
      {can ? (
        <button className="btn-dark" onClick={run} disabled={busy}>
          {busy ? "만드는 중…" : "칸 만들기"}
        </button>
      ) : (
        <span className="dim" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
          대표만 만들 수 있습니다
        </span>
      )}
    </div>
  );
}

/** 지난달·작년 대비 증감 */
function Delta({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className="delta flat">–</span>;
  if (v === 0) return <span className="delta flat">0%</span>;
  return (
    <span className={`delta ${v > 0 ? "up" : "down"}`}>
      {v > 0 ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );
}

/** 눈금이 딱 떨어지도록 위쪽 값을 올려 잡는다 */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const raw = v * 1.15;
  const e = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) {
    if (e * m >= raw) return e * m;
  }
  return e * 10;
}

/**
 * 월별 흐름 — 꺾은선
 *
 * 막대는 달끼리 비교하는 그림이고 선은 흐름을 보는 그림이다.
 * 여기서 알고 싶은 것은 오르고 있느냐이므로 선을 쓴다.
 * 회색 점선이 그달 목표라 선이 점선 위인지 아래인지만 봐도 된다.
 */
function LineChart({ rows, current, onPick }: {
  rows: { m: string; sum: number; goal: number }[];
  current: string;
  onPick: (m: string) => void;
}) {
  const W = 760, L = 58, R = 736, TOP = 22, BASE = 190;
  const n = rows.length;
  const top = niceMax(Math.max(1, ...rows.map((r) => Math.max(r.sum, r.goal))));
  const x = (i: number) => (n > 1 ? L + (i * (R - L)) / (n - 1) : (L + R) / 2);
  const y = (v: number) => BASE - (v / top) * (BASE - TOP);
  const step = n > 1 ? (R - L) / (n - 1) : R - L;

  const line = rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(r.sum).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${BASE} L${x(0).toFixed(1)} ${BASE} Z`;

  /** 목표는 달마다 바뀌므로 계단 모양으로 그린다 */
  const goalPath = (() => {
    let d = "";
    let open = false;
    rows.forEach((r, i) => {
      if (r.goal <= 0) { open = false; return; }
      const x0 = i === 0 ? x(0) : (x(i - 1) + x(i)) / 2;
      const x1 = i === n - 1 ? x(n - 1) : (x(i) + x(i + 1)) / 2;
      const yy = y(r.goal).toFixed(1);
      d += `${open ? "L" : "M"}${x0.toFixed(1)} ${yy} L${x1.toFixed(1)} ${yy} `;
      open = true;
    });
    return d.trim();
  })();

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, v: top * f }));
  const iCur = Math.max(0, rows.findIndex((r) => r.m === current));

  return (
    <svg className="lc" viewBox={`0 0 ${W} 216`} role="img" aria-label="최근 12개월 매출 꺾은선 그래프">
      <defs>
        <linearGradient id="lcfade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="g0" />
          <stop offset="100%" className="g1" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t.f}>
          <line className={t.f === 0 ? "axis" : "grid"}
                x1={L} y1={y(t.v)} x2={R + 6} y2={y(t.v)} />
          <text className="tick" x={L - 8} y={y(t.v) + 3.5} textAnchor="end">{axisLabel(t.v)}</text>
        </g>
      ))}

      {goalPath && <path className="goal" d={goalPath} />}
      <path className="area" d={area} fill="url(#lcfade)" />
      <path className="ln" d={line} />

      <circle className="cur" cx={x(iCur)} cy={y(rows[iCur]?.sum ?? 0)} r="5.5" />
      {rows[iCur]?.sum > 0 && (
        <text className="curlb" x={Math.min(x(iCur) + 10, R)} y={y(rows[iCur].sum) + 19}
              textAnchor={iCur > n - 3 ? "end" : "start"}>
          {koShort(rows[iCur].sum)}
        </text>
      )}

      {rows.map((r, i) => (
        <g className="col" key={r.m} onClick={() => onPick(r.m)}>
          <rect x={x(i) - step / 2} y={TOP - 8} width={step} height={BASE - TOP + 8} fill="transparent">
            <title>{`${r.m.replace("-", "년 ")}월 · ${money(r.sum)}원${r.goal > 0 ? ` · 목표 ${money(r.goal)}원` : ""}`}</title>
          </rect>
          <circle className="hov" cx={x(i)} cy={y(r.sum)} r="5" />
          <text className={`mlb${r.m === current ? " on" : ""}`} x={x(i)} y={209} textAnchor="middle">
            {Number(r.m.slice(5, 7))}월
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * 매출 구성 — 도넛
 *
 * 전체를 나눠 갖는 비중이라 원형이 맞다.
 * 가운데에 합계를 넣어 도넛 자체가 총매출 덩어리로 읽히게 했다.
 */
function Donut({ rows, center, label }: {
  rows: { key: string; sum: number }[];
  center: string;
  label: string;
}) {
  const total = rows.reduce((s, r) => s + r.sum, 0);
  const R = 62, C = 2 * Math.PI * R, GAP = 2.5;
  let acc = 0;

  return (
    <svg className="dn" viewBox="0 0 168 168" role="img" aria-label={label}>
      <g transform="rotate(-90 84 84)" fill="none" strokeWidth="21">
        {/* 값이 0인 갈래도 자리를 지나가야 색과 항목이 어긋나지 않는다 */}
        {rows.map((r, i) => {
          const len = total > 0 ? (r.sum / total) * C : 0;
          const off = acc;
          acc += len;
          if (r.sum <= 0) return null;
          return (
            <circle key={r.key} className={`s${i + 1}`} cx="84" cy="84" r={R}
                    strokeDasharray={`${Math.max(0, len - GAP).toFixed(1)} ${C.toFixed(1)}`}
                    strokeDashoffset={(-off).toFixed(1)}>
              <title>{`${r.key} ${money(r.sum)}원`}</title>
            </circle>
          );
        })}
      </g>
      <text className="dn-lb" x="84" y="80" textAnchor="middle">합계</text>
      {/* 「13만」 같은 어림값 대신 정확한 금액을 넣는다. 자릿수가 늘면
          도넛 밖으로 넘치므로 글자 크기를 같이 줄인다 */}
      <text className="dn-vl" x="84" y="101" textAnchor="middle"
            style={{ fontSize: center.length > 12 ? 11 : center.length > 9 ? 13 : 15 }}>
        {center}
      </text>
    </svg>
  );
}

/** 지점 줄 끝에 붙는 6개월 흐름 */
/**
 * 눈금으로 쓰기 좋은 윗값
 *
 * 실제 최댓값이 549,000이면 눈금이 549,000 · 411,750 … 이 되어 아무도
 * 못 읽는다. 1 · 2 · 5 의 배수로 올려 잡아야 눈금이 말이 된다.
 */
function niceTop(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/**
 * 한 주 갈래 꺾은선
 *
 * ── 왜 한 주만 보여주나 ─────────────────────────────────────
 * 처음에는 한 달 다섯 주를 한 그림에 올렸다. 그런데 대표님이 실제로 하시는
 * 질문은 「이번 주 어땠나」다. 다섯 주가 같이 있으면 그 한 주를 눈으로
 * 골라내야 하고, 점 하나에 이레치가 뭉쳐 있어 무슨 요일에 팔렸는지는 아예
 * 알 수가 없었다.
 *
 * 한 주만 띄우고 요일로 편다. 월요일부터 일요일까지 일곱 점이라 「토요일에
 * 몰린다」 같은 것이 눈에 보인다. 다른 주는 좌우 화살표로 넘긴다.
 *
 * ── 지킨 것 ─────────────────────────────────────────────────
 * 세로 눈금은 한 달 전체에서 가장 큰 값으로 고정한다. 주마다 눈금을 다시
 * 잡으면 매출이 적은 주도 그래프가 꽉 차 보여서, 넘길 때마다 착시가 생긴다.
 *
 * 값이 0인 날에는 점도 글자도 안 붙인다. 색은 도넛과 같은 차례다.
 */
function WeekLines({ list, month }: {
  list: { day: number; key: string; sum: number; count: number; six: { key: string; sum: number }[] }[];
  month: string;
}) {
  const keys = list[0]?.six.map((k) => k.key) ?? [];

  /* 달력 그대로 월~일로 자른다. 첫 주와 끝 주는 며칠만 걸릴 수 있다 */
  const weeks = useMemo(() => {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    /* 월요일을 0 으로 센다. 자바스크립트는 일요일이 0 이라 그대로 쓰면
       일요일이 그 주의 첫날이 된다 */
    const mon0 = (day: number) => (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7;
    const 요일 = ["월", "화", "수", "목", "금", "토", "일"];

    const groups: (typeof list)[] = [];
    list.forEach((d) => {
      const 첫날 = d.day - mon0(d.day);
      const 앞 = groups[groups.length - 1];
      if (앞 && 앞[0].day - mon0(앞[0].day) === 첫날) 앞.push(d);
      else groups.push([d]);
    });

    return groups.map((days) => {
      const from = days[0].day;
      const to = days[days.length - 1].day;
      return {
        days: days.map((d) => ({ ...d, 요일: 요일[mon0(d.day)] })),
        label:
          from === to
            ? `${m}월 ${from}일(${요일[mon0(from)]})`
            : `${m}월 ${from}일(${요일[mon0(from)]}) ~ ${to}일(${요일[mon0(to)]})`,
        sum: days.reduce((a, d) => a + d.sum, 0),
        count: days.reduce((a, d) => a + d.count, 0),
      };
    });
  }, [list, month]);

  /* 처음 열 때는 돈이 오간 마지막 주를 보여준다. 빈 주에서 시작하면
     「자료가 없나」 하고 닫게 된다 */
  const 처음 = useMemo(() => {
    for (let i = weeks.length - 1; i >= 0; i--) if (weeks[i].sum > 0) return i;
    return Math.max(0, weeks.length - 1);
  }, [weeks]);

  const [wi, setWi] = useState(처음);
  const [hi, setHi] = useState<number | null>(null);
  const at = Math.min(wi, weeks.length - 1);
  const week = weeks[at];
  if (keys.length === 0 || !week) return null;

  const days = week.days;
  const W = 760, H = 250, PL = 62, PR = 20, PTop = 26, PB = 30;
  /* 눈금은 달 전체에서 가장 큰 날에 맞춘다 — 주를 넘겨도 높이가 안 흔들린다 */
  const top = niceTop(Math.max(1, ...list.flatMap((d) => d.six.map((k) => k.sum))));
  const x = (i: number) => (days.length === 1 ? (PL + W - PR) / 2
    : PL + (i * (W - PL - PR)) / (days.length - 1));
  const y = (v: number) => PTop + (1 - v / top) * (H - PTop - PB);
  const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((r) => r * top);

  /* 값이 비슷한 갈래끼리 글자가 포개지지 않게 아래에서부터 밀어 올린다 */
  const labelsAt = (di: number) => {
    const rows = keys
      .map((_, si) => ({ si, v: days[di].six[si]?.sum ?? 0 }))
      .filter((r) => r.v > 0)
      .map((r) => ({ ...r, y: y(r.v) }))
      .sort((a, b) => b.y - a.y);
    let 아래 = Infinity;
    return rows.map((r) => {
      const ny = Math.min(r.y - 8, 아래 - 13);
      아래 = ny;
      return { ...r, ly: Math.max(11, ny) };
    });
  };

  const cur = hi === null ? null : days[hi];

  return (
    <div className="dlwrap">
      <div className="wk-head">
        <button className="icon-btn" aria-label="지난주" disabled={at === 0}
                onClick={() => { setWi(at - 1); setHi(null); }}>‹</button>
        <b className="wk-lb">{week.label}</b>
        <button className="icon-btn" aria-label="다음주" disabled={at >= weeks.length - 1}
                onClick={() => { setWi(at + 1); setHi(null); }}>›</button>
        <span className="wk-sum num">{money(week.sum)}원 · {week.count}건</span>
      </div>

      <svg className="lc dl" viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`${week.label} 갈래별 매출 꺾은선 그래프`}>
        {steps.map((v, i) => (
          <g key={i}>
            <line className="grid" x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} />
            <text className="tick" x={PL - 8} y={y(v) + 3.5} textAnchor="end">
              {axisLabel(v)}
            </text>
          </g>
        ))}
        <line className="axis" x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} />

        {days.map((d, i) => (
          <text className="tick" key={d.key} x={x(i)} y={H - 10} textAnchor="middle">
            {d.day}일({d.요일})
          </text>
        ))}

        {hi !== null && (
          <line className="cross" x1={x(hi)} x2={x(hi)} y1={PTop} y2={y(0)} />
        )}

        {keys.map((key, si) => (
          <g key={key}>
            <path className={`ln s${si + 1}`}
                  d={`M${days.map((d, i) => `${x(i).toFixed(1)} ${y(d.six[si]?.sum ?? 0).toFixed(1)}`).join(" L")}`} />
            {days.map((d, i) =>
              (d.six[si]?.sum ?? 0) > 0 ? (
                <circle className={`dot s${si + 1}`} key={d.key}
                        cx={x(i)} cy={y(d.six[si].sum)} r={4} />
              ) : null
            )}
          </g>
        ))}

        {/* 점 위 금액 — 선보다 나중에 그려야 선에 안 가린다 */}
        {days.map((d, i) =>
          labelsAt(i).map((r) => (
            <text className="ptlb" key={`${d.key}-${r.si}`}
                  x={x(i)} y={r.ly}
                  textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"}>
              {money(r.v)}
            </text>
          ))
        )}

        {days.map((d, i) => (
          <rect key={d.key} className="hit"
                x={x(i) - (days.length > 1 ? (W - PL - PR) / (days.length - 1) / 2 : 60)}
                y={0} width={days.length > 1 ? (W - PL - PR) / (days.length - 1) : 120}
                height={H - PB}
                onMouseEnter={() => setHi(i)}
                onMouseLeave={() => setHi(null)} />
        ))}
      </svg>

      <div className={`dl-tip${cur ? " on" : ""}`}>
        {cur ? (
          <>
            <b className="dt">
              {Number(month.slice(5, 7))}월 {cur.day}일({cur.요일}) · {money(cur.sum)}원 ·{" "}
              {cur.count}건
            </b>
            <ul>
              {cur.six.map((k, i) => (
                <li key={k.key} className={k.sum > 0 ? "" : "off"}>
                  <i className={`sw s${i + 1}`} />
                  <span className="nm">{k.key}</span>
                  <span className="vl num">{k.sum > 0 ? money(k.sum) : "-"}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="vkey">
        {keys.map((k, i) => (
          <span key={k}><i className={`ln s${i + 1}`} />{k}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * 한 갈래의 분포 — 가로 막대
 *
 * 파이로 그리면 다섯 조각까지는 읽히지만 「쌍용동 · 두정동 · 신방동 …」처럼
 * 갈래가 여남은이면 아무것도 안 읽힌다. 가로 막대는 몇 줄이든 위에서
 * 아래로 읽히고, 이름이 길어도 자리가 있다.
 *
 * 안 적힌 것은 「모름」으로 세운다. 빼 버리면 「20대가 절반」이라고 읽히는데
 * 실은 절반이 안 적힌 것일 수 있다 — 그게 더 위험한 착각이다.
 */
function Dist({ title, rows, total }: {
  title: string;
  rows: { key: string; n: number }[];
  total: number;
}) {
  /*
    막대 길이는 전체 대비 비율이다
    
    처음에는 그 카드 안에서 가장 큰 값을 100% 로 잡았다. 그러면 성별의
    「남자 5명」과 방문경로의 「모름 10명」이 똑같은 길이로 그려진다 —
    카드마다 자가 달라서 옆 카드와 견줄 수가 없다.
    
    전체 인원을 100% 로 두면 다섯 카드가 같은 자를 쓴다. 옆에 적힌
    퍼센트와 막대 길이도 그제서야 같은 말을 한다.
  */
  return (
    <div className="viz">
      <h3 className="viz-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="dim mini-note">아직 자료가 없습니다.</p>
      ) : (
        <div className="dist">
          {rows.map((r) => (
            <div className={`drow${r.n === 0 ? " zero" : ""}`} key={r.key}>
              <span className={`nm${r.key === "모름" ? " dim" : ""}`}>{r.key}</span>
              <span className="bt">
                {r.n > 0 && (
                  <i className={r.key === "모름" ? "off" : ""}
                     style={{ width: `${Math.max(2, (r.n / Math.max(1, total)) * 100)}%` }} />
                )}
              </span>
              <span className="am num">{r.n}명</span>
              <span className="pc num">{Math.round((r.n / Math.max(1, total)) * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniLine({ rows }: { rows: number[] }) {
  if (rows.length < 2) return <span className="mline" />;
  const hi = Math.max(...rows), lo = Math.min(...rows);
  const span = Math.max(1, hi - lo);
  const d = rows
    .map((v, i) => {
      const x = 2 + (i * 56) / (rows.length - 1);
      const y = 18 - ((v - lo) / span) * 13;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="mline" viewBox="0 0 60 22" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * 100% 띠 하나
 *
 * 지점끼리 비중을 견주는 자리에 쓴다.
 * 금액이 달라도 길이를 같게 맞춰야 "비중"이 눈으로 비교된다.
 * 색 순서는 목록·범례와 같아야 하므로 값이 0인 갈래도 자리를 지킨다.
 */
function Ratio({ rows }: { rows: { key: string; sum: number }[] }) {
  const total = rows.reduce((s, r) => s + r.sum, 0);
  // 빈 막대를 그리면 "0원"인지 "고장난 것"인지 알 수 없다. 글자로 말한다
  if (total <= 0) return <span className="norow">이 달 자료 없음</span>;

  return (
    <span className="ratio">
      {rows.map((r, i) =>
        r.sum > 0 ? (
          <i key={r.key} className={`s${i + 1}`}
             style={{ width: `${(r.sum / total) * 100}%` }}
             title={`${r.key} ${money(r.sum)}원 · ${Math.round((r.sum / total) * 100)}%`} />
        ) : null
      )}
    </span>
  );
}
