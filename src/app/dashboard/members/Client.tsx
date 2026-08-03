"use client";

/**
 * 회원 목록 · 등록 · 이용권 관리
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { korDate, today } from "@/lib/time";
import { showPhone } from "@/lib/phone";
import { addMonths, daysLeft } from "@/lib/dateCalc";
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

type Waiting = { id: string; 이름: string; 전화번호: string; 지점코드: string };
type Named = { code: string; name: string };

type Props = {
  items: Member[];
  tickets: Ticket[];
  payments: Payment[];
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
   * 이 회원의 이용권 중 가장 늦게 끝나는 날
   *
   * 서비스로 얹어준 항목은 빼고 센다. 무료로 드린 것이 남아 있다고 해서
   * 회원권이 살아 있는 것은 아니기 때문이다.
   */
  const endOf = useMemo(() => {
    const map: Record<string, string> = {};
    p.tickets.forEach((t) => {
      if (t.상태 === "환불") return;
      if (productOf(t.상품코드)?.isService) return;
      const cur = map[t.회원번호] ?? "";
      if (t.종료일 > cur) map[t.회원번호] = t.종료일;
    });
    return map;
  }, [p.tickets, p.products]);

  const stateOf = (m: Member) => {
    const end = endOf[m.id];
    if (!end) return "이용권 없음";
    const left = daysLeft(end, now);
    if (left < 0) return "만료";
    if (left <= SOON) return "만료임박";
    return "이용중";
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

    setBusy(true);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f,
        상담번호: fromId,
        이용권: lines,
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
                    <label>
                      총 횟수
                      <input className="input" inputMode="numeric" placeholder="기간제면 비움"
                             value={l.총횟수} onChange={(e) => setLine(i, "총횟수", e.target.value)} />
                    </label>
                  </div>
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
function Detail({
  item, tickets, payments, productOf, options, trainers, staffNames, branchName, can, onClose,
}: {
  item: Member;
  tickets: Ticket[];
  payments: Payment[];
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
  const setV = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const now = today();

  // 환불한 건은 실제로 받은 돈이 아니므로 합계에서 뺀다
  const paid = payments;
  const totalPaid = paid.reduce((s, x) => {
    if (x.환불여부?.toUpperCase() === "Y") return s;
    return s + (Number(x.결제금액) || 0);
  }, 0);
  const unpaid = paid.reduce((s, x) => s + (Number(x.미수금액) || 0), 0);

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
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div>
            <h3 style={{ margin: 0 }}>{item.이름}</h3>
            <span className="dim num">{showPhone(item.전화번호)} · {item.id}</span>
          </div>
          <span className="pill">{item.회원상태 || "유효"}</span>
        </div>

        {editing ? (
          <>
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
            <dl className="kv">
              <Kv k="성별 · 나이" v={[item.성별, item.나이대].filter(Boolean).join(" · ")} />
              <Kv k="거주 동네" v={item.거주동네} />
              <Kv k="등록 지점" v={branchName} />
              <Kv k="담당 트레이너" v={staffNames[item.담당직원사번]} />
              <Kv k="가입일" v={korDate(item.가입일)} />
              <Kv k="상담 기록" v={item.상담번호} />
            </dl>

            {item.메모 && <div className="quote">{item.메모}</div>}

            <TicketGroups tickets={tickets} productOf={productOf} now={now} />

            <h4 className="mini-title">결제 내역 {paid.length > 0 && `(${paid.length})`}</h4>
            {paid.length === 0 ? (
              <p className="dim" style={{ fontSize: 13, margin: "0 0 12px" }}>
                결제 기록이 없습니다. (무료 · 서비스로만 등록된 회원)
              </p>
            ) : (
              <>
                <div className="line-list">
                  {paid
                    .slice()
                    .sort((a, b) => (b.결제일시 ?? "").localeCompare(a.결제일시 ?? ""))
                    .map((x) => (
                      <div className="line-item" key={x.id}>
                        <div className="line-head">
                          <b className="num">{money(Number(x.결제금액) || 0)}원</b>
                          <span className="dim">
                            {(x.결제일시 ?? "").slice(0, 10)} · {x.결제수단 || "-"}
                            {Number(x.미수금액) > 0 && ` · 미수 ${money(Number(x.미수금액))}원`}
                          </span>
                          {x.환불여부?.toUpperCase() === "Y" ? (
                            <span className="pill bad">환불</span>
                          ) : Number(x.미수금액) > 0 ? (
                            <span className="pill warn">미수금 있음</span>
                          ) : (
                            <span className="pill good">완납</span>
                          )}
                        </div>
                      </div>
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
function TicketGroups({
  tickets, productOf, now,
}: {
  tickets: Ticket[];
  productOf: (code: string) => ProductMeta | undefined;
  now: string;
}) {
  const isService = (t: Ticket) => Boolean(productOf(t.상품코드)?.isService);
  const isRefund = (t: Ticket) => t.상태 === "환불";
  const isOver = (t: Ticket) => Boolean(t.종료일) && daysLeft(t.종료일, now) < 0;

  const paidTickets = tickets.filter((t) => !isService(t));
  const live = paidTickets.filter((t) => !isRefund(t) && !isOver(t));
  const past = paidTickets.filter((t) => isRefund(t) || isOver(t));
  const services = tickets.filter(isService);

  const byEnd = (a: Ticket, b: Ticket) => (b.종료일 ?? "").localeCompare(a.종료일 ?? "");

  if (tickets.length === 0) {
    return (
      <>
        <h4 className="mini-title">이용권</h4>
        <p className="dim" style={{ fontSize: 13, margin: "0 0 12px" }}>등록된 이용권이 없습니다.</p>
      </>
    );
  }

  return (
    <>
      <h4 className="mini-title">이용 중 {live.length > 0 && `(${live.length})`}</h4>
      {live.length === 0 ? (
        <p className="dim" style={{ fontSize: 13, margin: "0 0 12px" }}>
          지금 쓸 수 있는 이용권이 없습니다. <b>재등록 대상</b>입니다.
        </p>
      ) : (
        <div className="line-list">
          {live.sort(byEnd).map((t) => (
            <TicketLine key={t.id} t={t} pr={productOf(t.상품코드)} now={now} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h4 className="mini-title">지난 이용권 ({past.length})</h4>
          <div className="line-list">
            {past.sort(byEnd).map((t) => (
              <TicketLine key={t.id} t={t} pr={productOf(t.상품코드)} now={now} />
            ))}
          </div>
        </>
      )}

      {services.length > 0 && (
        <>
          <h4 className="mini-title">받은 서비스 ({services.length})</h4>
          <div className="line-list">
            {services.sort(byEnd).map((t) => {
              const pr = productOf(t.상품코드);
              return (
                <div className="line-item" key={t.id}>
                  <div className="line-head">
                    <b>{pr?.name ?? t.상품코드}</b>
                    <span className="dim">
                      {t.시작일 ? `${t.시작일.slice(2)} 부터` : ""}
                      {t.종료일 && ` ~ ${t.종료일.slice(2)}`}
                      {hasCount(t) && ` · ${t.총횟수}회`}
                    </span>
                    <span className="pill">무료</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="stat-note">서비스로 드린 항목은 횟수를 차감하지 않고 기록만 남깁니다.</p>
        </>
      )}
    </>
  );
}

/** 횟수제 상품인가 — 0 이나 빈칸은 기간제로 본다 */
const hasCount = (t: Ticket) => Number(t.총횟수) > 0;

function TicketLine({ t, pr, now }: { t: Ticket; pr?: ProductMeta; now: string }) {
  const left = t.종료일 ? daysLeft(t.종료일, now) : null;
  const refunded = t.상태 === "환불";

  return (
    <div className="line-item">
      <div className="line-head">
        <b>{pr?.name ?? t.상품코드}</b>
        <span className="dim">
          {t.시작일?.slice(2)}
          {t.종료일 && ` ~ ${t.종료일.slice(2)}`}
          {hasCount(t) && ` · ${t.잔여횟수 || t.총횟수}/${t.총횟수}회`}
        </span>
        {refunded ? (
          <span className="pill bad">환불</span>
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
