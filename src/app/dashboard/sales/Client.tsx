"use client";

/**
 * 매출 — 달을 골라 지점 · 유형 · 상품 · 직원별로 나눠 본다
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

type Ticket = {
  id: string;
  상품코드: string;
  결제번호: string;
  금액: string;
};

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

/** 매출 유형을 세 갈래로만 묶는다 (시트 표기가 조금 달라도 맞춘다) */
const typeOf = (v: string) => {
  const t = (v ?? "").trim();
  if (t.startsWith("재등")) return "재등록";
  if (t.startsWith("신규")) return "신규";
  if (t) return "기타매출";
  return "미분류";
};

const TYPES = ["신규", "재등록", "기타매출", "미분류"];

/** 최근 12개월 목록 */
function recentMonths(from: string, count = 12): string[] {
  const [y, m] = from.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export default function Client(p: Props) {
  const now = today();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [branch, setBranch] = useState("전체");

  const months = useMemo(() => recentMonths(now.slice(0, 7)), [now]);
  const branchName = (c: string) => p.branches.find((b) => b.code === c)?.name ?? c;
  const productOf = (code: string) => p.products.find((x) => x.code === code);

  /** 고른 달·지점의 결제 */
  const rows = useMemo(
    () =>
      p.payments.filter((x) => {
        if (!(x.결제일시 ?? "").startsWith(month)) return false;
        if (branch !== "전체" && x.지점코드 !== branch) return false;
        return true;
      }),
    [p.payments, month, branch]
  );

  // 환불한 건은 매출에서 빼고, 환불액은 따로 센다
  const live = rows.filter((x) => !isRefund(x));
  const total = live.reduce((s, x) => s + num(x.결제금액), 0);
  const refund = rows.filter(isRefund).reduce((s, x) => s + (num(x.환불액) || num(x.결제금액)), 0);
  const unpaid = live.reduce((s, x) => s + num(x.미수금액), 0);
  const cashIn = total - unpaid;

  /** 목표 — 지점을 고르면 그 지점만, 전체면 다 더한다 */
  const goal = p.goals
    .filter((g) => g.연월 === month && (branch === "전체" || g.지점코드 === branch))
    .reduce((s, g) => s + g.목표금액, 0);
  const rate = goal > 0 ? Math.round((total / goal) * 100) : 0;

  const byType = TYPES.map((t) => ({
    key: t,
    sum: live.filter((x) => typeOf(x.매출유형) === t).reduce((s, x) => s + num(x.결제금액), 0),
    count: live.filter((x) => typeOf(x.매출유형) === t).length,
  })).filter((x) => x.count > 0);

  const byMethod = [
    { key: "현금", sum: live.reduce((s, x) => s + num(x.현금액), 0) },
    { key: "카드", sum: live.reduce((s, x) => s + num(x.카드액), 0) },
    { key: "계좌", sum: live.reduce((s, x) => s + num(x.계좌액), 0) },
  ].filter((x) => x.sum > 0);

  const byBranch = p.branches
    .map((b) => {
      const sum = live.filter((x) => x.지점코드 === b.code).reduce((s, x) => s + num(x.결제금액), 0);
      const g = p.goals.find((x) => x.연월 === month && x.지점코드 === b.code)?.목표금액 ?? 0;
      return { ...b, sum, goal: g, rate: g > 0 ? Math.round((sum / g) * 100) : 0 };
    })
    .filter((b) => b.sum > 0 || b.goal > 0)
    .sort((a, b) => b.sum - a.sum);

  const byStaff = useMemo(() => {
    const map: Record<string, number> = {};
    live.forEach((x) => {
      const id = x.담당직원사번 || "-";
      map[id] = (map[id] ?? 0) + num(x.결제금액);
    });
    return Object.entries(map)
      .map(([id, sum]) => ({ id, name: p.staffNames[id] ?? id, sum }))
      .sort((a, b) => b.sum - a.sum);
  }, [live, p.staffNames]);

  /**
   * 상품 분류별 매출
   *
   * 이용권 줄에 적힌 금액을 더한다. 그 칸이 비어 있으면 셀 수 없으므로
   * 아예 보여주지 않는다. 결제 총액을 임의로 나눠 담으면 틀린 숫자가 된다.
   */
  const byKind = useMemo(() => {
    const ids = new Set(live.map((x) => x.id));
    const mine = p.tickets.filter((t) => ids.has(t.결제번호) && num(t.금액) > 0);
    const map: Record<string, number> = {};
    mine.forEach((t) => {
      const kind = productOf(t.상품코드)?.kind || "기타";
      map[kind] = (map[kind] ?? 0) + num(t.금액);
    });
    const list = Object.entries(map).map(([k, sum]) => ({ key: k, sum }));
    return { list: list.sort((a, b) => b.sum - a.sum), covered: mine.length > 0 };
  }, [live, p.tickets, p.products]);

  /**
   * 일별 매출 — 그 달의 모든 날을 다 그린다
   *
   * 결제가 있는 날만 그리면 한두 건일 때 막대 하나가 화면을 가득 채워
   * 무슨 그림인지 알 수 없게 된다.
   */
  const byDay = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const map: Record<string, number> = {};
    live.forEach((x) => {
      const d = (x.결제일시 ?? "").slice(0, 10);
      if (d) map[d] = (map[d] ?? 0) + num(x.결제금액);
    });
    const list = Array.from({ length: last }, (_, i) => {
      const day = i + 1;
      const key = `${month}-${String(day).padStart(2, "0")}`;
      return { day, key, sum: map[key] ?? 0 };
    });
    return { list, top: Math.max(1, ...list.map((d) => d.sum)) };
  }, [live, month]);

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
          <p className="page-sub">결제 기준 · 환불한 건은 뺀 금액</p>
        </div>
        <div className="filter-right">
          <select className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m.slice(0, 4)}년 {Number(m.slice(5, 7))}월
              </option>
            ))}
          </select>
          {p.branches.length > 1 && (
            <select className="select" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="전체">전 지점</option>
              {p.branches.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="lb">매출</div>
          <div className="vl num">{money(total)}<em>원</em></div>
          <div className="dt">결제 {live.length}건</div>
        </div>
        <div className="stat">
          <div className="lb">목표 달성률</div>
          <div className="vl num">{goal > 0 ? `${rate}%` : "-"}</div>
          <div className="dt">{goal > 0 ? `목표 ${money(goal)}원` : "월매출목표 미입력"}</div>
        </div>
        <div className="stat">
          <div className="lb">실제 들어온 돈</div>
          <div className="vl num">{money(cashIn)}<em>원</em></div>
          <div className="dt">미수금 {money(unpaid)}원 제외</div>
        </div>
        <div className="stat">
          <div className="lb">환불</div>
          <div className="vl num">{money(refund)}<em>원</em></div>
          <div className="dt">{rows.filter(isRefund).length}건</div>
        </div>
      </div>

      {live.length === 0 ? (
        <div className="empty">
          <Icon name="card" size={26} />
          <b>이 달에 등록된 결제가 없습니다</b>
          <p>회원 등록이나 상품 추가로 결제가 쌓이면 여기에 나옵니다.</p>
        </div>
      ) : (
        <>
          <div className="sales-grid">
            <Panel title="매출 유형">
              {byType.map((t) => (
                <Bar key={t.key} label={t.key} sum={t.sum} total={total}
                     note={`${t.count}건`} />
              ))}
            </Panel>

            <Panel title="결제 수단">
              {byMethod.length === 0 ? (
                <p className="dim" style={{ fontSize: 12.5 }}>나뉜 금액이 적혀 있지 않습니다.</p>
              ) : (
                byMethod.map((m) => <Bar key={m.key} label={m.key} sum={m.sum} total={total} />)
              )}
            </Panel>

            {p.branches.length > 1 && (
              <Panel title="지점별">
                {byBranch.map((b) => (
                  <Bar key={b.code} label={b.name} sum={b.sum} total={total}
                       note={b.goal > 0 ? `목표 대비 ${b.rate}%` : ""} />
                ))}
              </Panel>
            )}

            {byKind.covered && (
              <Panel title="상품 분류별">
                {byKind.list.map((k) => (
                  <Bar key={k.key} label={k.key} sum={k.sum} total={total} />
                ))}
              </Panel>
            )}

            <Panel title="담당 직원별">
              {byStaff.map((s) => (
                <Bar key={s.id} label={s.name} sum={s.sum} total={total} />
              ))}
            </Panel>

            <Panel title="일별">
              <div className="day-bars">
                {byDay.list.map((d) => (
                  <div className={`day${d.sum > 0 ? " on" : ""}`} key={d.key}
                       title={`${d.key} · ${money(d.sum)}원`}>
                    <i style={{ height: d.sum > 0 ? `${Math.max(6, (d.sum / byDay.top) * 100)}%` : "2px" }} />
                  </div>
                ))}
              </div>
              <div className="day-axis">
                <span>1</span><span>{Math.round(byDay.list.length / 2)}</span>
                <span>{byDay.list.length}</span>
              </div>
            </Panel>
          </div>

          <h2 className="sec-title">결제 내역 {live.length}건</h2>
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
                {rows
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
        </>
      )}
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sales-card">
      <h4 className="mini-title" style={{ marginTop: 0 }}>{title}</h4>
      {children}
    </div>
  );
}

function Bar({ label, sum, total, note }: {
  label: string; sum: number; total: number; note?: string;
}) {
  const pct = total > 0 ? Math.round((sum / total) * 100) : 0;
  return (
    <div className="sbar">
      <div className="sbar-top">
        <span className="nm">{label}</span>
        <span className="vl num">{money(sum)}</span>
        <span className="pc num">{pct}%</span>
      </div>
      <div className="track"><i style={{ width: `${pct}%` }} /></div>
      {note && <span className="sbar-note">{note}</span>}
    </div>
  );
}
