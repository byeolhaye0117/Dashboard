"use client";

/**
 * 상품 관리
 *
 * 카테고리별로 묶어 보여준다. "회원권이 몇 개고 수강권이 몇 개인가"가 먼저 보여야
 * 상품이 어디에 몰려 있는지 안다.
 *
 * 파는 화면과 같은 카테고리 이름을 쓴다 — 여기서 정한 것이 그대로 회원 화면에
 * 나오므로, 이름이 다르면 어디서 정해지는지 알 수 없게 된다.
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";

const KINDS = ["회원권", "수강권", "케어권", "부가상품권", "서비스"];

type Product = {
  code: string;
  name: string;
  kind: string;
  판매중: boolean;
  결제개월: string;
  서비스개월: string;
  총이용개월: string;
  결제횟수: string;
  서비스횟수: string;
  총횟수: string;
  현금가: string;
  카드가: string;
  서비스상품: boolean;
  옵션상품: boolean;
  지점들: string[];
};
type Named = { code: string; name: string };

type Props = {
  items: Product[];
  branches: Named[];
  can: { create: boolean; update: boolean; remove: boolean };
  problem: string;
};

const money = (n: number) => (n > 0 ? n.toLocaleString("ko-KR") : "");
const num = (v?: string) => Number((v ?? "").replace(/[^0-9]/g, "")) || 0;

/** 기간과 횟수를 한 줄로 — 둘 다 있으면 둘 다, 없으면 없는 대로 */
function spec(p: Product): string {
  const 개월 = num(p.총이용개월) || num(p.결제개월) + num(p.서비스개월);
  const 횟수 = num(p.총횟수) || num(p.결제횟수) + num(p.서비스횟수);
  const out: string[] = [];
  if (개월 > 0) out.push(`${개월}개월`);
  if (횟수 > 0) out.push(`${횟수}회`);
  return out.join(" · ");
}

export default function Client(p: Props) {
  const [q, setQ] = useState("");
  /** 지금 보고 있는 카테고리 — 빈 값이면 전체 */
  const [cat, setCat] = useState("");
  const [showOff, setShowOff] = useState(false);
  const [edit, setEdit] = useState<Product | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  /** 골라 둔 상품들 — 한 번에 바꿀 대상 */
  const [picked, setPicked] = useState<string[]>([]);
  const [box, setBox] = useState<"" | "kind" | "sell" | "branch" | "del">("");
  /*
    끌어 옮기는 중

    옮기는 동안에는 화면에 바로 반영하고, 손을 뗄 때 한 번만 저장한다.
    한 칸 옮길 때마다 저장하면 시트를 스무 번 두드리게 된다.
  */
  const [drag, setDrag] = useState<{ code: string; cat: string } | null>(null);
  const [local, setLocal] = useState<string[] | null>(null);

  const nameOf = useMemo(
    () => new Map(p.branches.map((b) => [b.code, b.name])),
    [p.branches]
  );

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    return p.items
      .filter((x) => showOff || x.판매중)
      .filter((x) => !key || x.name.toLowerCase().includes(key) || x.code.toLowerCase().includes(key));
  }, [p.items, q, showOff]);

  const off = p.items.filter((x) => !x.판매중).length;

  /** 끌어 옮기는 중에는 그 차례대로 보여준다 */
  const orderOf = (code: string) => {
    const i = local?.indexOf(code) ?? -1;
    return i < 0 ? 1e9 : i;
  };

  /** 카테고리 이름이 목록 밖이면 회원권으로 본다 — 화면과 셈이 어긋나면 안 된다 */
  const kindOf = (x: Product) => (KINDS.includes(x.kind) ? x.kind : "회원권");
  const countIn = (k: string) => shown.filter((x) => kindOf(x) === k).length;
  const list = cat ? shown.filter((x) => kindOf(x) === cat) : shown;

  async function send(payload: any) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      location.reload();
    } catch (e: any) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  if (p.problem) {
    return (
      <>
        <div className="page-head">
          <div><h1 className="page-title">상품 관리</h1>
            <p className="page-sub">시트를 읽지 못했습니다</p></div>
        </div>
        <div className="alert-bad" style={{ lineHeight: 1.7 }}>{p.problem}</div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">상품 관리</h1>
          <p className="page-sub">
            여기서 정한 카테고리 · 기간 · 가격이 회원 화면과 매출에 그대로 쓰입니다
          </p>
        </div>
        {p.can.create && (
          <button className="btn-dark" onClick={() => setEdit("new")}>
            <Icon name="plus" size={15} strokeWidth={2} /> 상품 만들기
          </button>
        )}
      </div>

      {msg && <div className="alert-bad" style={{ marginBottom: 14 }}>{msg}</div>}

      {/*
        카테고리 골라 보기

        상품이 스무 개를 넘어가면 한 화면에 다 뿌려도 찾기 어렵다.
        숫자는 지금 걸린 조건(찾기 · 판매중지 보기)을 거친 뒤의 개수다 —
        칸에 적힌 수와 아래 목록이 다르면 둘 다 못 믿게 된다.
      */}
      <div className="pick-row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <button className={`mini-tab${cat === "" ? " on" : ""}`} onClick={() => setCat("")}>
          전체{shown.length > 0 && <span className="dot">{shown.length}</span>}
        </button>
        {KINDS.map((k) => {
          const n = countIn(k);
          return (
            <button key={k} className={`mini-tab${cat === k ? " on" : ""}`}
                    onClick={() => setCat(cat === k ? "" : k)}>
              {k}{n > 0 && <span className="dot">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="pick-row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <input className="input" style={{ maxWidth: 240 }} value={q} placeholder="상품 이름 찾기"
               onChange={(e) => setQ(e.target.value)} />
        {off > 0 && (
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setShowOff(!showOff)}>
            {showOff ? "판매중지 감추기" : `판매중지 ${off}개 보기`}
          </button>
        )}
        <span className="spacer" />
        <span className="dim" style={{ fontSize: 11.5 }}>
          {cat ? `${cat} ${list.length}개` : `모두 ${shown.length}개`}
        </span>
      </div>

      {/*
        고른 것이 있을 때만 나온다. 늘 떠 있으면 목록을 가리고,
        아무것도 안 고른 채 눌리면 무엇에 대한 동작인지 알 수 없다.
      */}
      {p.can.update && (
        <div className="pick-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
          {picked.length === 0 ? (
            list.length > 0 && (
              <button className="linkish" style={{ marginLeft: 0 }}
                      onClick={() => setPicked(list.map((x) => x.code))}>
                보이는 것 {list.length}개 다 고르기
              </button>
            )
          ) : (
            <>
              <span className="dim" style={{ fontSize: 12.5, fontWeight: 700 }}>
                {picked.length}개 골랐습니다
              </span>
              <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setBox("kind")}>
                카테고리 바꾸기
              </button>
              <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setBox("sell")}>
                판매 상태
              </button>
              <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setBox("branch")}>
                파는 지점
              </button>
              {p.can.remove && (
                <button className="btn-danger" style={{ marginTop: 0 }} onClick={() => setBox("del")}>
                  지우기
                </button>
              )}
              <button className="linkish" onClick={() => setPicked([])}>선택 해제</button>
            </>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <div className="setup">
          <div>
            <b>
              {q ? "찾는 상품이 없습니다"
                : cat ? `${cat} 상품이 없습니다`
                : "아직 만든 상품이 없습니다"}
            </b>
            <p>
              상품을 만들어 두면 회원에게 팔 때 목록에서 고르기만 하면 됩니다.
              기간과 가격이 자동으로 채워집니다.
            </p>
          </div>
          {p.can.create && !q && (
            <button className="btn-dark" onClick={() => setEdit("new")}>상품 만들기</button>
          )}
        </div>
      ) : (
        (cat ? [cat] : KINDS).map((k) => {
          const rows = list.filter((x) => kindOf(x) === k);
          if (rows.length === 0) return null;
          if (local) rows.sort((a, b) => orderOf(a.code) - orderOf(b.code));

          /** 끌고 온 줄을 이 자리에 끼운다 */
          const dropOn = (target: string) => {
            if (!drag || drag.cat !== k || drag.code === target) return;
            const cur = local ?? rows.map((x) => x.code);
            const from = cur.indexOf(drag.code);
            const to = cur.indexOf(target);
            if (from < 0 || to < 0) return;
            const next = [...cur];
            next.splice(to, 0, ...next.splice(from, 1));
            setLocal(next);
          };
          return (
            <div className="cbox" key={k} style={{ marginBottom: 12 }}>
              {/* 한 카테고리만 보고 있으면 위 칸이 이미 말해 준다 */}
              {!cat && <p className="csec">{k} <span>{rows.length}</span></p>}
              {rows.map((x) => (
                <div className={`mrow prow-wrap${picked.includes(x.code) ? " is-picked" : ""}`
                       + `${drag?.code === x.code ? " is-dragging" : ""}`}
                     key={x.code}
                     onDragOver={(e) => { e.preventDefault(); dropOn(x.code); }}
                     onDrop={(e) => e.preventDefault()}>
                  {p.can.update && (
                    <span className="grip" title="끌어서 순서 바꾸기"
                          draggable
                          onDragStart={() => {
                            setDrag({ code: x.code, cat: k });
                            setLocal(rows.map((r) => r.code));
                          }}
                          onDragEnd={() => {
                            const codes = local;
                            setDrag(null);
                            if (codes) send({ action: "order", codes });
                          }}>
                      ⠿
                    </span>
                  )}
                  {p.can.update && (
                    <input type="checkbox" className="pick-box" checked={picked.includes(x.code)}
                           aria-label={`${x.name} 고르기`}
                           onChange={() =>
                             setPicked((cur) =>
                               cur.includes(x.code)
                                 ? cur.filter((c) => c !== x.code)
                                 : [...cur, x.code]
                             )
                           } />
                  )}
                  <button className="prow-body"
                          onClick={() => p.can.update && setEdit(x)}
                          disabled={!p.can.update}>
                    <div className="t">
                      <b>{x.name}</b>
                      {!x.판매중 && <span className="pill">판매중지</span>}
                      {x.서비스상품 && <span className="pill">무료</span>}
                      {x.옵션상품 && <span className="pill">옵션</span>}
                      <span className="dim">
                        {money(num(x.카드가)) ? `카드 ${money(num(x.카드가))}원` : ""}
                        {money(num(x.현금가)) ? ` · 현금 ${money(num(x.현금가))}원` : ""}
                      </span>
                    </div>
                    <span className="sub">
                      {x.code}
                      {spec(x) && ` · ${spec(x)}`}
                      {" · "}
                      {x.지점들.length === 0
                        ? "파는 지점 없음"
                        : x.지점들.length === p.branches.length
                          ? "전 지점"
                          : x.지점들.map((b) => nameOf.get(b) ?? b).join(" · ")}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          );
        })
      )}

      {box && (
        <BatchBox
          op={box}
          count={picked.length}
          branches={p.branches}
          busy={busy}
          onClose={() => setBox("")}
          onRun={(payload) => send({ ...payload, action: "batch", codes: picked })}
        />
      )}

      {edit && (
        <ProductForm
          item={edit === "new" ? null : edit}
          branches={p.branches}
          can={p.can}
          busy={busy}
          onSave={(payload) => send(payload)}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}

/**
 * 여러 개를 한꺼번에 바꾸는 창
 *
 * 무엇을, 몇 개에 하는지를 먼저 크게 적는다. 쉰 개를 골라 놓고 무심코
 * 카테고리를 옮기면 회원 화면이 통째로 달라진다.
 */
function BatchBox({ op, count, branches, busy, onClose, onRun }: {
  op: "kind" | "sell" | "branch" | "del";
  count: number;
  branches: Named[];
  busy: boolean;
  onClose: () => void;
  onRun: (payload: any) => void;
}) {
  const [kind, setKind] = useState(KINDS[0]);
  const [sell, setSell] = useState("판매중");
  const [지점들, set지점] = useState<string[]>(branches.map((b) => b.code));
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState("");

  const TITLES: Record<string, string> = {
    kind: "카테고리 바꾸기", sell: "판매 상태 바꾸기",
    branch: "파는 지점 바꾸기", del: "상품 지우기",
  };

  function run() {
    if (op === "kind") return onRun({ changes: { 상품분류: kind } });
    if (op === "sell") return onRun({ changes: { 판매상태: sell } });
    if (op === "branch") {
      if (지점들.length === 0) return setErr("어느 지점에서 팔지 골라주세요.");
      return onRun({ 지점들 });
    }
    onRun({ changes: { 삭제여부: "Y" } });
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{TITLES[op]}</h3>
        <p className="stat-note" style={{ marginTop: 0 }}>
          고른 상품 <b>{count}개</b>에 적용합니다.
        </p>

        {op === "kind" && (
          <>
            <div className="field">
              <label htmlFor="bk">어느 카테고리로</label>
              <select id="bk" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <p className="stat-note">
              이 상품들로 판 <b>이용권 전부</b>가 같이 옮겨갑니다. 회원 화면의 묶음이
              바로 달라집니다.
            </p>
          </>
        )}

        {op === "sell" && (
          <>
            <div className="field">
              <label htmlFor="bs">어떻게</label>
              <select id="bs" className="select" value={sell} onChange={(e) => setSell(e.target.value)}>
                <option value="판매중">판매중</option>
                <option value="판매중지">판매중지</option>
              </select>
            </div>
            <p className="stat-note">
              판매중지로 두면 새로 팔 때 목록에 안 나옵니다. 이미 판 이용권은 그대로입니다.
            </p>
          </>
        )}

        {op === "branch" && (
          <>
            <div className="field">
              <label>어느 지점에서</label>
              <div className="pickbox">
                {branches.map((b) => (
                  <button key={b.code} type="button"
                          className={`pickone${지점들.includes(b.code) ? " on" : ""}`}
                          onClick={() => {
                            setErr("");
                            set지점((cur) =>
                              cur.includes(b.code) ? cur.filter((c) => c !== b.code) : [...cur, b.code]
                            );
                          }}>
                    <span className="nm">{b.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="stat-note">
              고른 상품들의 판매 지점이 <b>여기 고른 대로 맞춰집니다.</b> 지금 걸려 있던
              지점 중 여기서 안 고른 곳은 빠집니다.
            </p>
          </>
        )}

        {op === "del" && (
          <p className="stat-note">
            목록에서 사라지고 앞으로 팔 수 없게 됩니다. 이미 판 이용권과 결제 기록은
            그대로 남습니다. 잠시 안 파는 것이라면 <b>판매중지</b>가 낫습니다.
          </p>
        )}

        {err && <div className="alert-bad" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          {op === "del" ? (
            sure ? (
              <button className="btn-danger" style={{ marginTop: 0 }} disabled={busy} onClick={run}>
                {busy ? "지우는 중…" : "정말 지웁니다"}
              </button>
            ) : (
              <button className="btn-danger" style={{ marginTop: 0 }} onClick={() => setSure(true)}>
                지우기
              </button>
            )
          ) : (
            <button className="btn-primary" style={{ marginTop: 0 }} disabled={busy} onClick={run}>
              {busy ? "바꾸는 중…" : `${count}개 바꾸기`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 상품 만들기 · 고치기 ──────────────────── */

function ProductForm({ item, branches, can, busy, onSave, onClose }: {
  item: Product | null;
  branches: Named[];
  can: { create: boolean; update: boolean; remove: boolean };
  busy: boolean;
  onSave: (payload: any) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    상품명: item?.name ?? "",
    상품분류: item && KINDS.includes(item.kind) ? item.kind : "회원권",
    결제개월: item?.결제개월 ?? "",
    서비스개월: item?.서비스개월 ?? "",
    결제횟수: item?.결제횟수 ?? "",
    서비스횟수: item?.서비스횟수 ?? "",
    현금가: item?.현금가 ?? "",
    카드가: item?.카드가 ?? "",
    서비스상품: item?.서비스상품 ?? false,
    옵션상품: item?.옵션상품 ?? false,
    판매중: item?.판매중 ?? true,
  });
  const [지점들, set지점] = useState<string[]>(
    item ? item.지점들 : branches.map((b) => b.code)
  );
  const [killing, setKilling] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: any) => setF((o) => ({ ...o, [k]: v }));

  const 개월 = num(f.결제개월) + num(f.서비스개월);
  const 횟수 = num(f.결제횟수) + num(f.서비스횟수);

  function save() {
    if (!f.상품명.trim()) return setErr("상품 이름을 적어주세요.");
    if (지점들.length === 0) return setErr("어느 지점에서 팔지 골라주세요.");

    if (!item) {
      return onSave({ action: "add", ...f, 지점들 });
    }
    onSave({
      action: "edit",
      상품코드: item.code,
      지점들,
      changes: {
        상품명: f.상품명.trim(),
        상품분류: f.상품분류,
        판매상태: f.판매중 ? "판매중" : "판매중지",
        결제개월: f.결제개월,
        서비스개월: f.서비스개월,
        총이용개월: 개월 > 0 ? String(개월) : "",
        결제횟수: f.결제횟수,
        서비스횟수: f.서비스횟수,
        총횟수: 횟수 > 0 ? String(횟수) : "",
        현금가: String(num(f.현금가) || ""),
        카드가: String(num(f.카드가) || ""),
        서비스상품: f.서비스상품 ? "Y" : "",
        옵션상품: f.옵션상품 ? "Y" : "",
      },
    });
  }

  const onlyNum = (v: string) => v.replace(/[^0-9]/g, "");

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{item ? "상품 고치기" : "상품 만들기"}</h3>
        {item && <p className="modal-lead">{item.code}</p>}

        <div className="field">
          <label htmlFor="pn">상품 이름</label>
          <input id="pn" className="input" value={f.상품명} autoFocus placeholder="예: 3개월 회원권"
                 onChange={(e) => { set("상품명", e.target.value); setErr(""); }} />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="pk">카테고리</label>
            <select id="pk" className="select" value={f.상품분류}
                    onChange={(e) => set("상품분류", e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ps">판매</label>
            <select id="ps" className="select" value={f.판매중 ? "Y" : "N"}
                    onChange={(e) => set("판매중", e.target.value === "Y")}>
              <option value="Y">판매중</option>
              <option value="N">판매중지</option>
            </select>
          </div>
        </div>

        <h4 className="mini-title">기간 · 횟수</h4>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="p1">결제 개월</label>
            <input id="p1" className="input" inputMode="numeric" value={f.결제개월}
                   onChange={(e) => set("결제개월", onlyNum(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="p2">서비스 개월</label>
            <input id="p2" className="input" inputMode="numeric" value={f.서비스개월}
                   onChange={(e) => set("서비스개월", onlyNum(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="p3">결제 횟수</label>
            <input id="p3" className="input" inputMode="numeric" value={f.결제횟수}
                   onChange={(e) => set("결제횟수", onlyNum(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="p4">서비스 횟수</label>
            <input id="p4" className="input" inputMode="numeric" value={f.서비스횟수}
                   onChange={(e) => set("서비스횟수", onlyNum(e.target.value))} />
          </div>
        </div>
        <p className="stat-note">
          「6+6개월」처럼 덤을 주는 상품은 <b>결제 6 · 서비스 6</b>으로 적습니다.
          회원에게는 합친 <b>{개월 > 0 ? `${개월}개월` : "—"}</b>
          {횟수 > 0 && <> · <b>{횟수}회</b></>}로 나가고, 매출은 결제분만 잡힙니다.
        </p>

        <h4 className="mini-title">가격</h4>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="p5">카드가</label>
            <input id="p5" className="input" inputMode="numeric" value={f.카드가}
                   onChange={(e) => set("카드가", onlyNum(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="p6">현금 · 계좌가</label>
            <input id="p6" className="input" inputMode="numeric" value={f.현금가}
                   onChange={(e) => set("현금가", onlyNum(e.target.value))} />
          </div>
        </div>

        <h4 className="mini-title">파는 지점</h4>
        <div className="pickbox">
          {branches.map((b) => (
            <button key={b.code} type="button"
                    className={`pickone${지점들.includes(b.code) ? " on" : ""}`}
                    onClick={() => {
                      setErr("");
                      set지점((cur) =>
                        cur.includes(b.code) ? cur.filter((c) => c !== b.code) : [...cur, b.code]
                      );
                    }}>
              <span className="nm">{b.name}</span>
            </button>
          ))}
        </div>
        <p className="stat-note">고른 지점의 상품 목록에만 나옵니다.</p>

        <div className="bulk-sec">
          <label className="chk">
            <input type="checkbox" checked={f.서비스상품}
                   onChange={(e) => set("서비스상품", e.target.checked)} />
            <span>
              <b>돈 안 받고 얹어주는 상품</b>
              <em>회원권을 팔 때 덤으로 주는 것입니다. 매출에 잡히지 않습니다.</em>
            </span>
          </label>
          <label className="chk" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={f.옵션상품}
                   onChange={(e) => set("옵션상품", e.target.checked)} />
            <span>
              <b>회원권에 붙는 추가 요금</b>
              <em>24시 이용 · 여성전용처럼 회원권에 얹어 파는 것입니다.</em>
            </span>
          </label>
        </div>

        {err && <div className="alert-bad" style={{ marginTop: 12 }}>{err}</div>}

        {killing && (
          <div className="confirm-box">
            <b>「{item?.name}」을 목록에서 지울까요?</b>
            <p>
              이미 판 이용권과 결제 기록은 그대로 남습니다. 앞으로 팔 수 없게 될 뿐입니다.
              잠시 안 파는 것이라면 <b>판매중지</b>가 낫습니다 — 되살리기 쉽습니다.
            </p>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setKilling(false)}>그만두기</button>
              <button className="btn-danger" disabled={busy}
                      onClick={() => onSave({ action: "del", 상품코드: item!.code })}>
                {busy ? "처리 중…" : "지우기"}
              </button>
            </div>
          </div>
        )}

        <div className="modal-actions">
          {item && can.remove && !killing && (
            <button className="btn-ghost danger" style={{ marginRight: "auto" }}
                    onClick={() => setKilling(true)}>지우기</button>
          )}
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" style={{ marginTop: 0 }} disabled={busy} onClick={save}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
