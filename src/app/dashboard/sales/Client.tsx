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

type Payment = {
  id: string;
  회원번호: string;
  결제일시: string;
  결제금액: string;
  결제수단: string;
  지점코드: string;
  미수금액: string;
  환불여부: string;
  환불액: string;
  매출유형: string;
  현금액: string;
  카드액: string;
  계좌액: string;
  담당직원사번: string;
};

type Ticket = { id: string; 상품코드: string; 결제번호: string; 금액: string };
type Named = { code: string; name: string };
type Goal = { 지점코드: string; 연월: string; 목표금액: number };
/** 등록실패율을 내기 위한 상담 한 줄 */
type Lead = { 지점코드: string; 상담날짜: string; 약속일시: string; 진행상태: string };

type Props = {
  payments: Payment[];
  tickets: Ticket[];
  products: ProductMeta[];
  goals: Goal[];
  leads: Lead[];
  branches: Named[];
  staffNames: Record<string, string>;
  problem: string;
};

const money = (n: number) => n.toLocaleString("ko-KR");
const num = (v?: string) => Number((v ?? "").replace(/[^0-9-]/g, "")) || 0;
const isRefund = (x: Payment) => (x.환불여부 ?? "").toUpperCase() === "Y";

/** 큰 금액은 만 단위로 줄여 쓴다 (표 옆 작은 숫자용) */
function short(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return money(n);
}

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

  const byMethod = [
    { key: "현금", sum: cur.live.reduce((s, x) => s + num(x.현금액), 0) },
    { key: "카드", sum: cur.live.reduce((s, x) => s + num(x.카드액), 0) },
    { key: "계좌", sum: cur.live.reduce((s, x) => s + num(x.계좌액), 0) },
  ].filter((x) => x.sum > 0);

  /**
   * 결제 금액을 상품 갈래로 나눈다
   *
   * 이용권에 적힌 금액이 있으면 그대로 쓰고, 없으면 상품 정가로 나눈다.
   * 결제 한 건에 회원권과 사물함이 같이 들어 있어도 각각 얼마인지 알 수 있다.
   */
  const bucketOf = useMemo(() => {
    const byPay: Record<string, Ticket[]> = {};
    p.tickets.forEach((t) => (byPay[t.결제번호] ??= []).push(t));

    const where = (kind?: string) => {
      const k = kind ?? "";
      if (k.includes("회원권")) return "회원권" as const;
      if (k.includes("PT")) return "PT" as const;
      if (k.includes("수업")) return "수업" as const;
      return "기타" as const;
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
        const type = typeOf(pay.매출유형);
        const ts = byPay[pay.id] ?? [];
        const w = ts.map((t) => {
          const pr = productOf(t.상품코드);
          return num(t.금액) || pr?.card || pr?.cash || 0;
        });
        const wsum = w.reduce((a, b) => a + b, 0);
        if (ts.length === 0 || wsum <= 0) {
          put("미분류", amt, type);
          return;
        }
        ts.forEach((t, i) => {
          put(where(productOf(t.상품코드)?.kind), Math.round((amt * w[i]) / wsum), type);
        });
      });
      return out;
    };
  }, [p.tickets, p.products]);

  const bucket = bucketOf(cur.live);

  /** 상품 갈래 네 줄 — 도넛과 신규·재등록 막대가 같이 쓴다 */
  const kinds = [
    { key: "회원권", ...bucket.회원권 },
    { key: "1:1 PT", ...bucket.PT },
    { key: "그룹수업", ...bucket.수업 },
    {
      key: "기타",
      total: bucket.기타.total + bucket.미분류.total,
      신규: bucket.기타.신규 + bucket.미분류.신규,
      재등록: bucket.기타.재등록 + bucket.미분류.재등록,
    },
  ];
  const kindsLive = kinds.filter((k) => k.total > 0);
  const 신규합 = kinds.reduce((s, k) => s + k.신규, 0);
  const 재등록합 = kinds.reduce((s, k) => s + k.재등록, 0);
  const 기타합 = Math.max(0, cur.sum - 신규합 - 재등록합);

  /**
   * 등록실패율 — 상담 화면과 같은 규칙으로 센다
   *
   * 약속을 잡은 건은 약속 날짜, 아직 없는 건은 문의가 들어온 날 기준이다.
   */
  const lead = useMemo(() => {
    const rows = p.leads.filter(
      (c) => baseDate(c).startsWith(month) && (branch === "전체" || c.지점코드 === branch)
    );
    const fail = rows.filter((c) => stageNow(c, now) === "미등록").length;
    return {
      base: rows.length,
      fail,
      failRate: rows.length > 0 ? Math.round((fail / rows.length) * 100) : null,
    };
  }, [p.leads, month, branch, now]);

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

  const byDay = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const map: Record<string, number> = {};
    cur.live.forEach((x) => {
      const d = (x.결제일시 ?? "").slice(0, 10);
      if (d) map[d] = (map[d] ?? 0) + num(x.결제금액);
    });
    const list = Array.from({ length: last }, (_, i) => {
      const key = `${month}-${String(i + 1).padStart(2, "0")}`;
      return { day: i + 1, key, sum: map[key] ?? 0 };
    });
    return { list, top: Math.max(1, ...list.map((d) => d.sum)) };
  }, [cur.live, month]);

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
            <span className="am num">{short(cur.sum)}</span>
          </button>
          {branchNow.map((b) => (
            <button key={b.code} className={`bchip${branch === b.code ? " on" : ""}`}
                    onClick={() => setBranch(b.code)}>
              <span className="nm">{b.name}</span>
              <span className="am num">{b.sum > 0 ? short(b.sum) : "-"}</span>
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
          <p className="viz-sub">이번 달 매출 구성</p>
          {kindsLive.length === 0 ? (
            <p className="dim mini-note">이 달에 잡힌 매출이 없습니다.</p>
          ) : (
            <div className="dwrap">
              <Donut rows={kindsLive.map((k) => ({ key: k.key, sum: k.total }))}
                     center={koShort(cur.sum)} />
              <ul className="dlist">
                {kindsLive.map((k, i) => (
                  <li key={k.key}>
                    <i className={`sw s${i + 1}`} />
                    <span className="nm">{k.key}</span>
                    <span className="vl num">{short(k.total)}</span>
                    <span className="pc num">
                      {cur.sum > 0 ? Math.round((k.total / cur.sum) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 신규 · 재등록 — 둘뿐이라 원형은 오히려 안 읽힌다 */}
        <div className="viz">
          <h3 className="viz-title">누가 냈나</h3>
          <p className="viz-sub">상품마다 신규 · 재등록으로 나눠서</p>
          {kindsLive.length === 0 ? (
            <p className="dim mini-note">이 달에 잡힌 매출이 없습니다.</p>
          ) : (
            <>
              <div className="nr">
                {kindsLive.map((k) => {
                  const top = Math.max(...kindsLive.map((x) => x.total));
                  const w = (v: number) => `${(v / top) * 100}%`;
                  const rest = Math.max(0, k.total - k.신규 - k.재등록);
                  return (
                    <div className="nr-row" key={k.key}>
                      <span className="nm">{k.key}</span>
                      <span className="bar" title={`신규 ${money(k.신규)}원 · 재등록 ${money(k.재등록)}원`}>
                        {k.신규 > 0 && <i className="s1" style={{ width: w(k.신규) }} />}
                        {k.재등록 > 0 && <i className="s1-lt" style={{ width: w(k.재등록) }} />}
                        {rest > 0 && <i className="s-etc" style={{ width: w(rest) }} />}
                      </span>
                      <span className="tot num">{short(k.total)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="vkey">
                <span><i className="sw s1" />신규 <b className="num">{short(신규합)}</b></span>
                <span><i className="sw s1-lt" />재등록 <b className="num">{short(재등록합)}</b></span>
                {기타합 > 0 && (
                  <span><i className="sw s-etc" />기타매출 <b className="num">{short(기타합)}</b></span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

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
                    <span className="bt">
                      <i style={{ width: `${(b.sum / top) * 100}%` }} />
                      {b.goal > 0 && <u style={{ left: `${(b.goal / top) * 100}%` }} />}
                    </span>
                    <span className="am num">
                      {short(b.sum)}
                      <small>{b.goal > 0 ? `목표 ${short(b.goal)}` : "목표 없음"}</small>
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

      {/* 챙길 것 — 그래프로 만들 내용이 아니라 숫자만 */}
      <h2 className="sec-title">챙길 것</h2>
      <div className="tiles">
        <div className="tile">
          <span className="lb">아직 못 받은 돈</span>
          <b className={`vl num${cur.unpaid > 0 ? " bad" : ""}`}>{money(cur.unpaid)}원</b>
          <span className="sub">
            {cur.unpaid > 0 ? `실입금 ${money(cur.sum - cur.unpaid)}원` : "전액 입금"}
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

      {/* 자주 보지 않는 것은 접어 둔다 */}
      <details className="more">
        <summary>자세히 보기 — 일별 · 결제수단 · 직원별 · 결제 내역</summary>

        <h3 className="viz-title mt">일별</h3>
        <p className="viz-sub">막대가 없는 날은 결제가 없던 날입니다</p>
        <div className="viz">
          {cur.count === 0 ? (
            <p className="dim mini-note">이 달에 등록된 결제가 없습니다.</p>
          ) : (
            <>
              <div className="day-bars">
                {byDay.list.map((d) => (
                  <div className={`day${d.sum > 0 ? " on" : ""}`} key={d.key}
                       title={`${d.day}일 · ${money(d.sum)}원`}>
                    <i style={{ height: d.sum > 0 ? `${Math.max(6, (d.sum / byDay.top) * 100)}%` : "2px" }} />
                  </div>
                ))}
              </div>
              <div className="day-axis">
                <span>1일</span>
                <span>가장 높은 날 {short(byDay.top)}원</span>
                <span>{byDay.list.length}일</span>
              </div>
            </>
          )}
        </div>

        {byMethod.length > 0 && (
          <>
            <h3 className="viz-title mt">결제 수단</h3>
            <div className="viz">
              <Stack rows={byMethod} />
            </div>
          </>
        )}

        {byStaff.length > 0 && (
          <>
            <h3 className="viz-title mt">담당 직원별</h3>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>순위</th>
                    <th>직원</th>
                    <th className="right">매출</th>
                    <th className="right">비중</th>
                    <th className="right">건수</th>
                    <th className="right">건당 평균</th>
                  </tr>
                </thead>
                <tbody>
                  {byStaff.map((s, i) => (
                    <tr key={s.id}>
                      <td className="num dim">{i + 1}</td>
                      <td className="strong">{s.name}</td>
                      <td className="num right strong">{money(s.sum)}</td>
                      <td className="num right dim">
                        {cur.sum > 0 ? `${Math.round((s.sum / cur.sum) * 100)}%` : "-"}
                      </td>
                      <td className="num right dim">{s.count}</td>
                      <td className="num right dim">{money(Math.round(s.sum / s.count))}</td>
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
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>결제일</th>
                  <th>지점</th>
                  <th>유형</th>
                  <th>수단</th>
                  <th>담당</th>
                  <th className="right">금액</th>
                  <th className="right">미수금</th>
                </tr>
              </thead>
              <tbody>
                {cur.rows
                  .slice()
                  .sort((a, b) => (b.결제일시 ?? "").localeCompare(a.결제일시 ?? ""))
                  .map((x) => (
                    <tr key={x.id}>
                      <td className="num dim">{(x.결제일시 ?? "").slice(5, 10)}</td>
                      <td className="dim">{branchName(x.지점코드)}</td>
                      <td>
                        {isRefund(x) ? (
                          <span className="pill bad">환불</span>
                        ) : (
                          <span className="pill">{typeOf(x.매출유형)}</span>
                        )}
                      </td>
                      <td className="dim">{x.결제수단 || "-"}</td>
                      <td className="dim">{p.staffNames[x.담당직원사번] ?? "-"}</td>
                      <td className="num right strong">{money(num(x.결제금액))}</td>
                      <td className={`num right ${num(x.미수금액) > 0 ? "late" : "dim"}`}>
                        {num(x.미수금액) > 0 ? money(num(x.미수금액)) : "-"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </>
  );
}

/* ── 조각들 ────────────────────────────────── */

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
function Donut({ rows, center }: { rows: { key: string; sum: number }[]; center: string }) {
  const total = rows.reduce((s, r) => s + r.sum, 0);
  const R = 62, C = 2 * Math.PI * R, GAP = 2.5;
  let acc = 0;

  return (
    <svg className="dn" viewBox="0 0 168 168" role="img" aria-label="상품별 매출 비중 도넛 그래프">
      <g transform="rotate(-90 84 84)" fill="none" strokeWidth="21">
        {rows.map((r, i) => {
          const len = total > 0 ? (r.sum / total) * C : 0;
          const off = acc;
          acc += len;
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
      <text className="dn-vl" x="84" y="101" textAnchor="middle">{center}</text>
    </svg>
  );
}

/** 지점 줄 끝에 붙는 6개월 흐름 */
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

/** 비중을 한 줄로 보여주고 아래에 항목별 값을 적는다 */
function Stack({ rows }: { rows: { key: string; sum: number }[] }) {
  const total = rows.reduce((s, r) => s + r.sum, 0);
  if (total <= 0) return <p className="dim mini-note">금액이 없습니다.</p>;

  return (
    <>
      <div className="stack">
        {rows.map((r, i) => (
          <i key={r.key} className={`s${i + 1}`} style={{ width: `${(r.sum / total) * 100}%` }} />
        ))}
      </div>
      <ul className="dlist mt">
        {rows.map((r, i) => (
          <li key={r.key}>
            <i className={`sw s${i + 1}`} />
            <span className="nm">{r.key}</span>
            <span className="vl num">{money(r.sum)}</span>
            <span className="pc num">{Math.round((r.sum / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}
