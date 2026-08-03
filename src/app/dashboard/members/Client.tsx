"use client";

/**
 * 회원 목록 · 등록 · 이용권 관리
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { korDate, today } from "@/lib/time";
import { showPhone } from "@/lib/phone";
import { addMonths, addDays, daysLeft } from "@/lib/dateCalc";
import type { ProductMeta } from "@/lib/productMeta";

type Member = {
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
  담당트레이너사번: string;
  상태: string;
  결제번호: string;
};

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

type Props = {
  items: Member[];
  tickets: Ticket[];
  payments: Payment[];
  extras: Extra[];
  products: ProductMeta[];
  waiting: Waiting[];
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
 * 상품을 네 갈래로 나눈다
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

const groupOf = (pr?: ProductMeta): Grp => {
  if (!pr) return "이용권";
  if (pr.isService || pr.kind === "서비스") return "서비스";
  if (pr.isOption || pr.kind === "옵션") return "옵션";
  if (pr.kind === "기타") return "부가";
  return "이용권";
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

  const newThisMonth = p.items.filter((m) => (m.가입일 ?? "").startsWith(thisMonth)).length;
  const using = p.items.filter((m) => stateOf(m) === "이용중").length;
  const soon = p.items.filter((m) => stateOf(m) === "만료임박").length;
  const expired = p.items.filter((m) => stateOf(m) === "만료").length;

  const list = useMemo(() => {
    return p.items.filter((m) => {
      if (tab !== "전체" && stateOf(m) !== tab) return false;
      if (q) {
        const hay = `${m.이름} ${m.전화번호} ${m.거주동네}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [p.items, p.tickets, tab, q, now]);

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
          <p className="page-sub">등록 · 이용권 · 만료 관리</p>
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
          <div className="vl num">{p.items.length}</div>
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
          상담에서 약속까지 잡혔는데 아직 등록 처리가 안 된 분이 <b>{p.waiting.length}명</b> 있습니다.
          회원 등록 창에서 <b>상담에서 가져오기</b>로 고르시면 이름 · 연락처가 채워지고,
          저장하는 순간 그 상담이 <b>등록</b>으로 바뀝니다.
        </p>
      )}

      <div className="filters">
        <div className="chips">
          {["전체", "이용중", "만료임박", "만료", "이용권 없음"].map((t) => (
            <button key={t} className={`chip${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
              {t}
              <span className="cnt num">
                {t === "전체" ? p.items.length : p.items.filter((m) => stateOf(m) === t).length}
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
            {p.items.length === 0
              ? "오른쪽 위 회원 등록 단추로 첫 회원을 넣어보세요."
              : "필터를 바꿔보세요."}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
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
                  <tr key={m.id} onClick={() => setDetail(m)}>
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
          productOf={productOf}
          options={p.options}
          trainers={p.trainers}
          staffNames={p.staffNames}
          branchName={branchName(detail.지점코드)}
          can={p.can}
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

/* ── 회원 등록 ─────────────────────────────── */
type Line = {
  상품코드: string;
  시작일: string;
  종료일: string;
  총횟수: string;
};

function NewForm({
  products, waiting, options, branches, trainers, defaultBranch, onClose,
}: {
  products: ProductMeta[];
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
    결제수단: "카드",
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [pickProduct, setPickProduct] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const [fromId, setFromId] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const productOf = (code: string) => products.find((x) => x.code === code);

  /** 서비스·옵션인가 — 이용권이 아니라 회원권에 얹는 항목이다 */
  const isExtra = (code: string) => {
    const g = groupOf(productOf(code));
    return g === "서비스" || g === "옵션";
  };

  /** 고른 상품값을 합쳐 결제금액을 미리 채운다 */
  const suggested = useMemo(() => {
    return lines.reduce((sum, l) => {
      const pr = productOf(l.상품코드);
      if (!pr || pr.isService) return sum;
      const price = f["결제수단"] === "현금" || f["결제수단"] === "계좌" ? pr.cash : pr.card;
      return sum + (price || pr.cash || pr.card || 0);
    }, 0);
  }, [lines, f["결제수단"], products]);

  const shownAmount = amountTouched ? amount : suggested ? String(suggested) : "";

  /** 카드+계좌처럼 두 가지로 나눠 낸 경우 금액을 따로 받는다 */
  const split = (f["결제수단"] ?? "").includes("+");
  const onlyNum = (v?: string) => Number((v ?? "").replace(/[^0-9]/g, "")) || 0;
  const splitTotal = onlyNum(f["카드액"]) + onlyNum(f["계좌액"]) + onlyNum(f["현금액"]);

  function addLine(code: string) {
    const pr = productOf(code);
    if (!pr) return;
    const start = f["가입일"] || today();
    setLines((old) => [
      ...old,
      {
        상품코드: code,
        시작일: start,
        종료일: pr.months ? addMonths(start, pr.months) : "",
        총횟수: pr.count ? String(pr.count) : "",
      },
    ]);
    setPickProduct("");
  }

  function setLine(i: number, key: keyof Line, v: string) {
    setLines((old) => old.map((l, k) => (k === i ? { ...l, [key]: v } : l)));
  }

  function pickFrom(id: string) {
    setFromId(id);
    const w = waiting.find((x) => x.id === id);
    if (!w) return;
    setF((o) => ({ ...o, 이름: w.이름, 전화번호: w.전화번호, 지점코드: w.지점코드 || o.지점코드 }));
  }

  async function save() {
    if (!f["이름"]?.trim()) return setMsg("이름을 입력해주세요.");
    if (!f["전화번호"]?.trim()) return setMsg("연락처를 입력해주세요.");
    if (lines.length === 0) return setMsg("등록할 상품을 하나 이상 골라주세요.");
    if (lines.every((l) => isExtra(l.상품코드))) {
      return setMsg("서비스·옵션만으로는 등록할 수 없습니다. 회원권이나 PT를 같이 골라주세요.");
    }

    setBusy(true);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f,
        상담번호: fromId,
        // 서비스·옵션은 이용권이 아니라 "얹어준 것"으로 따로 보낸다
        이용권: lines.filter((l) => !isExtra(l.상품코드)),
        부가서비스: lines
          .filter((l) => isExtra(l.상품코드))
          .map((l) => ({ 상품코드: l.상품코드, 추가금액: String(productOf(l.상품코드)?.card ?? 0) })),
        결제금액: split ? String(splitTotal) : shownAmount,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    location.reload();
  }

  const paid = products.filter((x) => !x.isService);
  const service = products.filter((x) => x.isService);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>회원 등록</h3>
        <p className="modal-lead">
          상품을 고르면 만료일과 금액이 자동으로 채워집니다. 다르면 그 자리에서 고치시면 됩니다.
        </p>

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
            {fromId && (
              <p className="stat-note">
                저장하면 이 상담이 <b>등록</b>으로 바뀝니다. 상담 화면에서 따로 고치실 필요 없습니다.
              </p>
            )}
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
          <L label="등록 지점">
            <select className="input" value={f["지점코드"] ?? ""} onChange={(e) => set("지점코드", e.target.value)}>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
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

        <h4 className="mini-title">등록 상품</h4>
        <div className="inline-form">
          <select className="input" value={pickProduct}
                  onChange={(e) => { if (e.target.value) addLine(e.target.value); }}>
            <option value="">상품을 골라 추가하세요</option>
            <optgroup label="유료 상품">
              {paid.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.name}{x.card ? ` · ${money(x.card)}원` : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="서비스 상품 (금액 없음)">
              {service.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </optgroup>
          </select>
        </div>

        {lines.length === 0 ? (
          <p className="stat-note">아직 고른 상품이 없습니다. 회원권 · PT · 서비스 상품을 골라주세요.</p>
        ) : (
          <div className="line-list">
            {lines.map((l, i) => {
              const pr = productOf(l.상품코드);
              return (
                <div className="line-item" key={`${l.상품코드}-${i}`}>
                  <div className="line-head">
                    <b>{pr?.name ?? l.상품코드}</b>
                    <span className="dim">
                      {pr?.isService ? "서비스" : pr?.kind || ""}
                      {pr && !pr.isService && pr.card ? ` · ${money(pr.card)}원` : ""}
                    </span>
                    <button className="btn-ghost" onClick={() => setLines(lines.filter((_, k) => k !== i))}>
                      빼기
                    </button>
                  </div>
                  {isExtra(l.상품코드) ? (
                    <p className="stat-note" style={{ margin: "6px 0 0" }}>
                      회원권에 얹어드리는 항목입니다. 기간을 따로 세지 않고 무엇을 드렸는지만 남깁니다.
                    </p>
                  ) : (
                  <div className="line-fields">
                    <label>
                      시작일
                      <input className="input" type="date" value={l.시작일}
                             onChange={(e) => {
                               setLine(i, "시작일", e.target.value);
                               if (pr?.months) setLine(i, "종료일", addMonths(e.target.value, pr.months));
                             }} />
                    </label>
                    <label>
                      종료일
                      <input className="input" type="date" value={l.종료일}
                             onChange={(e) => setLine(i, "종료일", e.target.value)} />
                    </label>
                    {usesCount(pr) && (
                      <label>
                        총 횟수
                        <input className="input" inputMode="numeric"
                               value={l.총횟수} onChange={(e) => setLine(i, "총횟수", e.target.value)} />
                      </label>
                    )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <h4 className="mini-title">결제</h4>
        <div className="form-grid">
          <L label="결제 수단">
            <select className="input" value={f["결제수단"] ?? ""} onChange={(e) => set("결제수단", e.target.value)}>
              {(options["결제유형"] ?? PAY_METHODS).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </L>
          {split ? (
            <>
              <L label="카드">
                <input className="input" inputMode="numeric" value={f["카드액"] ?? ""}
                       onChange={(e) => set("카드액", e.target.value)} />
              </L>
              <L label="계좌">
                <input className="input" inputMode="numeric" value={f["계좌액"] ?? ""}
                       onChange={(e) => set("계좌액", e.target.value)} />
              </L>
            </>
          ) : (
            <L label="결제 금액">
              <input className="input" inputMode="numeric" value={shownAmount}
                     onChange={(e) => { setAmountTouched(true); setAmount(e.target.value); }} />
            </L>
          )}
          {(options["매출유형"] ?? []).length > 0 && (
            <Sel label="매출 유형" k="매출유형" f={f} set={set} opts={options["매출유형"]} />
          )}
          <L label="미수금 (없으면 비움)">
            <input className="input" inputMode="numeric" placeholder="0"
                   value={f["미수금액"] ?? ""} onChange={(e) => set("미수금액", e.target.value)} />
          </L>
          {Number((f["미수금액"] ?? "").replace(/[^0-9]/g, "")) > 0 && (
            <L label="미수금 받기로 한 날">
              <input className="input" type="date" value={f["미수금결제예정일"] ?? ""}
                     onChange={(e) => set("미수금결제예정일", e.target.value)} />
            </L>
          )}
          <L label="메모" full>
            <textarea className="input area" rows={2} value={f["메모"] ?? ""}
                      onChange={(e) => set("메모", e.target.value)} />
          </L>
        </div>
        {split ? (
          <p className="stat-note">
            나눠 내신 금액을 각각 적어주세요. 합계 <b>{money(splitTotal)}원</b>으로 저장됩니다.
            {suggested > 0 && <> 상품값 합계는 {money(suggested)}원입니다.</>}
          </p>
        ) : (
          !amountTouched && suggested > 0 && (
            <p className="stat-note">
              고른 상품의 {f["결제수단"] === "현금" || f["결제수단"] === "계좌" ? "현금가" : "카드가"}를
              더해 <b>{money(suggested)}원</b>으로 잡았습니다. 할인하셨다면 직접 고쳐주세요.
            </p>
          )
        )}

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

/** 지금 어느 탭을 보고 있는지 한 줄로 알려준다 */
const TAB_LEAD: Record<(typeof TABS)[number], string> = {
  요약: "지금 이 회원이 어떤 상태인지 한눈에 봅니다.",
  이용권: "끊은 상품 전부입니다. 회원권 · 부가 · 서비스로 나눠 보여드립니다.",
  결제: "지금까지 받은 돈과 아직 못 받은 돈입니다.",
  기록: "언제 어떻게 등록됐는지, 누가 고쳤는지입니다.",
};

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
  item, tickets, payments, extras, productOf, options, trainers, staffNames, branchName, can, onClose,
}: {
  item: Member;
  tickets: Ticket[];
  payments: Payment[];
  extras: Extra[];
  productOf: (code: string) => ProductMeta | undefined;
  options: Record<string, string[]>;
  trainers: { id: string; name: string }[];
  staffNames: Record<string, string>;
  branchName: string;
  can: { create: boolean; update: boolean; remove: boolean };
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

  /** 요약에는 최근 결제 두 건만 */
  const recent = paid
    .slice()
    .sort((a, b) => (b.결제일시 ?? "").localeCompare(a.결제일시 ?? ""))
    .slice(0, 2);

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
          거주동네: f["거주동네"], 담당직원사번: f["담당직원사번"],
          회원상태: f["회원상태"], 가입일: f["가입일"], 메모: f["메모"],
        },
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    location.reload();
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
    location.reload();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal ${editing ? "wide" : "xl"}`} onClick={(e) => e.stopPropagation()}>

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

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => { setEditing(false); setF({ ...(item as any) }); setMsg(""); }}>
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

                <dl className="kv tight">
                  <Kv k="연락처" v={showPhone(item.전화번호)} />
                  <Kv k="성별 · 나이" v={[item.성별, item.나이대].filter(Boolean).join(" · ")} />
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
                      {t === "이용권" && tickets.length > 0 && <span className="cnt num">{tickets.length}</span>}
                      {t === "결제" && paid.length > 0 && <span className="cnt num">{paid.length}</span>}
                    </button>
                  ))}
                </div>

                <p className="tab-lead">{TAB_LEAD[view]}</p>

                {view === "요약" && (
                  <>
                    <div className="mini-stats">
                      <div className="mini-stat">
                        <span className="lb">이용 중</span>
                        <b className="num">{live.count}</b>
                      </div>
                      <div className="mini-stat">
                        <span className="lb">부가 · 서비스</span>
                        <b className="num">{live.extra + live.service}</b>
                      </div>
                      <div className="mini-stat">
                        <span className="lb">총 결제</span>
                        <b className="num">{money(totalPaid)}</b>
                      </div>
                      <div className="mini-stat">
                        <span className="lb">미수금</span>
                        <b className={`num${unpaid > 0 ? " warn-text" : ""}`}>{money(unpaid)}</b>
                      </div>
                    </div>

                    <h4 className="mini-title">지금 쓰는 회원권 · PT</h4>
                    {live.rows.length === 0 ? (
                      <p className="dim" style={{ fontSize: 13 }}>
                        지금 쓸 수 있는 회원권 · PT가 없습니다. <b>재등록 대상</b>입니다.
                      </p>
                    ) : (
                      <div className="line-list">
                        {live.rows.map((t) => (
                          <ProgressLine key={t.id} t={t} pr={productOf(t.상품코드)} now={now}
                                        onEdit={can.update ? () => setEditTicket(t) : undefined} />
                        ))}
                      </div>
                    )}

                    {live.extraRows.length > 0 && (
                      <>
                        <h4 className="mini-title">부가 상품 ({live.extraRows.length})</h4>
                        <div className="line-list">
                          {live.extraRows.map((t) => (
                            <TicketLine key={t.id} t={t} pr={productOf(t.상품코드)} now={now}
                                        onEdit={can.update ? () => setEditTicket(t) : undefined} />
                          ))}
                        </div>
                      </>
                    )}

                    <ServiceList rows={live.serviceRows} extras={extras} productOf={productOf}
                                 ticketOf={ticketOf} now={now}
                                 onEdit={can.update ? setEditTicket : undefined} />

                    {paid.length > 0 && (
                      <>
                        <h4 className="mini-title">최근 결제</h4>
                        <div className="line-list">
                          {recent.map((x) => (
                            <PaymentLine key={x.id} x={x}
                                         onEdit={can.update ? () => setEditPay(x) : undefined} />
                          ))}
                        </div>
                      </>
                    )}

                    {item.메모 && (
                      <>
                        <h4 className="mini-title">특이사항</h4>
                        <div className="quote">{item.메모}</div>
                      </>
                    )}
                  </>
                )}

                {view === "이용권" && (
                  <TicketGroups tickets={tickets} extras={extras} productOf={productOf} now={now}
                                onEdit={can.update ? setEditTicket : undefined} />
                )}

                {view === "결제" && (
                  <>
                    {paid.length === 0 ? (
                      <p className="dim" style={{ fontSize: 13, margin: "8px 0 12px" }}>
                        결제 기록이 없습니다. (무료 · 서비스로만 등록된 회원)
                      </p>
                    ) : (
                      <>
                        <div className="line-list">
                          {paid
                            .slice()
                            .sort((a, b) => (b.결제일시 ?? "").localeCompare(a.결제일시 ?? ""))
                            .map((x) => (
                              <PaymentLine key={x.id} x={x}
                                           onEdit={can.update ? () => setEditPay(x) : undefined} />
                            ))}
                        </div>
                        <p className="stat-note">
                          지금까지 결제 <b>{paid.length}건</b> · 합계{" "}
                          <b className="num">{money(totalPaid)}원</b>
                          {unpaid > 0 && (
                            <> · 아직 못 받은 돈 <b className="warn-text num">{money(unpaid)}원</b></>
                          )}
                        </p>
                      </>
                    )}
                  </>
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
                      <p className="dim" style={{ fontSize: 13 }}>
                        적어둔 메모가 없습니다. 수정에서 넣을 수 있습니다.
                      </p>
                    )}
                    <p className="stat-note">
                      출석 · 예약 기록은 이 대시보드에서 다루지 않기로 하셨습니다.
                      필요해지면 그때 붙일 수 있습니다.
                    </p>
                  </>
                )}
              </div>
            </div>

            {editTicket && (
              <TicketEdit
                t={editTicket}
                pr={productOf(editTicket.상품코드)}
                trainers={trainers}
                canRemove={can.remove}
                onClose={() => setEditTicket(null)}
              />
            )}
            {editPay && (
              <PaymentEdit x={editPay} options={options} onClose={() => setEditPay(null)} />
            )}

            {msg && <div className="alert-bad">{msg}</div>}

            {confirmDel ? (
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
            ) : (
              <div className="modal-actions">
                {can.remove && (
                  <button className="btn-ghost danger" onClick={() => setConfirmDel(true)}>지우기</button>
                )}
                {can.update && (
                  <button className="btn-ghost" onClick={() => { setEditing(true); setMsg(""); }}>수정</button>
                )}
                <button className="btn-ghost" onClick={onClose}>닫기</button>
              </div>
            )}
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
function ServiceList({ rows, extras, productOf, ticketOf, now, onEdit }: {
  rows: Ticket[];
  extras: Extra[];
  productOf: (code: string) => ProductMeta | undefined;
  /** 이 서비스가 어느 이용권에 얹혔는지 — 기간은 그 이용권을 따라간다 */
  ticketOf: (id: string) => Ticket | undefined;
  now: string;
  onEdit?: (t: Ticket) => void;
}) {
  const total = rows.length + extras.length;
  if (total === 0) return null;

  return (
    <>
      <h4 className="mini-title">받은 서비스 · 옵션 ({total})</h4>
      <div className="line-list">
        {extras.map((s) => {
          const pr = productOf(s.상품코드);
          const add = Number(s.추가금액) || 0;
          const host = ticketOf(s.이용권번호);
          const left = host?.종료일 ? daysLeft(host.종료일, now) : null;
          return (
            <div className="line-item" key={s.id}>
              <div className="line-head">
                <b>{pr?.name ?? s.상품코드}</b>
                <span className="dim">
                  {host?.시작일?.slice(2)}
                  {host?.종료일 && ` ~ ${host.종료일.slice(2)}`}
                  {(pr?.count ?? 0) > 0 && ` · ${pr!.count}회`}
                  {left !== null && ` · ${left < 0 ? `${-left}일 지남` : `${left}일 남음`}`}
                </span>
                <span className={`pill ${add > 0 ? "warn" : ""}`}>
                  {add > 0 ? `+${money(add)}원` : "무료"}
                </span>
              </div>
            </div>
          );
        })}
        {rows.map((t) => (
          <TicketLine key={t.id} t={t} pr={productOf(t.상품코드)} now={now} tag="무료"
                      onEdit={onEdit && (() => onEdit(t))} />
        ))}
      </div>
      <p className="stat-note">
        서비스로 드린 항목은 횟수를 차감하지 않고 기록만 남깁니다.
      </p>
    </>
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

  if (tickets.length === 0) {
    return (
      <>
        <h4 className="mini-title">이용권</h4>
        <p className="dim" style={{ fontSize: 13, margin: "0 0 12px" }}>등록된 이용권이 없습니다.</p>
      </>
    );
  }

  const section = (title: string, rows: Ticket[], note?: string, tag?: string) =>
    rows.length > 0 && (
      <>
        <h4 className="mini-title">{title} ({rows.length})</h4>
        <div className="line-list">
          {rows.slice().sort(byEnd).map((t) => (
            <TicketLine key={t.id} t={t} pr={productOf(t.상품코드)} now={now} tag={tag}
                        onEdit={onEdit && (() => onEdit(t))} />
          ))}
        </div>
        {note && <p className="stat-note">{note}</p>}
      </>
    );

  return (
    <>
      <h4 className="mini-title">이용 중 {live.length > 0 && `(${live.length})`}</h4>
      {live.length === 0 ? (
        <p className="dim" style={{ fontSize: 13, margin: "0 0 12px" }}>
          지금 쓸 수 있는 회원권 · PT가 없습니다. <b>재등록 대상</b>입니다.
        </p>
      ) : (
        <div className="line-list">
          {live.slice().sort(byEnd).map((t) => (
            <TicketLine key={t.id} t={t} pr={productOf(t.상품코드)} now={now}
                        onEdit={onEdit && (() => onEdit(t))} />
          ))}
        </div>
      )}

      {section("지난 이용권", past)}
      {section(
        "부가 상품",
        extra,
        "운동복 · 사물함 같은 항목입니다. 이게 남아 있어도 회원권이 살아 있는 것으로는 세지 않습니다."
      )}
      {section("붙은 옵션", opts, "회원권에 얹은 추가 요금입니다.")}
      <ServiceList rows={services} extras={extras} productOf={productOf} ticketOf={ticketOf}
                   now={now} onEdit={onEdit} />
    </>
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
  (pr?.count ?? 0) > 0 || /PT|수업|회/.test(pr?.kind ?? "") || Number(t?.총횟수) > 0;

function TicketLine({ t, pr, now, tag, onEdit }: {
  t: Ticket; pr?: ProductMeta; now: string; tag?: string; onEdit?: () => void;
}) {
  const left = t.종료일 ? daysLeft(t.종료일, now) : null;
  const refunded = t.상태 === "환불";
  const usedUp = Number(t.총횟수) > 0 && Number(t.잔여횟수 || t.총횟수) <= 0;

  return (
    <div className={`line-item${onEdit ? " clickable" : ""}`} onClick={onEdit}>
      <div className="line-head">
        <b>{pr?.name ?? t.상품코드}</b>
        <span className="dim">
          {t.시작일?.slice(2)}
          {t.종료일 && ` ~ ${t.종료일.slice(2)}`}
          {hasCount(t) && ` · ${t.잔여횟수 || t.총횟수}/${t.총횟수}회`}
        </span>
        {tag ? (
          <span className="pill">{tag}</span>
        ) : refunded ? (
          <span className="pill bad">환불</span>
        ) : usedUp ? (
          <span className="pill bad">횟수 소진</span>
        ) : left === null ? (
          <span className="pill">기간 없음</span>
        ) : (
          <span className={`pill ${left < 0 ? "bad" : left <= SOON ? "warn" : "good"}`}>
            {left < 0 ? `${-left}일 지남` : `${left}일 남음`}
          </span>
        )}
      </div>
    </div>
  );
}

function PaymentLine({ x, onEdit }: { x: Payment; onEdit?: () => void }) {
  const refunded = x.환불여부?.toUpperCase() === "Y";
  const owe = Number(x.미수금액) || 0;

  return (
    <div className={`line-item${onEdit ? " clickable" : ""}`} onClick={onEdit}>
      <div className="line-head">
        <b className="num">{money(Number(x.결제금액) || 0)}원</b>
        <span className="dim">
          {(x.결제일시 ?? "").slice(0, 10)} · {x.결제수단 || "-"}
          {owe > 0 && ` · 미수 ${money(owe)}원`}
        </span>
        {refunded ? (
          <span className="pill bad">환불</span>
        ) : owe > 0 ? (
          <span className="pill warn">미수금 있음</span>
        ) : (
          <span className="pill good">완납</span>
        )}
      </div>
    </div>
  );
}

/* ── 이용권 고치기 ─────────────────────────── */
function TicketEdit({
  t, pr, trainers, canRemove, onClose,
}: {
  t: Ticket;
  pr?: ProductMeta;
  trainers: { id: string; name: string }[];
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
  });
  const [hold, setHold] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  /** 개월로 파는 회원권에는 횟수 칸을 보여주지 않는다 */
  const byCount = usesCount(pr, t);

  /** 홀딩한 날수만큼 종료일을 미룬다 */
  function applyHold() {
    const days = Number(hold) || 0;
    if (!days || !f.종료일) return;
    set("종료일", addDays(f.종료일, days));
    set("정지일수", String((Number(f.정지일수) || 0) + days));
    setHold("");
  }

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
    location.reload();
  }

  return (
    <div className="modal-back top" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{pr?.name ?? t.상품코드}</h3>
        <p className="modal-lead">
          {t.id} · 상품 자체는 바꿀 수 없습니다. 다른 상품이면 이 줄을 지우고 새로 등록해주세요.
        </p>

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
        </div>

        <h4 className="mini-title">홀딩 (기간 미루기)</h4>
        <div className="inline-form">
          <input className="input" inputMode="numeric" placeholder="미룰 날수"
                 style={{ maxWidth: 120 }} value={hold} onChange={(e) => setHold(e.target.value)} />
          <button className="btn-ghost" onClick={applyHold} disabled={!hold || !f.종료일}>
            종료일 미루기
          </button>
        </div>
        <p className="stat-note">
          지금까지 미룬 날수 <b>{Number(f.정지일수) || 0}일</b>. 단추를 누르면 위 종료일이 바로 바뀌고,
          아래 저장을 눌러야 실제로 반영됩니다.
        </p>

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
    환불여부: x.환불여부 ?? "",
    환불액: x.환불액 ?? "",
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
    location.reload();
  }

  return (
    <div className="modal-back top" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>결제 고치기</h3>
        <p className="modal-lead">{x.id} · 금액을 고치면 현금 · 카드 · 계좌 칸도 같이 맞춰집니다.</p>

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
            <L label="환불 금액">
              <input className="input" inputMode="numeric" value={f.환불액}
                     onChange={(e) => set("환불액", e.target.value)} />
            </L>
          )}
        </div>

        {split && (
          <p className="stat-note">
            나눠 내신 금액을 각각 적어주세요. 합계{" "}
            <b>{money(onlyNum(f.카드액) + onlyNum(f.계좌액))}원</b>으로 저장됩니다.
          </p>
        )}
        {refunded && (
          <p className="stat-note">
            환불로 표시한 건은 <b>받은 돈 합계에서 빠집니다.</b> 이용권도 같이 환불 처리하시려면
            이용권 줄을 눌러 상태를 환불로 바꿔주세요.
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
