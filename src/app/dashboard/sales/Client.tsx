"use client";

/**
 * 매출 대시보드
 *
 * 결제 탭이 원장이고, 이 화면은 거기서 읽은 것을 묶기만 한다.
 * 숫자 하나를 보여줄 때마다 "그래서 어떻다는 건가"에 답할 수 있어야 한다.
 * 그래서 값 옆에 늘 지난달 대비와 목표 대비를 같이 둔다.
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { today } from "@/lib/time";
import type { ProductMeta } from "@/lib/productMeta";

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

type Props = {
  payments: Payment[];
  tickets: Ticket[];
  products: ProductMeta[];
  goals: Goal[];
  branches: Named[];
  staffNames: Record<string, string>;
  problem: string;
};

const money = (n: number) => n.toLocaleString("ko-KR");
const num = (v?: string) => Number((v ?? "").replace(/[^0-9-]/g, "")) || 0;
const isRefund = (x: Payment) => (x.환불여부 ?? "").toUpperCase() === "Y";

/** 큰 금액은 만 단위로 줄여 쓴다 (차트 눈금용) */
function short(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return money(n);
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
  const trend = useMemo(() => monthsBack(month, 12).map((m) => monthStat(m)), [month, monthStat]);

  /** 이번 달 지점별 값 — 칩과 비교 카드가 같이 쓴다 */
  const branchNow = useMemo(
    () =>
      p.branches.map((b, i) => {
        const c = monthStat(month, b.code);
        const q = monthStat(shiftMonth(month, -1), b.code);
        return {
          ...b,
          i,
          sum: c.sum,
          count: c.count,
          goal: c.goal,
          rate: c.goal > 0 ? Math.round((c.sum / c.goal) * 100) : null,
          mom: c.sum > 0 || q.sum > 0 ? (q.sum > 0 ? Math.round(((c.sum - q.sum) / q.sum) * 100) : null) : null,
          avg: c.count > 0 ? Math.round(c.sum / c.count) : 0,
          spark: monthsBack(month, 6).map((m) => monthStat(m, b.code).sum),
        };
      }),
    [p.branches, month, monthStat]
  );

  /** 12개월 추이를 지점별로 쌓아 보기 위한 값 */
  const trendByBranch = useMemo(
    () =>
      monthsBack(month, 12).map((m) => ({
        m,
        goal: monthStat(m).goal,
        parts: p.branches.map((b, i) => ({ i, name: b.name, sum: monthStat(m, b.code).sum })),
        sum: monthStat(m).sum,
      })),
    [month, monthStat, p.branches]
  );

  const delta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const avg = cur.count > 0 ? Math.round(cur.sum / cur.count) : 0;
  const prevAvg = prev.count > 0 ? Math.round(prev.sum / prev.count) : 0;
  const rate = cur.goal > 0 ? Math.round((cur.sum / cur.goal) * 100) : null;

  /** 이번 달이면 지금까지 지난 날 기준으로 월말 매출을 어림한다 */
  const pace = useMemo(() => {
    if (month !== thisMonth) return null;
    const day = Number(now.slice(8, 10));
    if (day < 3 || cur.sum <= 0) return null;
    const [y, mm] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    return { day, last, expect: Math.round((cur.sum / day) * last) };
  }, [month, thisMonth, now, cur.sum]);

  const byType = ["신규", "재등록", "기타매출", "미분류"]
    .map((k) => ({
      key: k,
      sum: cur.live.filter((x) => typeOf(x.매출유형) === k).reduce((s, x) => s + num(x.결제금액), 0),
      count: cur.live.filter((x) => typeOf(x.매출유형) === k).length,
    }))
    .filter((x) => x.count > 0);

  /** 회원권을 다시 끊은 비율 — 기타매출은 빼고 본다 */
  const rejoin = (() => {
    const n = byType.find((t) => t.key === "신규")?.count ?? 0;
    const r = byType.find((t) => t.key === "재등록")?.count ?? 0;
    return n + r > 0 ? Math.round((r / (n + r)) * 100) : null;
  })();

  const byMethod = [
    { key: "현금", sum: cur.live.reduce((s, x) => s + num(x.현금액), 0) },
    { key: "카드", sum: cur.live.reduce((s, x) => s + num(x.카드액), 0) },
    { key: "계좌", sum: cur.live.reduce((s, x) => s + num(x.계좌액), 0) },
  ].filter((x) => x.sum > 0);

  const byKind = useMemo(() => {
    const ids = new Set(cur.live.map((x) => x.id));
    const mine = p.tickets.filter((t) => ids.has(t.결제번호) && num(t.금액) > 0);
    const map: Record<string, number> = {};
    mine.forEach((t) => {
      const kind = productOf(t.상품코드)?.kind || "기타";
      map[kind] = (map[kind] ?? 0) + num(t.금액);
    });
    return Object.entries(map)
      .map(([key, sum]) => ({ key, sum }))
      .sort((a, b) => b.sum - a.sum);
  }, [cur.live, p.tickets, p.products]);

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
              <i className={`c${b.i % 4}`} />
              <span className="nm">{b.name}</span>
              <span className="am num">{b.sum > 0 ? short(b.sum) : "-"}</span>
            </button>
          ))}
        </div>
      )}

      <div className="kpis">
        <Kpi label="매출" value={`${money(cur.sum)}원`} d={delta(cur.sum, prev.sum)}
             sub={`지난달 ${money(prev.sum)}원`} />
        <Kpi label="목표 달성률"
             value={rate === null ? "-" : `${rate}%`}
             sub={cur.goal > 0
               ? cur.sum >= cur.goal
                 ? `목표 ${money(cur.goal)}원 달성`
                 : `${money(cur.goal - cur.sum)}원 남음`
               : "월매출목표 미입력"}
             bar={cur.goal > 0 ? Math.min(100, (cur.sum / cur.goal) * 100) : undefined} />
        <Kpi label="결제 건수" value={`${cur.count}건`} d={delta(cur.count, prev.count)}
             sub={`지난달 ${prev.count}건`} />
        <Kpi label="객단가" value={`${money(avg)}원`} d={delta(avg, prevAvg)}
             sub={rejoin === null ? "재등록 자료 없음" : `재등록률 ${rejoin}%`} />
        <Kpi label="미수금" value={`${money(cur.unpaid)}원`}
             sub={cur.unpaid > 0 ? `실입금 ${money(cur.sum - cur.unpaid)}원` : "전액 입금"}
             tone={cur.unpaid > 0 ? "bad" : undefined} />
        <Kpi label="환불" value={`${money(cur.refund)}원`}
             sub={`${cur.rows.filter(isRefund).length}건`}
             tone={cur.refund > 0 ? "bad" : undefined} />
      </div>

      {pace && (
        <p className="stat-note">
          {pace.day}일까지 <b>{money(cur.sum)}원</b> · 이 속도면 월말에{" "}
          <b>{money(pace.expect)}원</b>
          {cur.goal > 0 && (
            <>
              {" · "}목표{" "}
              {pace.expect >= cur.goal
                ? "달성 예상"
                : `${money(cur.goal - pace.expect)}원 부족 예상`}
            </>
          )}
        </p>
      )}

      <h2 className="sec-title">최근 12개월</h2>
      <div className="panel">
        <div className="bd">
          <Trend rows={branch === "전체" ? trendByBranch : trend} current={month}
                 onPick={setMonth} split={branch === "전체" && p.branches.length > 1} />
          {branch === "전체" && p.branches.length > 1 && (
            <div className="legend">
              {branchNow.map((b) => (
                <span key={b.code}><i className={`c${b.i % 4}`} />{b.name}</span>
              ))}
              <span className="goal"><i />목표</span>
            </div>
          )}
        </div>
      </div>

      {p.branches.length > 1 && branch === "전체" && (
        <>
          <h2 className="sec-title">지점 비교</h2>
          <div className="bcards">
            {branchNow
              .slice()
              .sort((a, b) => b.sum - a.sum)
              .map((b, rank) => (
                <button key={b.code} className="bcard" onClick={() => setBranch(b.code)}>
                  <div className="bc-head">
                    <i className={`c${b.i % 4}`} />
                    <b>{b.name}</b>
                    <span className="rank num">{rank + 1}위</span>
                  </div>
                  <div className="bc-sum">
                    <b className="num">{money(b.sum)}</b>
                    <Delta v={b.mom} />
                  </div>
                  {b.goal > 0 ? (
                    <>
                      <div className="track">
                        <i className={`c${b.i % 4}`}
                           style={{ width: `${Math.min(100, (b.sum / b.goal) * 100)}%` }} />
                      </div>
                      <div className="bc-goal">
                        목표 {short(b.goal)}원 · <b>{b.rate}%</b>
                      </div>
                    </>
                  ) : (
                    <div className="bc-goal">목표 미입력</div>
                  )}
                  <Spark rows={b.spark} tone={b.i % 4} />
                  <div className="bc-foot">
                    <span>{b.count}건</span>
                    <span>건당 {short(b.avg)}원</span>
                  </div>
                </button>
              ))}
          </div>
        </>
      )}

      <h2 className="sec-title">매출 구성</h2>
      <div className="sales-grid">
        <Panel title="유형별" note={rejoin !== null ? `재등록률 ${rejoin}%` : undefined}>
          <Stack rows={byType.map((t) => ({ key: t.key, sum: t.sum }))} />
        </Panel>
        <Panel title="결제 수단">
          {byMethod.length === 0 ? (
            <p className="dim" style={{ fontSize: 12.5 }}>나뉜 금액이 적혀 있지 않습니다.</p>
          ) : (
            <Stack rows={byMethod} />
          )}
        </Panel>
        <Panel title="상품 분류">
          {byKind.length === 0 ? (
            <p className="dim" style={{ fontSize: 12.5 }}>
              이용권에 금액이 적힌 결제가 아직 없습니다.
            </p>
          ) : (
            <Stack rows={byKind} />
          )}
        </Panel>
      </div>

      <h2 className="sec-title">일별</h2>
      <div className="panel">
        <div className="bd">
          {cur.count === 0 ? (
            <p className="dim" style={{ fontSize: 13, margin: 0 }}>이 달에 등록된 결제가 없습니다.</p>
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
                <span>가장 많은 날 {short(byDay.top)}원</span>
                <span>{byDay.list.length}일</span>
              </div>
            </>
          )}
        </div>
      </div>

      {byStaff.length > 0 && (
        <>
          <h2 className="sec-title">담당 직원별</h2>
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

      <h2 className="sec-title">결제 내역 {cur.rows.length}건</h2>
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
    </>
  );
}

/* ── 조각들 ────────────────────────────────── */

function Kpi({ label, value, sub, d, bar, tone }: {
  label: string; value: string; sub?: string;
  d?: number | null; bar?: number; tone?: "bad";
}) {
  return (
    <div className="kpi">
      <div className="lb">{label}</div>
      <div className="row">
        <b className={`vl num${tone ? ` ${tone}` : ""}`}>{value}</b>
        {d !== undefined && <Delta v={d} />}
      </div>
      {bar !== undefined && (
        <div className="track" style={{ margin: "9px 0 7px" }}>
          <i style={{ width: `${bar}%` }} />
        </div>
      )}
      {sub && <div className="dt">{sub}</div>}
    </div>
  );
}

/** 지난달 대비 증감 */
function Delta({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className="delta flat">–</span>;
  if (v === 0) return <span className="delta flat">0%</span>;
  return (
    <span className={`delta ${v > 0 ? "up" : "down"}`}>
      {v > 0 ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );
}

/** 지점 카드 안의 작은 6개월 막대 */
function Spark({ rows, tone }: { rows: number[]; tone: number }) {
  const top = Math.max(1, ...rows);
  return (
    <div className="spark">
      {rows.map((v, i) => (
        <i key={i} className={v > 0 ? `c${tone}` : ""}
           style={{ height: v > 0 ? `${Math.max(10, (v / top) * 100)}%` : "2px" }} />
      ))}
    </div>
  );
}

/**
 * 12개월 추이
 *
 * 옅은 칸이 목표, 채워진 막대가 실적이다.
 * 전 지점을 보고 있을 때는 지점별로 색을 나눠 쌓는다.
 * 총액만 보면 어느 지점이 끌어올렸는지 알 수 없다.
 */
function Trend({ rows, current, onPick, split }: {
  rows: { m: string; sum: number; goal: number; parts?: { i: number; name: string; sum: number }[] }[];
  current: string;
  onPick: (m: string) => void;
  split: boolean;
}) {
  const top = Math.max(1, ...rows.map((r) => Math.max(r.sum, r.goal)));
  return (
    <div className="trend">
      {rows.map((r) => (
        <button key={r.m} type="button"
                className={`tcol${r.m === current ? " on" : ""}`}
                onClick={() => onPick(r.m)}
                title={
                  split && r.parts
                    ? `${r.m}\n${r.parts.filter((x) => x.sum > 0).map((x) => `${x.name} ${money(x.sum)}`).join("\n") || "매출 없음"}`
                    : `${r.m} · ${money(r.sum)}원`
                }>
          <span className="tval num">{r.sum > 0 ? short(r.sum) : ""}</span>
          <span className="tbar">
            {r.goal > 0 && <i className="goal" style={{ height: `${(r.goal / top) * 100}%` }} />}
            {split && r.parts ? (
              <span className="stackcol">
                {r.parts.filter((x) => x.sum > 0).map((x) => (
                  <i key={x.i} className={`c${x.i % 4}`} style={{ height: `${(x.sum / top) * 100}%` }} />
                ))}
              </span>
            ) : (
              <i className="fill" style={{ height: `${(r.sum / top) * 100}%` }} />
            )}
          </span>
          <span className="tlb">{Number(r.m.slice(5, 7))}월</span>
        </button>
      ))}
    </div>
  );
}

function Panel({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <div className="sales-card">
      <div className="card-head">
        <h4 className="mini-title" style={{ margin: 0 }}>{title}</h4>
        {note && <span className="dim">{note}</span>}
      </div>
      {children}
    </div>
  );
}

/** 비중을 한 줄로 보여주고 아래에 항목별 값을 적는다 */
function Stack({ rows }: { rows: { key: string; sum: number }[] }) {
  const total = rows.reduce((s, r) => s + r.sum, 0);
  if (total <= 0) return <p className="dim" style={{ fontSize: 12.5 }}>금액이 없습니다.</p>;

  return (
    <>
      <div className="stack">
        {rows.map((r, i) => (
          <i key={r.key} className={`s${i % 4}`} style={{ width: `${(r.sum / total) * 100}%` }} />
        ))}
      </div>
      <ul className="stack-list">
        {rows.map((r, i) => (
          <li key={r.key}>
            <span className={`dot s${i % 4}`} />
            <span className="nm">{r.key}</span>
            <span className="num vl">{money(r.sum)}</span>
            <span className="num pc">{Math.round((r.sum / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}
