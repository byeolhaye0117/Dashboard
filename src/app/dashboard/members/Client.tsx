"use client";

/**
 * 회원 목록 · 등록 · 이용권 관리
 */
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { korDate, today, daysBetween, weekdayIndex } from "@/lib/time";
import { showPhone } from "@/lib/phone";
import { addMonths, addDays, daysLeft } from "@/lib/dateCalc";
import { termOf, type ProductMeta } from "@/lib/productMeta";
import { REFUND_STAGES, REFUND_REASONS } from "@/lib/refund";

type Member = {
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
};

type Ticket = {
  id: string;
  회원번호: string;
  상품코드: string;
  지점코드: string;
  시작일: string;
  종료일: string;
  총횟수: string;
  잔여횟수: string;
  정지일수: string;
  정지시작일: string;
  정지종료예정일: string;
  담당트레이너사번: string;
  상태: string;
  결제번호: string;
  금액: string;
  /** 정가에서 깎아 드린 금액 */
  할인?: string;
  /** 이 상품에서 아직 못 받은 돈 */
  미수금?: string;
  /** 언제 만들어진 줄인지 — 결제번호가 없던 옛 줄을 날짜로 이어 붙일 때 쓴다 */
  등록일시?: string;
};

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
};

/** 이용권에 얹어준 서비스·옵션 */
type Extra = {
  id: string;
  이용권번호: string;
  상품코드: string;
  추가금액: string;
};

type Waiting = { id: string; 이름: string; 전화번호: string; 지점코드: string };
type Named = { code: string; name: string };

type TransferRow = {
  id: string; 이용권번호: string; 준회원번호: string; 받은회원번호: string;
  양도일: string; 수수료: string;
};

type Props = {
  items: Member[];
  tickets: Ticket[];
  payments: Payment[];
  extras: Extra[];
  products: ProductMeta[];
  /** 상품 → 그 상품을 파는 지점들 */
  productBranches: Record<string, string[]>;
  waiting: Waiting[];
  /* 상담이 등록이 아니라 목록에서 뺀 사람 — 소리 없이 사라지면 안 된다 */
  hidden: { 이름: string; 상태: string }[];
  /** 이용권이 오간 기록 */
  transfers: TransferRow[];
  options: Record<string, string[]>;
  branches: Named[];
  staffNames: Record<string, string>;
  trainers: { id: string; name: string }[];
  currentBranch: string;
  problem: string;
  can: { create: boolean; update: boolean; remove: boolean };
};

const PAY_METHODS = ["카드", "현금", "계좌", "카드+계좌"];
/** 만료 임박으로 볼 기간 */
const SOON = 30;

const money = (n: number) => n.toLocaleString("ko-KR");

/**
 * 상품을 카테고리로 나눈다
 *
 * 이용권: 회원권 · 1:1PT · 그룹수업. 이게 끊기면 회원이 아니다
 * 부가  : 운동복 · 사물함 · 프로틴 · 일일권 같은 것. 돈은 냈지만 이게
 *         살아 있다고 회원권이 살아 있는 것은 아니다
 * 옵션  : 24시 · 여성전용처럼 회원권에 얹는 추가 요금
 * 서비스: 돈을 안 받고 얹어준 것
 *
 * 이걸 안 나누면 사물함 3개월 때문에 회원권이 끝난 사람이
 * "이용중"으로 보인다.
 */
export type Grp = "이용권" | "부가" | "옵션" | "서비스";

/** 상품 화면에서 부가 상품으로 정한 이름들. 「기타」는 예전에 쓰던 이름이다 */
const EXTRA_KINDS = ["부가상품권", "부가상품", "부가", "기타", "용품"];

const groupOf = (pr?: ProductMeta): Grp => {
  if (!pr) return "이용권";
  const k = (pr.kind ?? "").replace(/\s/g, "");
  if (pr.isService || k === "서비스") return "서비스";
  if (pr.isOption || k === "옵션") return "옵션";
  if (EXTRA_KINDS.includes(k)) return "부가";
  return "이용권";
};

/**
 * 이용권을 카테고리로 나눈다
 *
 * 상품 시트의 「상품분류」를 그대로 본다. 분류에 「케어권」이라고 적어 두면
 * 그대로 케어권으로 들어간다 — 여기 코드를 고칠 필요가 없다.
 * 예전에 쓰던 이름(1:1PT · 그룹수업 · 기타…)도 알아듣게 해 두었다.
 *
 * 무료로 얹어준 서비스도 제 카테고리에 들어간다. "무엇을 파는가"가 아니라
 * "돈을 받았는가"의 문제라 축이 다르다.
 */
const CATS = [
  { key: "회원권", names: ["회원권", "헬스", "이용권", "정기권"] },
  { key: "수강권", names: ["수강권", "1:1PT", "PT", "개인레슨", "그룹수업", "수업", "레슨"] },
  { key: "케어권", names: ["케어권", "케어", "통증케어", "재활", "관리"] },
  { key: "부가상품권", names: ["부가상품권", "부가상품", "부가", "기타", "옵션", "용품"] },
  { key: "서비스", names: ["서비스", "무료", "사은품"] },
] as const;

const ticketCat = (pr?: ProductMeta): string => {
  const k = (pr?.kind ?? "").replace(/\s/g, "");
  // 상품 화면에서 카테고리를 정해 놨으면 그 말이 먼저다
  const named = CATS.find((c) => c.names.some((n) => n === k));
  if (named) return named.key;

  const g = groupOf(pr);
  // 부가 상품과 붙는 옵션은 이름과 상관없이 부가상품권이다
  if (g === "부가" || g === "옵션") return "부가상품권";
  if (!k) return "회원권";
  const loose = CATS.find((c) => c.names.some((n) => k.includes(n)));
  // 못 알아들은 것은 회원권으로 둔다 — 돈 받고 판 것이 부가로 밀리면 안 된다
  return loose ? loose.key : "회원권";
};

/** 지금 쓸 수 있는 이용권인가 — 기간과 횟수를 같이 본다 */
const isAlive = (t: Ticket, now: string): boolean => {
  if (t.상태 === "환불") return false;
  if (t.종료일 && daysLeft(t.종료일, now) < 0) return false;
  if (Number(t.총횟수) > 0 && Number(t.잔여횟수 || t.총횟수) <= 0) return false;
  return true;
};

export default function Client(p: Props) {
  const [tab, setTab] = useState("전체");
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [detail, setDetail] = useState<Member | null>(null);

  /* 주소에 적힌 회원번호가 있으면 그 창을 다시 연다 —
     이용권을 고치고 새로 읽은 뒤에도 보던 자리로 돌아오게 하는 길이다 */
  useEffect(() => {
    const id = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
    if (!id) return;
    const m = p.items.find((x) => x.id === id);
    if (m) setDetail(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /*
    지금 보고 있는 지점

    위쪽에서 지점을 고르는데 목록이 그대로였다. 두정점을 보고 있는데 쌍용점
    회원이 뜨면, 화면에 적힌 지점을 믿을 수 없게 된다.
    빈 값이면 담당 지점 전부 — 여러 지점을 맡은 사람은 한 번에 보기도 해야 한다.
  */
  const [branch, setBranch] = useState(p.currentBranch);
  /** 골라 둔 회원들 — 한 번에 지울 대상 */
  const [picked, setPicked] = useState<string[]>([]);
  const [killing, setKilling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const now = today();
  const thisMonth = now.slice(0, 7);

  const productOf = (code: string) => p.products.find((x) => x.code === code);
  const branchName = (c: string) => p.branches.find((b) => b.code === c)?.name ?? c;

  /**
   * 회원마다 "회원권 · PT · 수업" 이용권만 모은다
   *
   * 사물함 · 운동복 같은 부가 상품과 무료 서비스는 빼고 본다.
   * 사물함이 남아 있다고 회원권이 살아 있는 것은 아니기 때문이다.
   */
  const mainOf = useMemo(() => {
    const map: Record<string, Ticket[]> = {};
    p.tickets.forEach((t) => {
      if (groupOf(productOf(t.상품코드)) !== "이용권") return;
      (map[t.회원번호] ??= []).push(t);
    });
    return map;
  }, [p.tickets, p.products]);

  /** 목록에 보여줄 만료일 — 살아 있는 이용권 중 가장 늦게 끝나는 날 */
  const endOf = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(mainOf).forEach(([id, list]) => {
      list.forEach((t) => {
        if (t.상태 === "환불") return;
        if (t.종료일 > (map[id] ?? "")) map[id] = t.종료일;
      });
    });
    return map;
  }, [mainOf]);

  const stateOf = (m: Member) => {
    const list = mainOf[m.id] ?? [];
    if (list.length === 0) return "이용권 없음";
    const alive = list.filter((t) => isAlive(t, now));
    if (alive.length === 0) return "만료";
    const soonest = alive
      .map((t) => (t.종료일 ? daysLeft(t.종료일, now) : Infinity))
      .sort((a, b) => a - b)[0];
    return soonest <= SOON ? "만료임박" : "이용중";
  };

  /** 고른 지점 회원만 — 숫자도 목록도 전부 이걸 바탕으로 센다 */
  const scoped = useMemo(
    () => (branch ? p.items.filter((m) => m.지점코드 === branch) : p.items),
    [p.items, branch]
  );

  const newThisMonth = scoped.filter((m) => (m.가입일 ?? "").startsWith(thisMonth)).length;
  const using = scoped.filter((m) => stateOf(m) === "이용중").length;
  const soon = scoped.filter((m) => stateOf(m) === "만료임박").length;
  const expired = scoped.filter((m) => stateOf(m) === "만료").length;

  const list = useMemo(() => {
    return scoped.filter((m) => {
      if (tab !== "전체" && stateOf(m) !== tab) return false;
      if (q) {
        const hay = `${m.이름} ${m.전화번호} ${m.거주동네} ${m.직업}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [scoped, p.tickets, tab, q, now]);

  if (p.problem) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">회원</h1>
            <p className="page-sub">시트를 읽지 못했습니다</p>
          </div>
        </div>
        <div className="alert-bad" style={{ lineHeight: 1.7 }}>{p.problem}</div>
        <p className="stat-note">
          구글 시트의 <b>회원 · 이용권 · 결제</b> 탭 제목 줄을 확인해주세요.
          위 문장에 무엇이 없는지 적혀 있습니다. 칸 이름만 맞으면 순서는 달라도 됩니다.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">회원</h1>
        </div>
        {p.can.create && (
          <button className="btn-dark" onClick={() => setOpenNew(true)}>
            <Icon name="plus" size={16} strokeWidth={2} />
            회원 등록
          </button>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="lb">전체 회원</div>
          <div className="vl num">{scoped.length}</div>
          <div className="dt">이용중 {using}명</div>
        </div>
        <div className="stat">
          <div className="lb">이번 달 신규</div>
          <div className="vl num">{newThisMonth}</div>
          <div className="dt">가입일 기준</div>
        </div>
        <div className="stat">
          <div className="lb">만료 임박</div>
          <div className="vl num">{soon}</div>
          <div className="dt">{SOON}일 안에 끝남</div>
        </div>
        <div className="stat">
          <div className="lb">만료</div>
          <div className="vl num">{expired}</div>
          <div className="dt">재등록 대상</div>
        </div>
      </div>

      {p.waiting.length > 0 && p.can.create && (
        <p className="stat-note">
          상담에서 넘어올 대기 <b>{p.waiting.length}명</b>
        </p>
      )}

      {/* 숨긴 것은 숨겼다고 말한다. 소리 없이 사라지면 그게 더 무섭다 */}
      {p.hidden.length > 0 && (
        <p className="stat-note">
          상담이 등록이 아니라 뺀 사람 <b>{p.hidden.length}명</b>
          <span className="dim" style={{ marginLeft: 6 }}>
            {p.hidden.slice(0, 4).map((h) => `${h.이름}(${h.상태})`).join(" · ")}
            {p.hidden.length > 4 && " …"}
          </span>
          <span className="dim" style={{ marginLeft: 6 }}>
            상담을 「등록」으로 되돌리면 다시 나옵니다. 이용권이나 결제가 있는 분은 빼지 않습니다.
          </span>
        </p>
      )}

      {msg && <div className="alert-bad" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* 지점이 하나뿐인 사람에게는 고를 것이 없다 */}
      {p.branches.length > 1 && (
        <div className="pick-row" style={{ margin: "0 0 12px", flexWrap: "wrap" }}>
          {p.branches.map((b) => (
            <button key={b.code} className={`mini-tab${branch === b.code ? " on" : ""}`}
                    onClick={() => { setBranch(b.code); setPicked([]); }}>
              {b.name}
              {/* 0 을 빨간 딱지로 달면 아무 일도 없는데 뭔가 있는 것처럼 보인다 */}
              {p.items.filter((m) => m.지점코드 === b.code).length > 0 && (
                <span className="dot">{p.items.filter((m) => m.지점코드 === b.code).length}</span>
              )}
            </button>
          ))}
          <button className={`mini-tab${branch === "" ? " on" : ""}`}
                  onClick={() => { setBranch(""); setPicked([]); }}>
            전 지점{p.items.length > 0 && <span className="dot">{p.items.length}</span>}
          </button>
        </div>
      )}

      {p.can.remove && picked.length > 0 && (
        <div className="save-bar many" style={{ marginBottom: 12 }}>
          <span>{picked.length}명 골랐습니다</span>
          {killing ? (
            <button className="btn-danger" style={{ marginTop: 0 }} disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setMsg("");
                      const res = await fetch("/api/members/delete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: picked }),
                      });
                      const data = await res.json();
                      if (!res.ok) { setBusy(false); setKilling(false); return setMsg(data.error); }
                      location.reload();
                    }}>
              {busy ? "지우는 중…" : `정말 ${picked.length}명을 지웁니다`}
            </button>
          ) : (
            <button className="btn-danger" style={{ marginTop: 0 }} onClick={() => setKilling(true)}>
              지우기
            </button>
          )}
          <button className="btn-ghost" style={{ marginTop: 0 }}
                  onClick={() => { setPicked([]); setKilling(false); }}>선택 해제</button>
        </div>
      )}

      <div className="filters">
        <div className="chips">
          {["전체", "이용중", "만료임박", "만료", "이용권 없음"].map((t) => (
            <button key={t} className={`chip${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
              {t}
              <span className="cnt num">
                {t === "전체" ? scoped.length : scoped.filter((m) => stateOf(m) === t).length}
              </span>
            </button>
          ))}
        </div>
        <div className="filter-right">
          <input className="search" placeholder="이름 · 연락처 검색"
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <Icon name="users" size={26} />
          <b>{p.items.length === 0 ? "아직 등록된 회원이 없습니다" : "조건에 맞는 회원이 없습니다"}</b>
          <p>
            {scoped.length === 0
              ? "오른쪽 위 회원 등록 단추로 첫 회원을 넣어보세요."
              : "필터를 바꿔보세요."}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                {p.can.remove && (
                  <th style={{ width: 34 }}>
                    <input type="checkbox" className="pick-box" aria-label="모두 고르기"
                           checked={list.length > 0 && list.every((m) => picked.includes(m.id))}
                           onChange={(e) =>
                             setPicked(e.target.checked ? list.map((m) => m.id) : [])
                           } />
                  </th>
                )}
                <th>이름</th>
                <th>연락처</th>
                <th>성별 · 나이</th>
                <th>동네</th>
                <th>지점</th>
                <th>담당</th>
                <th>가입일</th>
                <th>만료일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const st = stateOf(m);
                const end = endOf[m.id];
                return (
                  <tr key={m.id} className={picked.includes(m.id) ? "is-picked" : ""}
                      onClick={() => setDetail(m)}>
                    {p.can.remove && (
                      /* 지우려고 고르는 칸이라 줄을 여는 것과 겹치면 안 된다 */
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="pick-box"
                               aria-label={`${m.이름} 고르기`}
                               checked={picked.includes(m.id)}
                               onChange={() =>
                                 setPicked((cur) =>
                                   cur.includes(m.id)
                                     ? cur.filter((x) => x !== m.id)
                                     : [...cur, m.id]
                                 )
                               } />
                      </td>
                    )}
                    <td className="strong">{m.이름}</td>
                    <td className="num">{showPhone(m.전화번호)}</td>
                    <td className="dim">
                      {[m.성별, m.나이대].filter(Boolean).join(" · ") || "-"}
                    </td>
                    <td className="dim">{m.거주동네 || "-"}</td>
                    <td className="dim">{branchName(m.지점코드)}</td>
                    <td className="dim">{p.staffNames[m.담당직원사번] ?? "-"}</td>
                    <td className="num dim">{(m.가입일 ?? "").slice(2)}</td>
                    <td className={st === "만료" ? "late num" : "num dim"}>
                      {end ? end.slice(2) : "-"}
                    </td>
                    <td>
                      <span className={`pill ${TONE[st] ?? ""}`}>{st}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openNew && (
        <NewForm
          products={p.products}
          productBranches={p.productBranches}
          waiting={p.waiting}
          options={p.options}
          branches={p.branches}
          trainers={p.trainers}
          defaultBranch={p.currentBranch}
          onClose={() => setOpenNew(false)}
        />
      )}

      {detail && (
        <Detail
          item={detail}
          tickets={p.tickets.filter((t) => t.회원번호 === detail.id)}
          payments={p.payments.filter((x) => x.회원번호 === detail.id)}
          extras={(() => {
            const mine = new Set(p.tickets.filter((t) => t.회원번호 === detail.id).map((t) => t.id));
            return p.extras.filter((s) => mine.has(s.이용권번호));
          })()}
          products={p.products}
          productBranches={p.productBranches}
          productOf={productOf}
          options={p.options}
          trainers={p.trainers}
          staffNames={p.staffNames}
          branchName={branchName(detail.지점코드)}
          can={p.can}
          members={p.items}
          transfers={p.transfers.filter(
            (x) => x.준회원번호 === detail.id || x.받은회원번호 === detail.id
          )}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

const TONE: Record<string, string> = {
  이용중: "good",
  만료임박: "warn",
  만료: "bad",
  "이용권 없음": "",
};

/* ── 상품 고르기 + 결제 (등록·추가에서 같이 쓴다) ── */
type Line = {
  상품코드: string;
  시작일: string;
  종료일: string;
  총횟수: string;
  /** 사물함 · 운동복처럼 개월을 골라 사는 상품에서 쓴다 */
  개월: string;
  /** 이 줄에 현금가를 쓸지 카드가를 쓸지 */
  가격구분: "현금" | "카드";
  /** 이 상품에서 깎아준 금액 */
  할인: string;
  /** 이 상품에서 아직 못 받은 금액 */
  미수금: string;
};

type Buy = {
  lines: Line[];
  결제수단: string;
  /** 직접 고쳤을 때만 채운다. 비어 있으면 상품값 합계를 쓴다 */
  금액: string;
  직접입력: boolean;
  카드액: string;
  계좌액: string;
  미수금액: string;
  미수금결제예정일: string;
  매출유형: string;
};

const emptyBuy = (): Buy => ({
  lines: [], 결제수단: "카드", 금액: "", 직접입력: false,
  카드액: "", 계좌액: "", 미수금액: "", 미수금결제예정일: "", 매출유형: "",
});

const onlyNum = (v?: string) => Number((v ?? "").replace(/[^0-9]/g, "")) || 0;

/** 서비스·옵션인가 — 이용권이 아니라 회원권에 얹는 항목이다 */
const isExtraKind = (pr?: ProductMeta) => {
  const g = groupOf(pr);
  return g === "서비스" || g === "옵션";
};

/** 화면에서 고른 것을 서버가 받는 모양으로 바꾼다 */
/** 현금가 또는 카드가 한 개 값 */
function unitPrice(pr: ProductMeta | undefined, cashSide: boolean): number {
  if (!pr) return 0;
  return (cashSide ? pr.cash : pr.card) || pr.cash || pr.card || 0;
}

/** 결제수단이 정하는 기본 가격 종류 */
const defaultKind = (method: string): "현금" | "카드" =>
  method === "현금" || method === "계좌" ? "현금" : "카드";

/**
 * 이 줄의 값
 *
 * 사물함처럼 개월을 골라 사는 상품은 상품에 적힌 기본 개월을 한 단위로 보고
 * 고른 개월만큼 곱한다. (1개월 11,000원짜리를 3개월 고르면 33,000원)
 */
function listPrice(l: Line, pr: ProductMeta | undefined): number {
  const unit = unitPrice(pr, l.가격구분 === "현금");
  if (!unit || !pr) return 0;
  if (!pricePerMonth(pr)) return unit;
  const base = pr.months || 1;
  const want = Number(l.개월) || base;
  return Math.round((unit * want) / base);
}

/** 깎아준 뒤 실제로 받을 값 */
function linePrice(l: Line, pr: ProductMeta | undefined): number {
  return Math.max(0, listPrice(l, pr) - onlyNum(l.할인));
}

/**
 * 개월을 골라 사는 상품인가
 *
 * 사물함 · 운동복 같은 부가 상품과 24시 · 여성전용 같은 옵션이다.
 * 달마다 값이 붙는 것들이라 몇 달치를 받을지 그때그때 정한다.
 */
/**
 * 이 상품의 시작일에서 종료일을 잰다
 *
 * 개월짜리와 일짜리를 한 자리에서 다룬다. 둘을 각각 계산하는 자리가
 * 늘어나면 한쪽만 고쳐서 어긋난다 — 종료일은 회원이 제일 먼저 보는 숫자다.
 * 종료일은 마지막으로 쓸 수 있는 날이다. 30일권을 8월 14일에 끊으면
 * 9월 12일까지다.
 */
function endOf(pr: ProductMeta | undefined, start: string, months: number): string {
  if (!start) return "";
  if (pr?.unit === "일") return pr.days ? addDays(start, pr.days - 1) : "";
  return months ? addMonths(start, months) : "";
}

/**
 * 고치고 나면 보던 자리로 돌아온다
 *
 * 저장하면 화면을 새로 읽는데(location.reload), 그러면 열어 두었던 회원 창이
 * 닫히고 목록으로 튕긴다. 이용권 하나 고치고 나서 그 회원을 다시 찾아 여는
 * 것은 하루에 몇 번씩 하는 일이라 그때마다 손이 간다.
 *
 * 주소 뒤에 회원번호를 적어 두고 새로 읽는다. 화면이 뜰 때 그 번호가 있으면
 * 그 회원 창을 다시 연다. 주소에 남으므로 새로고침을 눌러도 그대로다.
 */
function reloadTo(memberId?: string): void {
  if (memberId) location.hash = memberId;
  location.reload();
}

/**
 * 새로 파는 것은 쓰고 있는 것 뒤에 이어 붙인다
 *
 * 회원권이 12월 7일까지인데 오늘 「7일 서비스」를 얹으면, 시작일이 오늘로
 * 잡혀 기간이 겹친다. 겹치면 서비스를 드린 것이 아니라 이미 쓰고 있는
 * 날에 덧칠한 것이 된다.
 *
 * 같은 갈래에서 제일 늦은 종료일 다음 날부터 시작한다. 갈래를 나누는 이유는
 * 회원권이 남아 있어도 PT 는 오늘부터 시작하는 것이 맞기 때문이다.
 * 지난 것뿐이면 오늘부터다.
 *
 * 눈에 보이는 값이라 다르면 그 자리에서 고치실 수 있다.
 */
function nextStart(pr: ProductMeta | undefined, tickets: Ticket[], products: ProductMeta[], now: string): string {
  const cat = ticketCat(pr);
  const prOf = (code: string) => products.find((x) => x.code === code);
  let last = "";
  tickets.forEach((t) => {
    if (ticketCat(prOf(t.상품코드)) !== cat) return;
    if ((t.상태 ?? "").includes("환불")) return;
    const end = (t.종료일 ?? "").slice(0, 10);
    if (end && end > last) last = end;
  });
  if (!last || last < now) return now;
  return addDays(last, 1);
}

const canPickMonths = (pr?: ProductMeta) => {
  const g = groupOf(pr);
  if (g === "서비스") return false;
  // 회원권은 상품 이름에 개월이 박혀 있다 (1+2, 6+6). 그건 건드리지 않는다
  return g === "부가" || g === "옵션" || usesCount(pr);
};

/**
 * 개월만큼 값이 곱해지는 상품인가
 *
 * 사물함 · 24시처럼 달마다 값이 붙는 것만 곱한다.
 * PT 10회 100,000원은 몇 달 안에 쓰든 값이 같으므로 곱하면 안 된다.
 */
const pricePerMonth = (pr?: ProductMeta) => {
  const g = groupOf(pr);
  return (g === "부가" || g === "옵션") && !usesCount(pr);
};

/** 고를 수 있는 개월 — 1개월부터 12개월까지 */
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 이 줄에 현금가를 쓸지 카드가를 쓸지
 *
 * 회원권은 현금으로 받고 사물함은 카드로 긁는 경우가 있어 줄마다 따로 고른다.
 * 값이 한 가지뿐인 상품에는 고를 것이 없으므로 보여주지 않는다.
 */
function KindPick({ value, pr, onChange }: {
  value: "현금" | "카드";
  pr?: ProductMeta;
  onChange: (v: "현금" | "카드") => void;
}) {
  if (!pr || !pr.cash || !pr.card || pr.cash === pr.card) return null;
  return (
    <label>
      <span>가격</span>
      <select className="input" value={value}
              onChange={(e) => onChange(e.target.value as "현금" | "카드")}>
        <option value="현금">현금가 {money(pr.cash)}원</option>
        <option value="카드">카드가 {money(pr.card)}원</option>
      </select>
    </label>
  );
}

function MonthPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {/* 프로틴처럼 한 번 사고 마는 것은 기간이 없다 */}
      <option value="">기간 없음</option>
      {MONTHS.map((n) => (
        <option key={n} value={String(n)}>{n}개월</option>
      ))}
    </select>
  );
}

/** 만료 뒤 이 기간 안에 다시 끊으면 재등록으로 본다 */
const REJOIN_DAYS = 7;

/**
 * 매출 유형을 스스로 정한다
 *
 * 기타매출: 사물함 · 운동복처럼 부가 상품만 산 경우
 * 재등록  : 아직 쓰는 회원권이 있거나, 끝난 지 7일 안에 다시 끊은 경우
 * 신규    : 처음 오신 분이거나, 끝난 지 7일이 지나 다시 오신 경우
 *
 * 직원이 매번 고르게 하면 사람마다 다르게 찍혀서 재등록률을 믿을 수 없게 된다.
 */
function salesType(
  lines: Line[],
  products: ProductMeta[],
  tickets: Ticket[],
  now: string
): "신규" | "재등록" | "기타매출" {
  const pOf = (code: string) => products.find((x) => x.code === code);
  const isMain = (code: string) => groupOf(pOf(code)) === "이용권";

  if (!lines.some((l) => isMain(l.상품코드))) return "기타매출";

  const mains = tickets.filter((t) => isMain(t.상품코드) && t.상태 !== "환불");
  if (mains.length === 0) return "신규";

  const lastEnd = mains.map((t) => t.종료일).filter(Boolean).sort().pop();
  // 기간이 없는 이용권만 있어도 이미 다니던 분이다
  if (!lastEnd) return "재등록";

  const left = daysLeft(lastEnd, now);
  if (left >= 0) return "재등록";
  return -left <= REJOIN_DAYS ? "재등록" : "신규";
}

/** 시트 선택목록에 비슷한 값이 있으면 그 표기를 그대로 쓴다 */
function matchOption(value: string, opts?: string[]): string {
  if (!opts?.length) return value;
  const head = value.slice(0, 2);
  return opts.find((o) => o.replace(/\s/g, "").startsWith(head)) ?? value;
}

function buyPayload(
  b: Buy,
  products: ProductMeta[],
  tickets: Ticket[] = [],
  now: string = today(),
  saleOpts?: string[]
) {
  const pOf = (code: string) => products.find((x) => x.code === code);
  const split = b.결제수단.includes("+");
  // 옵션은 돈을 받는 항목이라 합계에 들어간다. 무료 서비스만 뺀다
  const suggested = b.lines.reduce((s, l) => s + linePrice(l, pOf(l.상품코드)), 0);

  /*
   * 서비스·옵션만 골랐으면 그것이 곧 이용권이다
   *
   * 이 둘은 원래 회원권 위에 얹는 항목이다. 그런데 「네이버 7일 서비스」처럼
   * 회원권 없이 그것만 드리는 일이 실제로 있다. 예전에는 그걸 막아 뒀는데,
   * 막으면 데스크에서 할 수 있는 일이 없어진다.
   *
   * 얹을 회원권이 있으면 얹고, 없으면 그것 자체를 한 줄로 세운다.
   * 얹을 데 없는 것을 얹으라고 넘기면 서버가 조용히 버린다 —
   * 실제로 그래서 아무 일도 안 일어났다.
   */
  const 얹을것 = b.lines.filter((l) => !isExtraKind(pOf(l.상품코드)));
  const 단독 = 얹을것.length === 0;

  return {
    이용권: (단독 ? b.lines : 얹을것)
      .map((l) => ({ ...l, 금액: String(linePrice(l, pOf(l.상품코드))) })),
    부가서비스: 단독
      ? []
      : b.lines
          .filter((l) => isExtraKind(pOf(l.상품코드)))
          .map((l) => ({
            상품코드: l.상품코드,
            // 옵션은 달마다 붙는 값이라 고른 개월만큼 곱해서 남긴다
            추가금액: String(linePrice(l, pOf(l.상품코드))),
          })),
    결제수단: b.결제수단,
    결제금액: split
      ? String(onlyNum(b.카드액) + onlyNum(b.계좌액))
      : b.직접입력 ? b.금액 : String(suggested),
    카드액: split ? b.카드액 : "",
    계좌액: split ? b.계좌액 : "",
    // 미수금은 상품마다 적은 것을 더해서 결제 한 줄에 담는다
    미수금액: String(b.lines.reduce((s, l) => s + onlyNum(l.미수금), 0)),
    미수금결제예정일: b.미수금결제예정일,
    매출유형: matchOption(salesType(b.lines, products, tickets, now), saleOpts),
    suggested,
  };
}

/**
 * 상품을 고르는 묶음
 *
 * 상품 관리 화면과 똑같은 카테고리·차례를 쓴다. 파는 자리와 정하는 자리가
 * 다르게 보이면, 대표님이 정해 둔 순서가 정작 파는 순간에는 소용이 없다.
 */
const CAT_ORDER: string[] = CATS.map((c) => c.key);

const catOf = (pr: ProductMeta) => ticketCat(pr);

/**
 * 상품 고르기 + 결제
 *
 * 왼쪽에서 고르면 오른쪽에 담긴다. 데스크에서 회원 앞에 두고 쓰는
 * 화면이라, 무엇을 골랐고 얼마인지가 항상 같이 보여야 한다.
 */
function PurchaseFields({
  products, options, baseDate, tickets, b, setB,
}: {
  products: ProductMeta[];
  options: Record<string, string[]>;
  baseDate: string;
  /** 이 회원이 지금까지 끊은 이용권 — 신규인지 재등록인지 가리는 데 쓴다 */
  tickets: Ticket[];
  b: Buy;
  setB: (next: Buy) => void;
}) {
  const now = today();
  const pOf = (code: string) => products.find((x) => x.code === code);
  const { suggested } = buyPayload(b, products, tickets, now);
  const sale = salesType(b.lines, products, tickets, now);
  /** 깎기 전 정가 합계와 깎아준 총액 — 얼마를 빼줬는지 눈에 보여야 한다 */
  const listTotal = b.lines.reduce((s, l) => s + listPrice(l, pOf(l.상품코드)), 0);
  const discount = listTotal - suggested;
  /** 상품마다 적은 미수금을 더한 값 */
  const unpaidTotal = b.lines.reduce((s, l) => s + onlyNum(l.미수금), 0);
  const split = b.결제수단.includes("+");
  const splitTotal = onlyNum(b.카드액) + onlyNum(b.계좌액);
  const cashSide = b.결제수단 === "현금" || b.결제수단 === "계좌";

  const cats = useMemo(() => {
    const found = new Set(products.map(catOf));
    const known = CAT_ORDER.filter((c) => found.has(c));
    const rest = [...found].filter((c) => !CAT_ORDER.includes(c));
    return [...known, ...rest];
  }, [products]);

  const [cat, setCat] = useState(cats[0] ?? "회원권");
  const [q, setQ] = useState("");
  /** 지금 펼쳐서 고치고 있는 줄 */
  const [openLine, setOpenLine] = useState<number | null>(null);

  /*
    상품 관리에서 끌어 정해 둔 차례 그대로 보여준다.
    차례를 안 정한 것은 정한 것들 뒤로 — 0 을 그대로 쓰면 손대지 않은 상품이
    전부 맨 위로 올라온다.
  */
  const shown = products
    .filter((x) => (q ? x.name.toLowerCase().includes(q.toLowerCase()) : catOf(x) === cat))
    .slice()
    .sort(
      (a, b) =>
        ((a.order || 1e9) - (b.order || 1e9)) || a.name.localeCompare(b.name, "ko")
    )
    .slice(0, 60);

  function addLine(code: string) {
    const pr = pOf(code);
    if (!pr) return;
    /* 쓰고 있는 것이 있으면 그 뒤로 이어 붙인다 */
    const start = nextStart(pr, tickets, products, baseDate || today());
    const months = canPickMonths(pr) ? pr.months || 1 : pr.months;
    setB({
      ...b,
      lines: [
        ...b.lines,
        {
          상품코드: code,
          시작일: start,
          종료일: endOf(pr, start, months),
          총횟수: pr.count ? String(pr.count) : "",
          개월: months ? String(months) : "",
          가격구분: defaultKind(b.결제수단),
          할인: "",
          미수금: "",
        },
      ],
    });
  }

  const setLine = (i: number, key: keyof Line, v: string) =>
    setB({ ...b, lines: b.lines.map((l, k) => (k === i ? { ...l, [key]: v } : l)) });

  /** 개월을 바꾸면 종료일도 같이 옮긴다 */
  const setMonths = (i: number, v: string) =>
    setB({
      ...b,
      lines: b.lines.map((l, k) => {
        if (k !== i) return l;
        const n = Number(v) || 0;
        return { ...l, 개월: v, 종료일: n > 0 ? addMonths(l.시작일, n) : "" };
      }),
    });

  const priceOf = (pr: ProductMeta) => unitPrice(pr, cashSide);

  return (
    <>
      <h4 className="mini-title">상품</h4>
      <div className="buy-grid">
        {/* 왼쪽 — 고르는 곳 */}
        <div className="buy-pick">
          <div className="chips" style={{ marginBottom: 8 }}>
            {cats.map((c) => (
              <button key={c} type="button"
                      className={`chip${!q && cat === c ? " on" : ""}`}
                      onClick={() => { setCat(c); setQ(""); }}>
                {c}
              </button>
            ))}
          </div>
          <input className="search" style={{ width: "100%", marginBottom: 8 }}
                 placeholder="상품 이름으로 찾기"
                 value={q} onChange={(e) => setQ(e.target.value)} />

          <div className="prod-list">
            {shown.length === 0 ? (
              <p className="dim" style={{ fontSize: 12.5, padding: "10px 2px" }}>
                해당하는 상품이 없습니다.
              </p>
            ) : (
              shown.map((x) => {
                const free = !x.cash && !x.card;
                return (
                  <button key={x.code} type="button" className="prod" onClick={() => addLine(x.code)}>
                    <span className="nm">{x.name}</span>
                    <span className="meta">
                      {termOf(x)}
                      {termOf(x) && x.count > 0 && " · "}
                      {x.count > 0 && `${x.count}회`}
                    </span>
                    <span className="pr num">
                      {free ? (
                        <em className="one">무료</em>
                      ) : (
                        <>
                          {x.cash > 0 && <em><i>현금</i>{money(x.cash)}</em>}
                          {x.card > 0 && <em><i>카드</i>{money(x.card)}</em>}
                        </>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 오른쪽 — 담긴 것과 결제 */}
        <div className="buy-cart">
          <div className="cart-head">
            고른 상품 <b className="num">{b.lines.length}</b>
          </div>

          {b.lines.length === 0 ? (
            <p className="dim" style={{ fontSize: 12.5, padding: "14px 2px" }}>
              왼쪽에서 상품을 눌러 담아주세요.
            </p>
          ) : (
            <div className="cart-list">
              {/* 얹을 회원권이 하나도 없으면 서비스·옵션이 그 자체로 한 줄이 된다 */}
              {b.lines.map((l, i) => {
                const pr = pOf(l.상품코드);
                const extra = isExtraKind(pr);
                const 얹을데없음 = !b.lines.some((x) => !isExtraKind(pOf(x.상품코드)));
                const open = openLine === i;
                const free = !pr || (extra && !priceOf(pr));
                return (
                  <div className={`cart-item${open ? " open" : ""}`} key={`${l.상품코드}-${i}`}>
                    <button type="button" className="cart-top"
                            onClick={() => setOpenLine(open ? null : i)}>
                      <Icon name="chevron" size={13} strokeWidth={2} />
                      <b>{pr?.name ?? l.상품코드}</b>
                      <span className="num">
                        {free ? "무료" : `${extra ? "+" : ""}${money(linePrice(l, pr))}원`}
                      </span>
                    </button>

                    <div className="cart-sub">
                      <span>
                        {[
                          extra
                            ? l.개월 ? `${l.개월}개월치` : "기간 없음"
                            : l.시작일 && l.종료일
                              ? `${l.시작일} ~ ${l.종료일}`
                              : l.시작일 || "기간 없음",
                          !extra && usesCount(pr) && l.총횟수 ? `${l.총횟수}회` : "",
                          extra ? (얹을데없음 ? "따로 등록" : "회원권에 얹음") : l.가격구분 + "가",
                          onlyNum(l.할인) > 0 ? `할인 ${money(onlyNum(l.할인))}원` : "",
                          onlyNum(l.미수금) > 0 ? `미수 ${money(onlyNum(l.미수금))}원` : "",
                        ].filter(Boolean).join(" · ")}
                      </span>
                      <button type="button" className="x"
                              onClick={() => {
                                setOpenLine(null);
                                setB({ ...b, lines: b.lines.filter((_, k) => k !== i) });
                              }}
                              aria-label="빼기">×</button>
                    </div>

                    {open && (
                      <div className="cart-edit">
                        <KindPick value={l.가격구분} pr={pr}
                                  onChange={(v) => setLine(i, "가격구분", v)} />
                        {canPickMonths(pr) && (
                          <label>
                            <span>기간</span>
                            <MonthPick value={l.개월} onChange={(v) => setMonths(i, v)} />
                          </label>
                        )}
                        {!extra && (
                          <>
                            <label>
                              <span>시작일</span>
                              <input className="input" type="date" value={l.시작일}
                                     onChange={(e) => {
                                       const v = e.target.value;
                                       setB({
                                         ...b,
                                         lines: b.lines.map((x, k) => {
                                           if (k !== i) return x;
                                           const n = Number(x.개월) || pr?.months || 0;
                                           const end = endOf(pr, v, n);
                                           return { ...x, 시작일: v, 종료일: end || x.종료일 };
                                         }),
                                       });
                                     }} />
                            </label>
                            <label>
                              <span>종료일</span>
                              <input className="input" type="date" value={l.종료일}
                                     onChange={(e) => setLine(i, "종료일", e.target.value)} />
                            </label>
                          </>
                        )}
                        {!extra && usesCount(pr) && (
                          <label>
                            <span>횟수</span>
                            {/* 상품에 정해진 횟수다. 여기서 바꾸면 상품과 어긋난다 */}
                            <input className="input" value={`${l.총횟수}회`} readOnly />
                          </label>
                        )}
                        {/* 어떤 상품이든 깎아줄 수 있어야 한다 */}
                        <label>
                          <span>할인</span>
                          <input className="input" inputMode="numeric" placeholder="0"
                                 value={l.할인}
                                 onChange={(e) => setLine(i, "할인", e.target.value)} />
                        </label>
                        <label>
                          <span>미수금</span>
                          <input className="input" inputMode="numeric" placeholder="0"
                                 value={l.미수금}
                                 onChange={(e) => setLine(i, "미수금", e.target.value)} />
                        </label>
                        {onlyNum(l.할인) > 0 && listPrice(l, pr) > 0 && (
                          <p className="cart-note">
                            {money(listPrice(l, pr))} − {money(onlyNum(l.할인))} =
                            <b> {money(linePrice(l, pr))}원</b>
                          </p>
                        )}

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="cart-sum">
            <div className="row">
              <span>정가 합계</span>
              <b className="num">{money(listTotal)}원</b>
            </div>
            {discount > 0 && (
              <div className="row">
                <span>할인</span>
                <b className="num warn-text">-{money(discount)}원</b>
              </div>
            )}

            <label className="row f">
              <span>결제 수단</span>
              <select className="input" value={b.결제수단}
                      onChange={(e) => {
                        // 수단을 바꾸면 각 줄의 가격 종류도 같이 맞춘다.
                        // 줄마다 다르게 하고 싶으면 그 뒤에 개별로 바꾸면 된다
                        const kind = defaultKind(e.target.value);
                        setB({
                          ...b,
                          결제수단: e.target.value,
                          lines: b.lines.map((l) => ({ ...l, 가격구분: kind })),
                        });
                      }}>
                {(options["결제유형"] ?? PAY_METHODS).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>

            {split ? (
              <>
                <label className="row f">
                  <span>카드</span>
                  <input className="input" inputMode="numeric" value={b.카드액}
                         onChange={(e) => setB({ ...b, 카드액: e.target.value })} />
                </label>
                <label className="row f">
                  <span>계좌</span>
                  <input className="input" inputMode="numeric" value={b.계좌액}
                         onChange={(e) => setB({ ...b, 계좌액: e.target.value })} />
                </label>
              </>
            ) : (
              <label className="row f">
                <span>결제 금액</span>
                <input className="input" inputMode="numeric"
                       value={b.직접입력 ? b.금액 : suggested ? String(suggested) : ""}
                       onChange={(e) => setB({ ...b, 직접입력: true, 금액: e.target.value })} />
              </label>
            )}

            {b.lines.length > 0 && (
              <div className="row">
                <span>매출 유형</span>
                <b>{sale}</b>
              </div>
            )}

            {unpaidTotal > 0 && (
              <div className="row">
                <span>미수금</span>
                <b className="num warn-text">{money(unpaidTotal)}원</b>
              </div>
            )}
            {unpaidTotal > 0 && (
              <label className="row f">
                <span>받기로 한 날</span>
                <input className="input" type="date" value={b.미수금결제예정일}
                       onChange={(e) => setB({ ...b, 미수금결제예정일: e.target.value })} />
              </label>
            )}

            <div className="row total">
              <span>받을 금액</span>
              <b className="num">
                {money(split ? splitTotal : b.직접입력 ? onlyNum(b.금액) : suggested)}원
              </b>
            </div>

            {unpaidTotal > 0 && (
              <div className="row total">
                <span>오늘 받는 금액</span>
                <b className="num">
                  {money(
                    Math.max(0, (split ? splitTotal : b.직접입력 ? onlyNum(b.금액) : suggested) - unpaidTotal)
                  )}원
                </b>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

/* ── 이미 있는 회원에게 상품 더하기 ────────── */
function AddPurchase({
  member, tickets, products, productBranches, options, onClose,
}: {
  member: Member;
  tickets: Ticket[];
  products: ProductMeta[];
  productBranches: Record<string, string[]>;
  options: Record<string, string[]>;
  onClose: () => void;
}) {
  /*
    이 회원 지점에서 파는 것만 보여준다

    지점마다 파는 상품이 다르다. 다른 지점 상품까지 보이면 없는 것을 팔게 된다.
    아직 아무 상품에도 지점을 안 걸어 뒀다면 거르지 않는다 —
    걸어 두지 않았을 뿐인데 목록이 통째로 비면 아무것도 못 판다.
  */
  const sellable = useMemo(() => {
    const any = Object.keys(productBranches).length > 0;
    if (!any || !member.지점코드) return products;
    return products.filter((x) => (productBranches[x.code] ?? []).includes(member.지점코드));
  }, [products, productBranches, member.지점코드]);

  const hidden = products.length - sellable.length;

  const [b, setB] = useState<Buy>(emptyBuy());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const payload = buyPayload(b, sellable, tickets, today(), options["매출유형"]);
    if (payload.이용권.length === 0 && payload.부가서비스.length === 0) {
      return setMsg("더할 상품을 하나 이상 골라주세요.");
    }
    setBusy(true);
    const res = await fetch("/api/members/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 회원번호: member.id, ...payload }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    reloadTo(member.id);
  }

  return (
    <div className="modal-back top" onClick={onClose}>
      <div className="modal xl" onClick={(e) => e.stopPropagation()}>
        <h3>{member.이름}님 상품 추가</h3>
        {hidden > 0 && (
          <p className="modal-lead">
            이 회원 지점에서 파는 상품만 보입니다 — 다른 지점 것 {hidden}개는 가렸습니다
          </p>
        )}

        <PurchaseFields products={sellable} options={options} tickets={tickets}
                        baseDate={today()} b={b} setB={setB} />

        {msg && <div className="alert-bad">{msg}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={save} disabled={busy}>
            {busy ? "저장 중…" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewForm({
  products, productBranches, waiting, options, branches, trainers, defaultBranch, onClose,
}: {
  products: ProductMeta[];
  productBranches: Record<string, string[]>;
  waiting: Waiting[];
  options: Record<string, string[]>;
  branches: Named[];
  trainers: { id: string; name: string }[];
  defaultBranch: string;
  onClose: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>({
    가입일: today(),
    지점코드: defaultBranch,
  });
  const [b, setB] = useState<Buy>(emptyBuy());
  const [fromId, setFromId] = useState("");
  /* 고른 지점에서 파는 것만 — 상품 추가 창과 같은 규칙 */
  const sellable = useMemo(() => {
    const any = Object.keys(productBranches).length > 0;
    const br = f["지점코드"];
    if (!any || !br) return products;
    return products.filter((x) => (productBranches[x.code] ?? []).includes(br));
  }, [products, productBranches, f]);
  const hidden = products.length - sellable.length;
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  function pickFrom(id: string) {
    setFromId(id);
    const w = waiting.find((x) => x.id === id);
    if (!w) return;
    setF((o) => ({ ...o, 이름: w.이름, 전화번호: w.전화번호, 지점코드: w.지점코드 || o.지점코드 }));
  }

  async function save() {
    if (!f["이름"]?.trim()) return setMsg("이름을 입력해주세요.");
    if (!f["전화번호"]?.trim()) return setMsg("연락처를 입력해주세요.");

    const payload = buyPayload(b, sellable, [], today(), options["매출유형"]);
    if (payload.이용권.length === 0) {
      return setMsg("회원권이나 PT를 하나 이상 골라주세요.");
    }

    setBusy(true);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, 상담번호: fromId, ...payload }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    location.reload();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal xl" onClick={(e) => e.stopPropagation()}>
        <h3>회원 등록</h3>

        {waiting.length > 0 && (
          <>
            <h4 className="mini-title">상담에서 가져오기</h4>
            <select className="input" value={fromId} onChange={(e) => pickFrom(e.target.value)}>
              <option value="">직접 입력 (상담 기록 없이 등록)</option>
              {waiting.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.이름} · {showPhone(w.전화번호)}
                </option>
              ))}
            </select>
          </>
        )}

        <h4 className="mini-title">회원 정보</h4>
        <div className="form-grid">
          <L label="이름" req>
            <input className="input" value={f["이름"] ?? ""} onChange={(e) => set("이름", e.target.value)} />
          </L>
          <L label="연락처" req>
            <input className="input" inputMode="tel" placeholder="010-0000-0000"
                   value={f["전화번호"] ?? ""} onChange={(e) => set("전화번호", e.target.value)} />
          </L>
          <Sel label="성별" k="성별" f={f} set={set} opts={options["성별"]} />
          <Sel label="나이대" k="나이대" f={f} set={set} opts={options["나이대"]} />
          <Sel label="거주 동네" k="거주동네" f={f} set={set} opts={options["거주동네"]} />
          <Free label="직업" k="직업" f={f} set={set} opts={options["직업"]}
                placeholder="예) 간호사 · 3교대 근무" />
          <L label="등록 지점">
            <select className="input" value={f["지점코드"] ?? ""} onChange={(e) => set("지점코드", e.target.value)}>
              {branches.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
          </L>
          <L label="담당 트레이너">
            <select className="input" value={f["담당직원사번"] ?? ""} onChange={(e) => set("담당직원사번", e.target.value)}>
              <option value="">지정 안 함</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </L>
          <L label="가입일">
            <input className="input" type="date" value={f["가입일"] ?? ""}
                   onChange={(e) => set("가입일", e.target.value)} />
          </L>
        </div>

        {hidden > 0 && (
          <p className="stat-note">
            {branches.find((x) => x.code === f["지점코드"])?.name ?? "이 지점"}에서 파는 상품만
            보입니다 — 다른 지점 것 {hidden}개는 가렸습니다
          </p>
        )}
        <PurchaseFields products={sellable} options={options} tickets={[]}
                        baseDate={f["가입일"] ?? today()} b={b} setB={setB} />

        <div className="form-grid" style={{ marginTop: 10 }}>
          <L label="메모" full>
            <textarea className="input area" rows={2} value={f["메모"] ?? ""}
                      onChange={(e) => set("메모", e.target.value)} />
          </L>
        </div>

        {msg && <div className="alert-bad">{msg}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={save} disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 상세 ─────────────────────────────────── */
const TABS = ["요약", "이용권", "결제", "기록"] as const;

/**
 * 이용권 한 줄 + 얼마나 지났는지 막대
 *
 * 남은 날짜만 숫자로 보면 "많이 남았나" 감이 안 온다.
 * 6개월짜리의 60일과 1개월짜리의 20일은 뜻이 다르기 때문이다.
 */
function ProgressLine({ t, pr, now, onEdit }: {
  t: Ticket; pr?: ProductMeta; now: string; onEdit?: () => void;
}) {
  const left = t.종료일 ? daysLeft(t.종료일, now) : null;
  const total = t.시작일 && t.종료일 ? daysLeft(t.종료일, t.시작일) : 0;
  const used = total > 0 && left !== null ? Math.min(100, Math.max(0, ((total - left) / total) * 100)) : 0;

  return (
    <div className={`line-item${onEdit ? " clickable" : ""}`} onClick={onEdit}>
      <div className="line-head">
        <b>{pr?.name ?? t.상품코드}</b>
        <span className="dim">
          {t.시작일?.slice(2)}
          {t.종료일 && ` ~ ${t.종료일.slice(2)}`}
          {hasCount(t) && ` · ${t.잔여횟수 || t.총횟수}/${t.총횟수}회`}
        </span>
        <span className={`pill ${left === null ? "" : left <= SOON ? "warn" : "good"}`}>
          {left === null ? "기간 없음" : `${left}일 남음`}
        </span>
      </div>
      {total > 0 && (
        <div className="track" style={{ marginTop: 9 }}>
          <i style={{ width: `${used}%` }} />
        </div>
      )}
    </div>
  );
}

function Detail({
  item, tickets, payments, extras, products, productBranches, productOf, options, trainers, staffNames,
  branchName, can, members, transfers, onClose,
}: {
  item: Member;
  tickets: Ticket[];
  payments: Payment[];
  extras: Extra[];
  products: ProductMeta[];
  productBranches: Record<string, string[]>;
  productOf: (code: string) => ProductMeta | undefined;
  options: Record<string, string[]>;
  trainers: { id: string; name: string }[];
  staffNames: Record<string, string>;
  branchName: string;
  can: { create: boolean; update: boolean; remove: boolean };
  /** 양도할 때 받을 사람을 고르려면 명단이 있어야 한다 */
  members: Member[];
  transfers: TransferRow[];
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Record<string, string>>({ ...(item as any) });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [view, setView] = useState<(typeof TABS)[number]>("요약");
  const [editTicket, setEditTicket] = useState<Ticket | null>(null);
  const [editPay, setEditPay] = useState<Payment | null>(null);
  const [adding, setAdding] = useState(false);
  const setV = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const now = today();

  // 환불한 건은 실제로 받은 돈이 아니므로 합계에서 뺀다
  const paid = payments;
  const totalPaid = paid.reduce((s, x) => {
    if (x.환불여부?.toUpperCase() === "Y") return s;
    return s + (Number(x.결제금액) || 0);
  }, 0);
  const unpaid = paid.reduce((s, x) => s + (Number(x.미수금액) || 0), 0);

  /** 회원권 · PT · 수업만 놓고 지금 쓸 수 있는 것과 끝난 것을 센다 */
  const live = useMemo(() => {
    const main = tickets.filter((t) => groupOf(productOf(t.상품코드)) === "이용권");
    const rows = main.filter((t) => isAlive(t, now));
    const state =
      rows.length === 0
        ? main.length === 0
          ? "이용권 없음"
          : "만료"
        : rows.some((t) => t.종료일 && daysLeft(t.종료일, now) <= SOON)
          ? "만료임박"
          : "이용중";
    const extraRows = tickets.filter((t) => {
      const g = groupOf(productOf(t.상품코드));
      return g === "부가" || g === "옵션";
    });
    const serviceRows = tickets.filter((t) => groupOf(productOf(t.상품코드)) === "서비스");
    return {
      rows: rows.slice().sort((a, b) => (a.종료일 ?? "").localeCompare(b.종료일 ?? "")),
      count: rows.length,
      past: main.length - rows.length,
      extraRows,
      serviceRows,
      extra: extraRows.length,
      service: serviceRows.length,
      state,
    };
  }, [tickets, now]);

  const ticketOf = (id: string) => tickets.find((t) => t.id === id);

  /** 회원권을 두 번 이상 끊었으면 재등록 회원으로 본다 (사물함은 세지 않는다) */
  const isReturning =
    tickets.filter((t) => groupOf(productOf(t.상품코드)) === "이용권").length > 1;

  async function save() {
    if (!f["이름"]?.trim()) return setMsg("이름을 입력해주세요.");
    setBusy(true);
    const res = await fetch("/api/members/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        changes: {
          이름: f["이름"], 전화번호: f["전화번호"], 성별: f["성별"], 나이대: f["나이대"],
          거주동네: f["거주동네"], 직업: f["직업"], 담당직원사번: f["담당직원사번"],
          회원상태: f["회원상태"], 가입일: f["가입일"], 메모: f["메모"],
        },
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    reloadTo(item.id);
  }

  async function remove() {
    setBusy(true);
    const res = await fetch("/api/members/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "지우지 못했습니다.");
    /* 지운 회원 자리로 돌아가면 빈 창이 뜬다. 목록으로 나온다 */
    location.hash = "";
    location.reload();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal ${editing ? "wide" : "xl"}`} onClick={(e) => e.stopPropagation()}>
        {/* 아래 단추 줄을 없앴으니 닫는 길이 눈에 보여야 한다 */}
        {!editing && (
          <button className="modal-x" onClick={onClose} aria-label="닫기">×</button>
        )}

        {editing ? (
          <>
            <h3>{item.이름} 정보 수정</h3>
            <div className="form-grid">
              <L label="이름" req>
                <input className="input" value={f["이름"] ?? ""} onChange={(e) => setV("이름", e.target.value)} />
              </L>
              <L label="연락처">
                <input className="input" inputMode="tel" value={f["전화번호"] ?? ""}
                       onChange={(e) => setV("전화번호", e.target.value)} />
              </L>
              <Sel label="성별" k="성별" f={f} set={setV} opts={options["성별"]} />
              <Sel label="나이대" k="나이대" f={f} set={setV} opts={options["나이대"]} />
              <Sel label="거주 동네" k="거주동네" f={f} set={setV} opts={options["거주동네"]} />
              <Free label="직업" k="직업" f={f} set={setV} opts={options["직업"]}
                    placeholder="예) 간호사 · 3교대 근무" />
              <L label="담당 트레이너">
                <select className="input" value={f["담당직원사번"] ?? ""}
                        onChange={(e) => setV("담당직원사번", e.target.value)}>
                  <option value="">지정 안 함</option>
                  {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </L>
              <L label="가입일">
                <input className="input" type="date" value={(f["가입일"] ?? "").slice(0, 10)}
                       onChange={(e) => setV("가입일", e.target.value)} />
              </L>
              <L label="회원 상태">
                <select className="input" value={f["회원상태"] ?? "유효"}
                        onChange={(e) => setV("회원상태", e.target.value)}>
                  {["유효", "만료", "정지", "탈퇴"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </L>
              <L label="메모" full>
                <textarea className="input area" rows={2} value={f["메모"] ?? ""}
                          onChange={(e) => setV("메모", e.target.value)} />
              </L>
            </div>

            {msg && <div className="alert-bad">{msg}</div>}

            {confirmDel && (
              <div className="confirm-box">
                <b>{item.이름}님을 목록에서 지울까요?</b>
                <p>
                  결제 · 이용권 기록은 그대로 남습니다. 시트에서도 줄을 지우지 않고
                  삭제 표시만 하므로 되살릴 수 있습니다.
                </p>
                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button className="btn-ghost" onClick={() => setConfirmDel(false)}>그만두기</button>
                  <button className="btn-danger" onClick={remove} disabled={busy}>
                    {busy ? "처리 중…" : "지우기"}
                  </button>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {can.remove && !confirmDel && (
                <button className="btn-ghost danger" style={{ marginRight: "auto" }}
                        onClick={() => setConfirmDel(true)}>회원 지우기</button>
              )}
              <button className="btn-ghost" onClick={() => {
                setEditing(false); setConfirmDel(false); setF({ ...(item as any) }); setMsg("");
              }}>
                취소
              </button>
              <button className="btn-primary" style={{ marginTop: 0 }} onClick={save} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="m-detail">
              {/* 왼쪽 — 사람 정보. 어느 탭을 보든 계속 보인다 */}
              <aside className="m-profile">
                <div className="m-avatar">{item.이름.slice(0, 1)}</div>
                <b className="m-name">{item.이름}</b>
                <span className="dim num">{item.id}</span>

                <div className="m-chips">
                  <span className={`pill ${TONE[live.state] ?? ""}`}>{live.state}</span>
                  <span className="pill">{isReturning ? "재등록" : "신규"}</span>
                  {unpaid > 0 && <span className="pill warn">미수금</span>}
                </div>

                {/*
                  제일 자주 누르는 두 개를 이름 바로 아래에 둔다. 위쪽 탭 줄에만
                  있으면 상담 중에 눈이 한 번 더 올라갔다 내려와야 한다.
                */}
                {can.update && (
                  <div className="who-acts">
                    <button className="btn-dark" onClick={() => setAdding(true)}>
                      상품 추가
                    </button>
                    <button className="btn-ghost" onClick={() => setEditing(true)}>고치기</button>
                  </div>
                )}

                <dl className="kv tight">
                  <Kv k="연락처" v={showPhone(item.전화번호)} />
                  <Kv k="성별 · 나이" v={[item.성별, item.나이대].filter(Boolean).join(" · ")} />
                  <Kv k="직업" v={item.직업} />
                  <Kv k="거주 동네" v={item.거주동네} />
                  <Kv k="등록 지점" v={branchName} />
                  <Kv k="담당 트레이너" v={staffNames[item.담당직원사번]} />
                  <Kv k="가입일" v={korDate(item.가입일)} />
                  <Kv k="회원 상태" v={item.회원상태 || "유효"} />
                </dl>
              </aside>

              {/* 오른쪽 — 탭으로 나눠 담는다 */}
              <div className="m-body">
                <div className="tabs">
                  {TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`tab${view === t ? " on" : ""}`}
                      aria-pressed={view === t}
                      onClick={() => setView(t)}
                    >
                      {t}
                      {t === "이용권" && tickets.length + extras.length > 0 && (
                        <span className="cnt num">{tickets.length + extras.length}</span>
                      )}
                      {t === "결제" && paid.length > 0 && <span className="cnt num">{paid.length}</span>}
                    </button>
                  ))}
                </div>

                {view === "요약" && (
                  <Board
                    item={item}
                    live={live}
                    tickets={tickets}
                    payments={paid}
                    totalPaid={totalPaid}
                    unpaid={unpaid}
                    extras={extras}
                    transfers={transfers}
                    productOf={productOf}
                    now={now}
                    can={can}
                    onGo={setView}
                    onTicket={setEditTicket}
                    onMemo={() => setEditing(true)}
                  />
                )}

                {view === "이용권" && (
                  <TicketGroups tickets={tickets} extras={extras} productOf={productOf} now={now}
                                onEdit={can.update ? setEditTicket : undefined} />
                )}

                {view === "결제" && (
                  <PayTab paid={paid} totalPaid={totalPaid} unpaid={unpaid}
                          tickets={tickets} extras={extras} products={products}
                          onEditItem={can.update
                            ? (id) => { const t = ticketOf(id); if (t) setEditTicket(t); }
                            : undefined} />
                )}

                {view === "기록" && (
                  <>
                    <dl className="kv tight">
                      <Kv k="상담 기록" v={item.상담번호 ? `${item.상담번호} 에서 전환` : ""} />
                      <Kv k="처음 등록" v={[item.등록일시, staffNames[item.등록자]].filter(Boolean).join(" · ")} />
                      <Kv k="마지막 수정" v={[item.수정일시, staffNames[item.수정자]].filter(Boolean).join(" · ")} />
                    </dl>
                    <h4 className="mini-title">특이사항 · 메모</h4>
                    {item.메모 ? (
                      <div className="quote">{item.메모}</div>
                    ) : (
                      <p className="dim" style={{ fontSize: 13 }}>없습니다.</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {editTicket && (
              <TicketEdit
                t={editTicket}
                pr={productOf(editTicket.상품코드)}
                trainers={trainers}
                members={members}
                canRemove={can.remove}
                onClose={() => setEditTicket(null)}
              />
            )}
            {editPay && (
              <PaymentEdit x={editPay} options={options} onClose={() => setEditPay(null)} />
            )}
            {adding && (
              <AddPurchase member={item} tickets={tickets} products={products}
                           productBranches={productBranches} options={options}
                           onClose={() => setAdding(false)} />
            )}

            {msg && <div className="alert-bad">{msg}</div>}

          </>
        )}
      </div>
    </div>
  );
}

/* ── 이용권 묶어 보여주기 ──────────────────── */

/**
 * 이용권을 세 덩어리로 나눈다
 *
 * 이용 중 / 지난 것 / 받은 서비스.
 * 서비스는 돈을 안 낸 항목이라 이용권과 같이 세면 개수가 부풀려진다.
 */
/**
 * 받아간 서비스·옵션을 한 곳에 모아 보여준다
 *
 * 두 군데에서 온다. 회원권을 팔 때 얹어준 것은 이용권서비스 탭에,
 * 따로 등록한 서비스 상품은 이용권 탭에 들어 있다.
 */

/**
 * 회원 대시보드
 *
 * 한 줄로 흐르는 요약은 눈이 한 번에 못 잡는다. "이용권은 여기, 결제는 여기"가
 * 자리로 기억되도록 덩어리로 자른다. 카드마다 지금 중요한 것 몇 줄만 보이고,
 * 더 봐야 하면 그 탭으로 넘어간다 — 요약이 목록을 대신하려 들면 둘 다 못 한다.
 */
function Board({
  item, live, tickets, extras, payments, totalPaid, unpaid,
  transfers, productOf, now, can,
  onGo, onTicket, onMemo,
}: {
  item: Member;
  live: { count: number; rows: Ticket[]; extraRows: Ticket[]; serviceRows: Ticket[] };
  tickets: Ticket[];
  payments: Payment[];
  totalPaid: number;
  unpaid: number;
  extras: Extra[];
  transfers: TransferRow[];
  productOf: (code: string) => ProductMeta | undefined;
  now: string;
  can: { create: boolean; update: boolean; remove: boolean };
  onGo: (v: any) => void;
  onTicket: (t: Ticket) => void;
  onMemo: () => void;
}) {
  const main = tickets.filter((t) => groupOf(productOf(t.상품코드)) === "이용권");
  const 만료 = main.filter((t) => !isAlive(t, now)).length;

  const 정지중 = tickets.filter((t) => (t.정지시작일 ?? "").trim());
  const 정지누적 = tickets.reduce((n, t) => n + (Number(t.정지일수) || 0), 0);

  const 최근결제 = payments
    .slice()
    .sort((a, b) => (b.결제일시 ?? "").localeCompare(a.결제일시 ?? ""))
    .slice(0, 3);

  const head = (title: string, sub: string, go?: string) => (
    <div className="mcard-head">
      <b>{title}</b>
      {sub && <span className="sub">{sub}</span>}
      {go && <button className="more" onClick={() => onGo(go)}>더보기 ›</button>}
    </div>
  );

  return (
    <div className="mstack">
      {/*
        이용권 — 이 화면에서 가장 먼저 봐야 하는 것

        회원권 · 부가 상품 · 받은 서비스를 한 카드 안에 카테고리로 나눠 다 보여준다.
        "사물함은 언제까지지"를 보려고 탭을 옮겨 다니게 할 이유가 없다.
      */}
      <div className="mcard">
        {head("이용권", `유효 ${live.rows.length} · 만료 ${만료}`, "이용권")}

        {(() => {
          /*
            무료로 받은 것도 제 카테고리에 넣는다

            「완초자 PT 20회 서비스」는 돈을 안 냈을 뿐 수강권이다. 따로 빼두면
            수강권이 몇 개인지 볼 때마다 두 군데를 더해야 한다.
            공짜라는 사실은 줄에 붙는 「무료」 딱지로 말한다.

            얹어준 것(extras)은 제 기간이 없어 붙은 회원권의 기간을 빌려 쓴다.
          */
          type Line = { key: string; cat: string; el: any };
          const lines: Line[] = [];

          [...live.rows, ...live.extraRows].forEach((t) => {
            lines.push({
              key: t.id,
              cat: ticketCat(productOf(t.상품코드)),
              el: <TicketBar key={t.id} t={t} pr={productOf(t.상품코드)} now={now}
                             onClick={can.update ? () => onTicket(t) : undefined} />,
            });
          });

          live.serviceRows.forEach((t) => {
            lines.push({
              key: t.id,
              cat: ticketCat(productOf(t.상품코드)),
              el: <TicketBar key={t.id} t={t} pr={productOf(t.상품코드)} now={now} free
                             onClick={can.update ? () => onTicket(t) : undefined} />,
            });
          });

          extras.forEach((x) => {
            const host = tickets.find((t) => t.id === x.이용권번호);
            const 값 = Number(x.추가금액) > 0 ? `${money(Number(x.추가금액))}원` : "무료";
            const pr = productOf(x.상품코드);
            lines.push({
              key: x.id,
              cat: ticketCat(pr),
              el: host ? (
                <TicketBar key={x.id} t={{ ...host, 상품코드: x.상품코드 }} pr={pr} now={now}
                           free={Number(x.추가금액) <= 0} note={`회원권에 얹음 · ${값}`}
                           onClick={can.update ? () => onTicket(host) : undefined} />
              ) : (
                <div className="mrow" key={x.id}>
                  <div className="t">
                    <b>{pr?.name ?? x.상품코드}</b>
                    <span className="dim">{값}</span>
                  </div>
                </div>
              ),
            });
          });

          if (lines.length === 0) {
            return (
              <p className="empty">
                지금 쓸 수 있는 회원권 · 수강권이 없습니다. <b>재등록 대상</b>입니다.
              </p>
            );
          }

          return CATS.map((c) => {
            const mine = lines.filter((l) => l.cat === c.key);
            if (mine.length === 0) return null;
            return (
              <div className="cbox" key={c.key}>
                <p className="csec">{c.key} <span>{mine.length}</span></p>
                {mine.map((l) => l.el)}
              </div>
            );
          });
        })()}
      </div>

      <div className="mcols">
        <div className="mcol">
      {/* 결제 */}
      <div className="mcard">
        {head("결제", unpaid > 0 ? `미수 ${money(unpaid)}원` : `${payments.length}건`, "결제")}
        {payments.length === 0 ? (
          <p className="empty">결제 기록이 없습니다.</p>
        ) : (
          <>
            {최근결제.map((x) => (
              <div className="mrow" key={x.id}>
                <div className="t">
                  <b className="num">{money(Number(x.결제금액) || 0)}원</b>
                  <span className="dim">{(x.결제일시 ?? "").slice(0, 10)}</span>
                </div>
                <span className="sub">
                  {x.결제수단 || "-"}
                  {Number(x.미수금액) > 0 && ` · 미수 ${money(Number(x.미수금액))}원`}
                  {x.환불여부?.toUpperCase() === "Y" && " · 환불"}
                </span>
              </div>
            ))}
            <p className="stat-note" style={{ marginBottom: 0 }}>
              지금까지 <b className="num">{money(totalPaid)}원</b>
            </p>
          </>
        )}
      </div>

        </div>

        <div className="mcol">
      {/* 정지 · 양도 */}
      <div className="mcard">
        {head("정지 · 양도", "", "이용권")}
        {정지중.length === 0 && transfers.length === 0 && 정지누적 === 0 ? (
          <p className="empty">정지하거나 넘긴 이력이 없습니다.</p>
        ) : (
          <>
            {정지중.map((t) => (
              <div className="mrow" key={t.id}>
                <div className="t">
                  <b>{productOf(t.상품코드)?.name ?? t.상품코드}</b>
                  <span className="dim">정지 중</span>
                </div>
                <span className="sub">
                  {t.정지시작일}부터
                  {t.정지종료예정일 ? ` ${t.정지종료예정일}까지` : " 재개할 때까지"}
                </span>
              </div>
            ))}
            {transfers.map((x) => (
              <div className="mrow" key={x.id}>
                <div className="t">
                  <b>{x.받은회원번호 === item.id ? "받음" : "넘김"}</b>
                  <span className="dim">{x.양도일}</span>
                </div>
                <span className="sub">
                  {x.받은회원번호 === item.id ? `${x.준회원번호} 에게서` : `${x.받은회원번호} 에게`}
                  {Number(x.수수료) > 0 && ` · 수수료 ${money(Number(x.수수료))}원`}
                </span>
              </div>
            ))}
            {정지누적 > 0 && (
              <p className="stat-note" style={{ marginBottom: 0 }}>
                지금까지 정지 <b>{정지누적}일</b>
              </p>
            )}
          </>
        )}
      </div>

      {/* 특이사항 — 정지·양도 바로 아래에 붙여 빈 자리를 없앤다 */}
      <div className="mcard">
        {head("특이사항 · 메모", "", "")}
        {item.메모 ? (
          <div className="quote" style={{ margin: 0 }}>{item.메모}</div>
        ) : (
          <p className="empty">
            적어 둔 특이사항이 없습니다.
            {can.update && (
              <> <button className="linkish" onClick={onMemo}>메모 적기</button></>
            )}
          </p>
        )}
      </div>
        </div>
      </div>
    </div>
  );
}

/** 남은 기간을 막대로 — 「197일 남음」만 있으면 많은 건지 적은 건지 감이 안 온다 */
function TicketBar({ t, pr, now, free, note, onClick }: {
  t: Ticket; pr?: ProductMeta; now: string;
  free?: boolean; note?: string; onClick?: () => void;
}) {
  const left = t.종료일 ? daysLeft(t.종료일, now) : null;
  const total = t.시작일 && t.종료일 ? Math.max(1, daysBetween(t.시작일, t.종료일)) : 0;
  const pct = left === null || total === 0 ? 100 : Math.max(0, Math.min(100, (left / total) * 100));
  const tone = left === null ? "" : left < 0 ? "bad" : left <= SOON ? "warn" : "";
  const 정지 = Boolean((t.정지시작일 ?? "").trim());
  const cnt = Number(t.총횟수) > 0;

  return (
    <div className="mrow" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <div className="t">
        <b>{pr?.name ?? t.상품코드}</b>
        {free && <span className="pill">무료</span>}
        <span className="dim">
          {정지 ? "정지 중" : left === null ? "기간 없음" : left < 0 ? `${-left}일 지남` : `${left}일 남음`}
        </span>
      </div>
      <span className="sub">
        {t.시작일?.slice(2)}{t.종료일 && ` ~ ${t.종료일.slice(2)}`}
        {cnt && ` · ${t.잔여횟수 || t.총횟수}/${t.총횟수}회`}
        {note && ` · ${note}`}
      </span>
      <div className={`tbar ${정지 ? "warn" : tone}`}>
        <i style={{ width: `${정지 ? 100 : pct}%` }} />
      </div>
    </div>
  );
}

function TicketGroups({
  tickets, extras, productOf, now, onEdit,
}: {
  tickets: Ticket[];
  extras: Extra[];
  productOf: (code: string) => ProductMeta | undefined;
  now: string;
  onEdit?: (t: Ticket) => void;
}) {
  const grp = (t: Ticket) => groupOf(productOf(t.상품코드));
  const ticketOf = (id: string) => tickets.find((t) => t.id === id);
  const byEnd = (a: Ticket, b: Ticket) => (b.종료일 ?? "").localeCompare(a.종료일 ?? "");

  const main = tickets.filter((t) => grp(t) === "이용권");
  const live = main.filter((t) => isAlive(t, now));
  const past = main.filter((t) => !isAlive(t, now));
  const extra = tickets.filter((t) => grp(t) === "부가");
  const opts = tickets.filter((t) => grp(t) === "옵션");
  const services = tickets.filter((t) => grp(t) === "서비스");

  /*
    활성과 만료를 나눠 본다

    한 회원이 몇 해를 다니면 끝난 회원권이 열 줄씩 쌓인다. 한 목록에 두면
    지금 쓸 수 있는 것을 찾느라 매번 눈으로 훑어야 한다. 부가 상품과 옵션도
    같이 나눈다 — 작년 사물함이 「부가 상품」에 그대로 남아 있으면 안 된다.

    줄 모양은 요약 화면과 같은 것을 쓴다. 같은 것을 두 군데서 다르게 그리면
    같은 것인 줄 모른다.
  */
  const [side, setSide] = useState<"live" | "past">("live");
  const liveExtra = extra.filter((t) => isAlive(t, now));
  const pastExtra = extra.filter((t) => !isAlive(t, now));
  const liveOpts = opts.filter((t) => isAlive(t, now));
  const pastOpts = opts.filter((t) => !isAlive(t, now));
  const liveSvc = services.filter((t) => isAlive(t, now));
  const pastSvc = services.filter((t) => !isAlive(t, now));

  const liveN = live.length + liveExtra.length + liveOpts.length + liveSvc.length + extras.length;
  const pastN = past.length + pastExtra.length + pastOpts.length + pastSvc.length;

  if (tickets.length === 0) {
    return (
      <>
        <h4 className="mini-title">이용권</h4>
        <p className="dim" style={{ fontSize: 13, margin: "0 0 12px" }}>등록된 이용권이 없습니다.</p>
      </>
    );
  }

  /** 무료로 받은 것도 제 카테고리에 넣는다. 공짜라는 사실은 「무료」 딱지로 말한다 */
  const board = (paid: Ticket[], svc: Ticket[], withExtras: boolean) => {
    type Line = { cat: string; el: any };
    const lines: Line[] = [];

    paid.slice().sort(byEnd).forEach((t) =>
      lines.push({
        cat: ticketCat(productOf(t.상품코드)),
        el: <TicketBar key={t.id} t={t} pr={productOf(t.상품코드)} now={now}
                       onClick={onEdit && (() => onEdit(t))} />,
      })
    );
    svc.slice().sort(byEnd).forEach((t) =>
      lines.push({
        cat: ticketCat(productOf(t.상품코드)),
        el: <TicketBar key={t.id} t={t} pr={productOf(t.상품코드)} now={now} free
                       onClick={onEdit && (() => onEdit(t))} />,
      })
    );
    if (withExtras) {
      extras.forEach((x) => {
        const host = ticketOf(x.이용권번호);
        const 값 = Number(x.추가금액) > 0 ? `${money(Number(x.추가금액))}원` : "무료";
        const pr = productOf(x.상품코드);
        lines.push({
          cat: ticketCat(pr),
          el: host ? (
            <TicketBar key={x.id} t={{ ...host, 상품코드: x.상품코드 }} pr={pr} now={now}
                       free={Number(x.추가금액) <= 0} note={`회원권에 얹음 · ${값}`}
                       onClick={onEdit && (() => onEdit(host))} />
          ) : (
            <div className="mrow" key={x.id}>
              <div className="t">
                <b>{pr?.name ?? x.상품코드}</b>
                <span className="dim">{값}</span>
              </div>
            </div>
          ),
        });
      });
    }

    return CATS.map((c) => {
      const mine = lines.filter((l) => l.cat === c.key);
      if (mine.length === 0) return null;
      return (
        <div className="cbox" key={c.key}>
          <p className="csec">{c.key} <span>{mine.length}</span></p>
          {mine.map((l) => l.el)}
        </div>
      );
    });
  };

  return (
    <div className="mcard" style={{ padding: "4px 0 0", border: 0, background: "none" }}>
      <div className="pick-row" style={{ margin: "4px 0 12px" }}>
        <button className={`mini-tab${side === "live" ? " on" : ""}`} onClick={() => setSide("live")}>
          활성{liveN > 0 && <span className="dot">{liveN}</span>}
        </button>
        <button className={`mini-tab${side === "past" ? " on" : ""}`} onClick={() => setSide("past")}>
          만료{pastN > 0 && ` (${pastN})`}
        </button>
      </div>

      {side === "live" ? (
        <>
          {liveN === 0 ? (
            <p className="empty">
              지금 쓸 수 있는 회원권 · 수강권이 없습니다. <b>재등록 대상</b>입니다.
            </p>
          ) : (
            board([...live, ...liveExtra, ...liveOpts], liveSvc, true)
          )}
        </>
      ) : pastN === 0 ? (
        <p className="empty">아직 만료된 이용권이 없습니다.</p>
      ) : (
        <>
          {board([...past, ...pastExtra, ...pastOpts], pastSvc, false)}
        </>
      )}
    </div>
  );
}

/** 횟수제 상품인가 — 0 이나 빈칸은 기간제로 본다 */
const hasCount = (t: Ticket) => Number(t.총횟수) > 0;

/**
 * 횟수를 세는 상품인가
 *
 * 1:1PT · 그룹수업처럼 회차로 파는 것만 횟수가 있다.
 * 개월로 파는 회원권에 횟수 칸을 보여주면 0 만 남아 헷갈린다.
 */
const usesCount = (pr?: ProductMeta, t?: Ticket) =>
  // 분류 이름에 "회" 하나만 보고 판단하면 "회원권"까지 횟수제로 잡힌다
  (pr?.count ?? 0) > 0 || /PT|수업/.test(pr?.kind ?? "") || Number(t?.총횟수) > 0;


/**
 * 결제 — 달별로 본다
 *
 * 몇 해 다닌 회원은 결제가 스무 줄이 넘는다. 한 줄로 쭉 뿌리면 "작년 3월에
 * 얼마 냈나"를 찾느라 훑게 된다. 달을 고르면 그 달만, 「전체」면 달마다
 * 머리글을 달아 묶어서 보여준다.
 */
function PayTab({ paid, totalPaid, unpaid, tickets, extras, products, onEditItem }: {
  paid: Payment[];
  totalPaid: number;
  unpaid: number;
  /** 이 결제로 무엇을 샀는지 잇는 데 쓴다 */
  tickets: Ticket[];
  /** 회원권에 얹은 옵션 — 이용권을 거쳐 같은 결제에 붙는다 */
  extras: Extra[];
  products: ProductMeta[];
  /** 상품 한 줄을 눌렀을 때 — 그 이용권 창을 연다 */
  onEditItem?: (ticketId: string) => void;
}) {
  const [month, setMonth] = useState("");

  /*
   * 결제 한 건에 무엇이 딸려 있는지 미리 묶어 둔다
   *
   * 이용권 줄이 결제번호를 들고 있다. 그걸로 되짚으면 「이 134,000원이
   * 무엇이었나」를 시트 안 열고 답할 수 있다.
   */
  /*
   * 결제 한 건에 무엇이 딸려 있는지, 각각 얼마였는지
   *
   * 이용권 줄이 결제번호를 들고 있다. 회원권에 얹은 옵션(이용권서비스)은
   * 그 이용권을 거쳐 같은 결제에 붙는다.
   *
   * 금액이 비어 있는 줄이 있다. 이용권 시트에 「금액」 칸이 없던 동안 판
   * 것들인데, 넣으신 값이 적을 자리가 없어 사라진 것이다. 그렇다고 손으로
   * 다시 넣게 하는 것은 내 실수를 대표님이 메우는 일이다.
   *
   * 그래서 계산해서 채운다. 상품표의 정상가에 기간을 곱해 각 줄의 정가를
   * 내고, 결제 금액을 그 비율대로 나눈다. 마지막 줄에서 잔돈을 맞춰
   * 합이 결제 금액과 정확히 떨어지게 한다.
   * 계산해 넣은 값은 그렇다고 표시한다 — 적힌 값과 같은 얼굴로 두면
   * 나중에 어느 것이 사람이 넣은 값인지 알 수 없다.
   */
  const sorted = useMemo(
    () => paid.slice().sort((a, b) => (b.결제일시 ?? "").localeCompare(a.결제일시 ?? "")),
    [paid]
  );

  /** 결제가 있는 달만 고르게 한다 — 빈 달을 고를 수 있으면 고장으로 보인다 */
  const months = useMemo(() => {
    const set = new Set<string>();
    sorted.forEach((x) => {
      const m = (x.결제일시 ?? "").slice(0, 7);
      if (m) set.add(m);
    });
    return [...set].sort().reverse();
  }, [sorted]);

  const bought = useMemo(() => {
    const byCode = new Map(products.map((x) => [x.code, x]));
    type Line = {
      id: string; name: string; amount: number; spec: string;
      정가: number; 할인: number; 미수: number; 적힘: boolean; 계산: boolean;
    };
    const m = new Map<string, Line[]>();

    /* 몇 달치인가 — 달마다 값이 붙는 상품의 정가를 낼 때 쓴다 */
    const monthsOf = (t: Ticket, pr?: ProductMeta) => {
      const a = (t.시작일 ?? "").slice(0, 10);
      const b = (t.종료일 ?? "").slice(0, 10);
      if (!a || !b) return pr?.months || 1;
      const n = Math.round(daysBetween(a, b) / 30);
      return Math.max(1, n || pr?.months || 1);
    };

    const 정가Of = (pr: ProductMeta | undefined, t: Ticket) => {
      if (!pr) return 0;
      const unit = unitPrice(pr, true);
      if (!unit) return 0;
      if (!pricePerMonth(pr)) return unit;
      const base = pr.months || 1;
      return Math.round((unit * monthsOf(t, pr)) / base);
    };

    const put = (pid: string, l: Line) => m.set(pid, [...(m.get(pid) ?? []), l]);

    const byTicket = new Map(tickets.map((t) => [t.id, t]));
    const pidOf = new Map<string, string>();

    const 매인것: Ticket[] = [];
    const 안매인것: Ticket[] = [];
    tickets.forEach((t) => ((t.결제번호 ?? "").trim() ? 매인것 : 안매인것).push(t));

    /* 결제번호가 없는 옛 이용권은 같은 날 결제가 하나뿐일 때만 이어 붙인다.
       여러 건이면 어느 쪽인지 알 수 없어 손대지 않는다 */
    const byDay = new Map<string, Payment[]>();
    paid.forEach((x) => {
      const d = (x.결제일시 ?? "").slice(0, 10);
      if (d) byDay.set(d, [...(byDay.get(d) ?? []), x]);
    });
    매인것.forEach((t) => pidOf.set(t.id, (t.결제번호 ?? "").trim()));
    안매인것.forEach((t) => {
      const same = byDay.get((t.등록일시 ?? t.시작일 ?? "").slice(0, 10)) ?? [];
      if (same.length === 1) pidOf.set(t.id, same[0].id);
    });

    tickets.forEach((t) => {
      const pid = pidOf.get(t.id);
      if (!pid) return;
      const pr = byCode.get(t.상품코드);
      const 적힘 = (t.금액 ?? "").trim() !== "";
      const amount = Number(t.금액) || 0;
      const 정가 = 정가Of(pr, t);
      put(pid, {
        id: t.id,
        name: pr?.name || t.상품코드,
        spec: [termOf(pr ?? {}), t.총횟수 ? `${t.총횟수}회` : ""].filter(Boolean).join(" · "),
        amount, 정가, 적힘, 계산: false,
        할인: Number(t.할인) || (적힘 && 정가 > amount && amount > 0 ? 정가 - amount : 0),
        미수: Number(t.미수금) || 0,
      });
    });

    /* 회원권에 얹은 옵션 — 그 이용권이 붙은 결제에 같이 세운다 */
    extras.forEach((e) => {
      const t = byTicket.get(e.이용권번호);
      if (!t) return;
      const pid = pidOf.get(t.id);
      if (!pid) return;
      const pr = byCode.get(e.상품코드);
      put(pid, {
        id: `VS:${e.id}`,
        name: pr?.name || e.상품코드,
        spec: "회원권에 얹음",
        amount: Number(e.추가금액) || 0,
        정가: Number(e.추가금액) || 0,
        할인: 0, 미수: 0,
        적힘: (e.추가금액 ?? "").trim() !== "",
        계산: false,
      });
    });

    /* 비어 있는 줄을 계산해 채운다 */
    m.forEach((list, pid) => {
      const 빈 = list.filter((l) => !l.적힘);
      if (빈.length === 0) return;
      const pay = paid.find((x) => x.id === pid);
      if (!pay) return;
      const 총액 = Number(pay.결제금액) || 0;
      const 적힌합 = list.filter((l) => l.적힘).reduce((n, l) => n + l.amount, 0);
      const 남은돈 = Math.max(0, 총액 - 적힌합);
      const 정가합 = 빈.reduce((n, l) => n + l.정가, 0);
      if (정가합 <= 0) return;

      /* 비율대로만 나누면 87,488원 같은 값이 나온다. 실제로 그렇게 파는
         가격이 아니라서 보는 사람이 먼저 이상하다고 느낀다.
         천원 단위로 떨어뜨리고, 마지막 줄에서 잔돈을 맞춘다 */
      const 단위 = 남은돈 >= 10000 ? 1000 : 100;
      let 쓴돈 = 0;
      빈.forEach((l, i) => {
        const 몫 =
          i === 빈.length - 1
            ? 남은돈 - 쓴돈
            : Math.round((남은돈 * l.정가) / 정가합 / 단위) * 단위;
        쓴돈 += 몫;
        l.amount = Math.max(0, 몫);
        l.할인 = Math.max(0, l.정가 - l.amount);
        l.계산 = true;
      });
    });

    return m;
  }, [tickets, extras, products, paid]);

  const shown = month ? sorted.filter((x) => (x.결제일시 ?? "").startsWith(month)) : sorted;
  const sum = shown.reduce((n, x) => n + (Number(x.결제금액) || 0), 0);
  const owe = shown.reduce((n, x) => n + (Number(x.미수금액) || 0), 0);

  if (paid.length === 0) {
    return (
      <p className="dim" style={{ fontSize: 13, margin: "8px 0 12px" }}>결제 기록이 없습니다.</p>
    );
  }

  /** 「전체」일 때만 달마다 머리글을 단다 */
  const rows: { head?: string; x?: Payment }[] = [];
  let last = "";
  shown.forEach((x) => {
    const m = (x.결제일시 ?? "").slice(0, 7);
    if (!month && m && m !== last) {
      last = m;
      rows.push({ head: m });
    }
    rows.push({ x });
  });

  return (
    <>
      {months.length > 1 && (
        <div className="pick-row" style={{ margin: "4px 0 12px", flexWrap: "wrap" }}>
          <select className="select" style={{ maxWidth: 180 }} value={month}
                  onChange={(e) => setMonth(e.target.value)}>
            <option value="">전체 ({paid.length}건)</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m.slice(0, 4)}년 {Number(m.slice(5, 7))}월
                {" "}({sorted.filter((x) => (x.결제일시 ?? "").startsWith(m)).length}건)
              </option>
            ))}
          </select>
          {month && (
            <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setMonth("")}>
              전체 보기
            </button>
          )}
        </div>
      )}

      <div className="line-list">
        {rows.map((r, i) =>
          r.head ? (
            <h4 className="mini-title" key={`h${r.head}`} style={{ margin: "12px 0 4px" }}>
              {r.head.slice(0, 4)}년 {Number(r.head.slice(5, 7))}월
            </h4>
          ) : (
            <PaymentLine key={r.x!.id} x={r.x!} lines={bought.get(r.x!.id) ?? []}
                         onEditItem={onEditItem} />
          )
        )}
      </div>

      <p className="stat-note">
        {month ? (
          <>
            {month.slice(0, 4)}년 {Number(month.slice(5, 7))}월 결제 <b>{shown.length}건</b> · 합계{" "}
            <b className="num">{money(sum)}원</b>
            {owe > 0 && <> · 못 받은 돈 <b className="warn-text num">{money(owe)}원</b></>}
          </>
        ) : (
          <>
            지금까지 결제 <b>{paid.length}건</b> · 합계 <b className="num">{money(totalPaid)}원</b>
            {unpaid > 0 && (
              <> · 아직 못 받은 돈 <b className="warn-text num">{money(unpaid)}원</b></>
            )}
          </>
        )}
      </p>
    </>
  );
}

/**
 * 결제 한 건을 뜯어서 보여준다
 *
 * 「134,000원 · 계좌 · 완납」 한 줄로는 무엇을 샀는지도, 어떻게 나눠 냈는지도
 * 알 수가 없다. 나중에 「이 돈이 뭐였지」를 물으면 시트를 열어야 했다.
 *
 * 두 가지를 편다.
 *  - 무엇을 샀나 : 이 결제로 만들어진 이용권을 상품 이름과 금액으로 나열한다
 *  - 어떻게 냈나 : 카드 · 현금 · 계좌로 나눠 적힌 금액을 그대로 보여준다
 *
 * 나눠 적은 금액이 없으면(결제수단만 골라 두고 금액은 안 나눈 옛 기록)
 * 그 줄은 아예 안 그린다. 0원이라고 적으면 0원을 낸 것처럼 읽힌다.
 */
function PaymentLine({ x, lines, onEditItem }: {
  x: Payment;
  /** 이 결제로 산 것들 */
  lines: {
    id: string; name: string; amount: number; spec: string;
    정가: number; 할인: number; 미수: number; 적힘: boolean; 계산: boolean;
  }[];
  /** 상품 한 줄을 눌렀을 때 — 그 이용권 창을 연다 */
  onEditItem?: (ticketId: string) => void;
}) {
  /* 건수가 쌓이면 늘 펼쳐 둔 목록은 읽기가 힘들다. 눌러서 편다 */
  const [open, setOpen] = useState(false);

  const refunded = x.환불여부?.toUpperCase() === "Y";
  const owe = Number(x.미수금액) || 0;

  const ways = [
    { k: "카드", v: Number(x.카드액) || 0 },
    { k: "현금", v: Number(x.현금액) || 0 },
    { k: "계좌", v: Number(x.계좌액) || 0 },
  ].filter((w) => w.v > 0);

  const 볼것 = lines.length > 0 || ways.length > 0 || owe > 0;
  const won = (n: number) => `${money(n)}원`;

  return (
    <div className={`line-item${볼것 ? " clickable" : ""}${open ? " open" : ""}`}>
      <div className="line-head" onClick={() => 볼것 && setOpen(!open)}>
        <b className="num">{money(Number(x.결제금액) || 0)}원</b>
        <span className="dim">
          {(x.결제일시 ?? "").slice(0, 10)}
          {ways.length === 0 && ` · ${x.결제수단 || "-"}`}
        </span>
        {refunded ? (
          <span className="pill bad">환불</span>
        ) : owe > 0 ? (
          <span className="pill warn">미수금 있음</span>
        ) : (
          <span className="pill good">완납</span>
        )}
        {볼것 && <i className={`caret${open ? " up" : ""}`} aria-hidden />}
      </div>

      {open && (
        <>
          {lines.length > 0 ? (
            <ul className="paylines">
              {lines.map((l) => (
                /*
                  상품 한 줄

                  정상가 · 할인 · 결제 · 미수를 한 자리에 놓는다. 따로 흩어 놓으면
                  「이게 왜 이 값이지」를 물을 때마다 세 군데를 봐야 한다.
                  줄을 누르면 그 상품을 고치는 창이 열린다 — 수정 단추를 따로 두면
                  줄마다 단추가 하나씩 붙어 목록이 단추밭이 된다.
                */
                <li key={l.id}
                    className={onEditItem && !l.id.startsWith("VS:") ? "hit" : ""}
                    onClick={() => !l.id.startsWith("VS:") && onEditItem?.(l.id)}>
                  <div className="top">
                    <span className="nm">{l.name}</span>
                    {l.spec && <span className="sp">{l.spec}</span>}
                  </div>
                  <div className="nums">
                    <span><i>정상가</i>{l.정가 > 0 ? won(l.정가) : "-"}</span>
                    <span className={l.할인 > 0 ? "cut" : ""}>
                      <i>할인</i>{l.할인 > 0 ? `-${won(l.할인)}` : "0원"}
                    </span>
                    <span className="paid">
                      <i>결제</i>{won(l.amount)}
                      {/* 시트에 안 적힌 줄은 정상가 비율로 나눠 계산한 값이다.
                          적힌 값과 같은 얼굴로 두면 어느 것이 사람이 넣은
                          값인지 나중에 알 수 없다 */}
                      {l.계산 && <em className="calc">계산</em>}
                    </span>
                    <span className={l.미수 > 0 ? "warn-text" : ""}>
                      <i>미수</i>{won(l.미수)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="stat-note" style={{ margin: "8px 0 0" }}>
              이 결제에 딸린 이용권을 못 찾았습니다. 이용권 탭에서 확인해주세요.
            </p>
          )}

          {lines.some((l) => l.계산) && (
            <p className="stat-note" style={{ margin: "8px 0 0" }}>
              「계산」이 붙은 금액은 시트에 안 적혀 있어 정상가 비율로 나눈 값입니다.
              합계는 결제 금액과 맞춰 두었습니다. 다르면 그 줄을 눌러 고쳐주세요.
            </p>
          )}

          {(ways.length > 0 || owe > 0) && (
            <div className="payways">
              {/* 수단은 결제 한 건 단위로 적힌다. 「지역주민은 카드, 사물함은 현금」처럼
                  상품마다 나눠 적는 자리는 시트에 없다 — 없는 것을 지어내지 않는다 */}
              {ways.map((w) => (
                <span key={w.k}>
                  {w.k} <b className="num">{money(w.v)}원</b>
                </span>
              ))}
              {owe > 0 && (
                <span className="warn-text">
                  미수 합계 <b className="num">{money(owe)}원</b>
                  {x.미수금결제예정일 && ` · ${x.미수금결제예정일}까지`}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── 이용권 고치기 ─────────────────────────── */
function TicketEdit({
  t, pr, trainers, members, canRemove, onClose,
}: {
  t: Ticket;
  pr?: ProductMeta;
  trainers: { id: string; name: string }[];
  members: Member[];
  canRemove: boolean;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    시작일: (t.시작일 ?? "").slice(0, 10),
    종료일: (t.종료일 ?? "").slice(0, 10),
    총횟수: t.총횟수 ?? "",
    잔여횟수: t.잔여횟수 ?? "",
    정지일수: t.정지일수 ?? "",
    담당트레이너사번: t.담당트레이너사번 ?? "",
    상태: t.상태 || "진행중",
    /* 결제 화면에서 「이건 왜 이 값이지」를 물으면 답할 자리다.
       금액을 고쳐도 결제 줄의 합계는 따라가지 않는다 — 그건 결제 창에서 고친다 */
    금액: t.금액 ?? "",
    할인: t.할인 ?? "",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  /** 아래에 열리는 칸 — 정지하기 / 양도하기 */
  const [panel, setPanel] = useState<"" | "hold" | "move">("");
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  /** 개월로 파는 회원권에는 횟수 칸을 보여주지 않는다 */
  const byCount = usesCount(pr, t);

  /** 지금 카테고리 — 고르면 상품 원장이 바뀐다 */
  const [cat, setCat] = useState(ticketCat(pr));
  async function moveCat(next: string) {
    if (next === cat) return;
    setCat(next);
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "kind", 상품코드: t.상품코드, 상품분류: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      setCat(ticketCat(pr));
      return setMsg(data.error ?? "카테고리를 바꾸지 못했습니다.");
    }
    reloadTo(t.회원번호);
  }

  const nowDay = today();
  const 멈춤 = (t.정지시작일 ?? "").slice(0, 10);
  const 예정 = (t.정지종료예정일 ?? "").slice(0, 10);
  /** 미리 정한 날이 지났는데 아직 재개를 안 눌렀다 */
  const 정지끝남 = Boolean(멈춤 && 예정 && 예정 < nowDay);
  /** 재개하면 며칠이 붙는지 미리 보여준다 — 눌러 보고 알게 하면 안 된다 */
  const 붙을날수 = 멈춤
    ? Math.max(0, daysBetween(멈춤, 예정 && 예정 < nowDay ? 예정 : nowDay))
    : 0;

  async function send(body: any) {
    setBusy(true);
    const res = await fetch("/api/members/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    reloadTo(t.회원번호);
  }

  /** 정지 · 재개 · 양도는 계산이 붙는 일이라 서버가 맡는다 */
  async function op(body: any) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/members/ticket-op", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, 이용권번호: t.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "처리하지 못했습니다.");
    reloadTo(t.회원번호);
  }

  return (
    <div className="modal-back top" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{pr?.name ?? t.상품코드}</h3>
        <p className="modal-lead">{t.id}</p>

        <div className="form-grid">
          <L label="시작일">
            <input className="input" type="date" value={f.시작일}
                   onChange={(e) => set("시작일", e.target.value)} />
          </L>
          <L label="종료일">
            <input className="input" type="date" value={f.종료일}
                   onChange={(e) => set("종료일", e.target.value)} />
          </L>
          {byCount && (
            <>
              <L label="총 횟수">
                <input className="input" inputMode="numeric"
                       value={f.총횟수} onChange={(e) => set("총횟수", e.target.value)} />
              </L>
              <L label="남은 횟수">
                <input className="input" inputMode="numeric"
                       value={f.잔여횟수} onChange={(e) => set("잔여횟수", e.target.value)} />
              </L>
            </>
          )}
          <L label="담당 트레이너">
            <select className="input" value={f.담당트레이너사번}
                    onChange={(e) => set("담당트레이너사번", e.target.value)}>
              <option value="">지정 안 함</option>
              {trainers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </L>
          <L label="상태">
            <select className="input" value={f.상태} onChange={(e) => set("상태", e.target.value)}>
              {["진행중", "정지", "만료", "환불"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </L>
          {/* 결제 화면에서 「이 상품이 얼마였지」를 물으면 답할 자리 */}
          <L label="판 금액">
            <input className="input" inputMode="numeric" value={f.금액}
                   onChange={(e) => set("금액", e.target.value.replace(/[^0-9]/g, ""))} />
          </L>
          <L label="깎아 드린 금액">
            <input className="input" inputMode="numeric" value={f.할인}
                   onChange={(e) => set("할인", e.target.value.replace(/[^0-9]/g, ""))} />
          </L>
        </div>
        <p className="stat-note">
          여기서 금액을 고쳐도 <b>결제 줄의 합계는 따라가지 않습니다.</b>
          받은 돈 자체가 달랐다면 결제 탭에서 그 결제를 고쳐주세요.
        </p>

        {/*
          카테고리 고치기

          "왜 케어권으로 안 나오지"를 알아채는 자리가 여기다. 시트를 열게 하면
          두 화면을 오가야 한다. 다만 고쳐지는 것은 이 줄이 아니라 상품 원장이라
          같은 상품으로 판 이용권이 전부 따라 움직인다 — 그 말을 옆에 적어 둔다.
        */}
        <h4 className="mini-title">카테고리</h4>
        <div className="pick-row" style={{ flexWrap: "wrap" }}>
          <select className="select" style={{ maxWidth: 200 }} value={cat} disabled={busy}
                  onChange={(e) => moveCat(e.target.value)}>
            {CATS.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
          </select>
          <span className="dim" style={{ fontSize: 11.5 }}>
            「{pr?.name ?? t.상품코드}」 상품 전체에 적용됩니다
          </span>
        </div>
        <p className="stat-note">
          이 상품으로 판 이용권이 <b>모두 같이</b> 옮겨갑니다. 한 사람만 바꾸는 것이
          아니라 상품의 성격을 정하는 자리입니다.
        </p>

        <h4 className="mini-title">정지 · 양도</h4>

        {멈춤 ? (
          <div className={`setup${정지끝남 ? "" : ""}`}>
            <div>
              <b>
                {정지끝남 ? "정지 기간이 끝났습니다" : "지금 정지 중입니다"}
              </b>
              <p>
                {멈춤}부터{예정 ? ` ${예정}까지로 정해 뒀습니다.` : " 멈춰 있습니다."}
                {" "}재개를 누르면 <b>{붙을날수}일</b>만큼 종료일이 뒤로 밀립니다
                {f.종료일 && <> — {f.종료일} → <b>{addDays(f.종료일, 붙을날수)}</b></>}.
                {정지끝남 && " 늦게 누르셔도 정해 둔 날까지만 쳐 드립니다."}
              </p>
            </div>
            <button className="btn-dark" disabled={busy} onClick={() => op({ op: "resume" })}>
              {busy ? "처리 중…" : "다시 쓰기"}
            </button>
          </div>
        ) : (
          <div className="pick-row" style={{ flexWrap: "wrap" }}>
            <button className="btn-ghost" style={{ marginTop: 0 }}
                    onClick={() => setPanel(panel === "hold" ? "" : "hold")}>
              정지하기
            </button>
            <button className="btn-ghost" style={{ marginTop: 0 }}
                    onClick={() => setPanel(panel === "move" ? "" : "move")}>
              양도하기
            </button>
            {Number(f.정지일수) > 0 && (
              <span className="dim" style={{ fontSize: 11.5 }}>
                지금까지 정지 {Number(f.정지일수)}일
              </span>
            )}
          </div>
        )}

        {panel === "hold" && <HoldBox 종료일={f.종료일} busy={busy} onRun={op} />}
        {panel === "move" && (
          <MoveBox me={t.회원번호} members={members} busy={busy} onRun={op} />
        )}

        {msg && <div className="alert-bad">{msg}</div>}

        {confirmDel ? (
          <div className="confirm-box">
            <b>이 이용권을 지울까요?</b>
            <p>
              잘못 넣은 줄을 되돌릴 때 쓰세요. 환불은 지우지 말고 <b>상태를 환불</b>로 바꾸셔야
              나중에 환불 건수를 셀 수 있습니다.
            </p>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setConfirmDel(false)}>그만두기</button>
              <button className="btn-danger" onClick={() => send({ id: t.id, remove: true })} disabled={busy}>
                {busy ? "처리 중…" : "지우기"}
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-actions">
            {canRemove && (
              <button className="btn-ghost danger" onClick={() => setConfirmDel(true)}>지우기</button>
            )}
            <button className="btn-ghost" onClick={onClose}>닫기</button>
            <button className="btn-primary" style={{ marginTop: 0 }}
                    onClick={() => send({ id: t.id, changes: f })} disabled={busy}>
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 정지 칸
 *
 * 끝나는 날은 안 적어도 된다. 부상처럼 언제 돌아올지 모르는 경우가 흔해서,
 * 적으라고 강제하면 아무 날이나 적어 넣게 된다.
 */
function HoldBox({ 종료일, busy, onRun }: {
  종료일: string;
  busy: boolean;
  onRun: (b: any) => void;
}) {
  const [from, setFrom] = useState(today());
  const [until, setUntil] = useState("");
  const days = until ? Math.max(0, daysBetween(from, until)) : 0;

  return (
    <div className="bulk-sec">
      <div className="form-grid">
        <L label="정지 시작">
          <input className="input" type="date" value={from}
                 onChange={(e) => setFrom(e.target.value)} />
        </L>
        <L label="정지 끝 (몰라도 됩니다)">
          <input className="input" type="date" value={until}
                 onChange={(e) => setUntil(e.target.value)} />
        </L>
      </div>
      <p className="stat-note">
        {until ? (
          <>
            <b>{days}일</b> 멈춥니다. 그만큼 종료일이 뒤로 밀립니다
            {종료일 && <> — {종료일} → <b>{addDays(종료일, days)}</b></>}.
            <br />
            끝나는 날이 지나면 화면에 <b>재개하세요</b> 라고 뜹니다. 늦게 누르셔도
            정해 둔 날까지만 쳐 드립니다.
          </>
        ) : (
          <>
            끝나는 날을 비워 두면 <b>다시 쓰기</b>를 누를 때까지 멈춥니다.
            종료일은 그때 밀린 날수만큼 뒤로 갑니다 — 미리 밀어 두면 일찍 돌아오셨을 때
            되돌려야 하고, 되돌리다 틀리면 회원에게 하루를 더 주거나 덜 주게 됩니다.
          </>
        )}
      </p>
      <div className="pick-row">
        <span className="spacer" />
        <button className="btn-dark" disabled={busy || !from}
                onClick={() => onRun({ op: "hold", 정지시작일: from, 정지종료예정일: until })}>
          {busy ? "처리 중…" : "정지하기"}
        </button>
      </div>
    </div>
  );
}

/**
 * 양도 칸
 *
 * 받는 사람은 대개 가족·지인이라 아직 회원이 아닌 경우가 많다.
 * 회원 등록부터 하고 오라고 하면 화면을 두 번 오가게 되므로 여기서 만든다.
 */
function MoveBox({ me, members, busy, onRun }: {
  me: string;
  members: Member[];
  busy: boolean;
  onRun: (b: any) => void;
}) {
  const [who, setWho] = useState<"old" | "new">("old");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [이름, set이름] = useState("");
  const [전화번호, set전화] = useState("");
  const [양도일, set양도일] = useState(today());
  const [수수료, set수수료] = useState("");
  const [결제수단, set수단] = useState("카드");
  const [메모, set메모] = useState("");

  /** 자기 자신에게는 못 넘긴다. 이름으로 걸러 찾는다 */
  const hits = useMemo(() => {
    const key = q.trim();
    return members
      .filter((m) => m.id !== me)
      .filter((m) => !key || m.이름.includes(key) || (m.전화번호 ?? "").includes(key))
      .slice(0, 50);
  }, [members, me, q]);

  const fee = Number((수수료 ?? "").replace(/[^0-9]/g, "")) || 0;
  const ready = who === "old" ? Boolean(to) : Boolean(이름.trim());

  return (
    <div className="bulk-sec">
      <div className="pick-row" style={{ marginBottom: 10 }}>
        <button className={`mini-tab${who === "old" ? " on" : ""}`} onClick={() => setWho("old")}>
          이미 있는 회원
        </button>
        <button className={`mini-tab${who === "new" ? " on" : ""}`} onClick={() => setWho("new")}>
          새로 등록하며
        </button>
      </div>

      {who === "old" ? (
        <>
          <L label="받을 회원 찾기">
            <input className="input" value={q} placeholder="이름이나 전화번호"
                   onChange={(e) => setQ(e.target.value)} />
          </L>
          <L label="받을 회원">
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">고르기</option>
              {hits.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.이름} · {m.전화번호 || "번호 없음"}
                </option>
              ))}
            </select>
          </L>
        </>
      ) : (
        <div className="form-grid">
          <L label="받을 분 이름">
            <input className="input" value={이름} onChange={(e) => set이름(e.target.value)} />
          </L>
          <L label="전화번호">
            <input className="input" inputMode="numeric" value={전화번호}
                   onChange={(e) => set전화(e.target.value)} />
          </L>
        </div>
      )}

      <div className="form-grid" style={{ marginTop: 10 }}>
        <L label="양도일">
          <input className="input" type="date" value={양도일}
                 onChange={(e) => set양도일(e.target.value)} />
        </L>
        <L label="수수료 (없으면 비우기)">
          <input className="input" inputMode="numeric" value={수수료} placeholder="0"
                 onChange={(e) => set수수료(e.target.value.replace(/[^0-9]/g, ""))} />
        </L>
        {fee > 0 && (
          <L label="수수료 받은 방법">
            <select className="input" value={결제수단} onChange={(e) => set수단(e.target.value)}>
              {PAY_METHODS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </L>
        )}
        <L label="메모 (선택)">
          <input className="input" value={메모} onChange={(e) => set메모(e.target.value)} />
        </L>
      </div>

      <p className="stat-note">
        이 이용권이 통째로 넘어갑니다. 남은 기간·횟수가 그대로 따라가고, 받는 분 지점으로 옮겨집니다.
        {fee > 0 ? (
          <> 수수료 <b className="num">{money(fee)}원</b>은 받는 분 앞으로 <b>결제 한 줄</b>이
          만들어져 매출에 잡힙니다.</>
        ) : (
          <> 수수료를 비우면 돈은 아무것도 기록되지 않습니다.</>
        )}
        {" "}누가 누구에게 언제 넘겼는지는 따로 남습니다.
      </p>

      <div className="pick-row">
        <span className="spacer" />
        <button className="btn-dark" disabled={busy || !ready}
                onClick={() =>
                  onRun({
                    op: "transfer",
                    받는회원번호: who === "old" ? to : "",
                    새회원: who === "new" ? { 이름, 전화번호 } : undefined,
                    양도일, 수수료: String(fee), 결제수단, 메모,
                  })
                }>
          {busy ? "넘기는 중…" : "양도하기"}
        </button>
      </div>
    </div>
  );
}

/* ── 결제 고치기 ───────────────────────────── */
function PaymentEdit({
  x, options, onClose,
}: {
  x: Payment;
  options: Record<string, string[]>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    결제일시: (x.결제일시 ?? "").slice(0, 10),
    결제수단: x.결제수단 || "카드",
    결제금액: x.결제금액 ?? "",
    카드액: "",
    계좌액: "",
    미수금액: x.미수금액 ?? "",
    미수금결제예정일: "",
    매출유형: x.매출유형 ?? "",
    환불여부: x.환불여부 ?? "",
    환불액: x.환불액 ?? "",
    환불진행상태: x.환불진행상태 ?? "",
    환불사유: x.환불사유 ?? "",
    환불신청일: (x.환불신청일 ?? "").slice(0, 10),
    환불완료일: (x.환불완료일 ?? "").slice(0, 10),
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  const split = (f.결제수단 ?? "").includes("+");
  const onlyNum = (v?: string) => Number((v ?? "").replace(/[^0-9]/g, "")) || 0;
  const refunded = f.환불여부?.toUpperCase() === "Y";

  async function save() {
    if (!split && onlyNum(f.결제금액) <= 0) return setMsg("결제 금액을 적어주세요.");
    if (split && onlyNum(f.카드액) + onlyNum(f.계좌액) <= 0) return setMsg("나눠 낸 금액을 적어주세요.");

    setBusy(true);
    const res = await fetch("/api/members/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: x.id, changes: f }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    reloadTo(x.회원번호);
  }

  return (
    <div className="modal-back top" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>결제 고치기</h3>
        <p className="modal-lead">{x.id}</p>

        <div className="form-grid">
          <L label="결제일">
            <input className="input" type="date" value={f.결제일시}
                   onChange={(e) => set("결제일시", e.target.value)} />
          </L>
          <L label="결제 수단">
            <select className="input" value={f.결제수단} onChange={(e) => set("결제수단", e.target.value)}>
              {(options["결제유형"] ?? PAY_METHODS).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </L>
          {split ? (
            <>
              <L label="카드">
                <input className="input" inputMode="numeric" value={f.카드액}
                       onChange={(e) => set("카드액", e.target.value)} />
              </L>
              <L label="계좌">
                <input className="input" inputMode="numeric" value={f.계좌액}
                       onChange={(e) => set("계좌액", e.target.value)} />
              </L>
            </>
          ) : (
            <L label="결제 금액">
              <input className="input" inputMode="numeric" value={f.결제금액}
                     onChange={(e) => set("결제금액", e.target.value)} />
            </L>
          )}
          <L label="미수금">
            <input className="input" inputMode="numeric" placeholder="0"
                   value={f.미수금액} onChange={(e) => set("미수금액", e.target.value)} />
          </L>
          <L label="매출 유형">
            <select className="input" value={f.매출유형}
                    onChange={(e) => set("매출유형", e.target.value)}>
              <option value="">선택</option>
              {(options["매출유형"] ?? ["신규", "재등록", "기타매출"]).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </L>
          {onlyNum(f.미수금액) > 0 && (
            <L label="미수금 받기로 한 날">
              <input className="input" type="date" value={f.미수금결제예정일}
                     onChange={(e) => set("미수금결제예정일", e.target.value)} />
            </L>
          )}
          <L label="환불">
            <select className="input" value={refunded ? "Y" : ""}
                    onChange={(e) => set("환불여부", e.target.value)}>
              <option value="">환불 안 함</option>
              <option value="Y">환불함</option>
            </select>
          </L>
          {refunded && (
            <>
              <L label="환불 금액">
                <input className="input" inputMode="numeric" value={f.환불액}
                       onChange={(e) => set("환불액", e.target.value)} />
              </L>
              <L label="진행 상태">
                <select className="input" value={f.환불진행상태}
                        onChange={(e) => set("환불진행상태", e.target.value)}>
                  <option value="">선택</option>
                  {REFUND_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </L>
              <L label="환불 사유">
                <input className="input" list="refund-reasons" placeholder="고르거나 직접 적기"
                       value={f.환불사유} onChange={(e) => set("환불사유", e.target.value)} />
                <datalist id="refund-reasons">
                  {REFUND_REASONS.map((r) => <option key={r} value={r} />)}
                </datalist>
              </L>
              <L label="신청일">
                <input className="input" type="date" value={f.환불신청일}
                       onChange={(e) => set("환불신청일", e.target.value)} />
              </L>
              {f.환불진행상태 === "환불완료" && (
                <L label="완료일">
                  <input className="input" type="date" value={f.환불완료일}
                         onChange={(e) => set("환불완료일", e.target.value)} />
                </L>
              )}
            </>
          )}
        </div>

        {split && (
          <p className="stat-note">
            합계 <b>{money(onlyNum(f.카드액) + onlyNum(f.계좌액))}원</b>
          </p>
        )}


        {msg && <div className="alert-bad">{msg}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>닫기</button>
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={save} disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 작은 조각들 ───────────────────────────── */
function L({ label, children, req, full }: {
  label: string; children: React.ReactNode; req?: boolean; full?: boolean;
}) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label>{label}{req && <span className="req">*</span>}</label>
      {children}
    </div>
  );
}

/**
 * 고르기도 되고 직접 쓰기도 되는 칸
 *
 * 직업 같은 것은 목록을 미리 다 적어 둘 수가 없다. 그렇다고 늘 손으로 치면
 * 「회사원」과 「직장인」이 섞여 나중에 세지지가 않는다.
 * 그래서 「선택목록」 탭에 적어 두신 것은 밑에 뜨고, 없는 것은 그냥 치면 된다.
 */
function Free({ label, k, f, set, opts, placeholder }: {
  label: string; k: string; f: Record<string, string>;
  set: (k: string, v: string) => void; opts?: string[]; placeholder?: string;
}) {
  const listId = `opt-${k}`;
  return (
    <L label={label}>
      <input className="input" value={f[k] ?? ""} list={listId} placeholder={placeholder}
             onChange={(e) => set(k, e.target.value)} />
      <datalist id={listId}>
        {(opts ?? []).map((o) => <option key={o} value={o} />)}
      </datalist>
    </L>
  );
}

function Sel({ label, k, f, set, opts }: {
  label: string; k: string; f: Record<string, string>;
  set: (k: string, v: string) => void; opts?: string[];
}) {
  return (
    <L label={label}>
      <select className="input" value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">선택</option>
        {(opts ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </L>
  );
}

function Kv({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="kv-row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
