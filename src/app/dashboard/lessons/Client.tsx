"use client";

/**
 * PT · 수업
 *
 * 하루를 시간표로 본다. 트레이너가 세로줄, 시간이 가로줄이다.
 * 이렇게 두면 "3시에 누가 비어 있나"를 세지 않고 눈으로 본다.
 *
 * 결과 찍기는 수업 칸을 눌러서 한다. 완료·노쇼·취소 세 단추뿐이다.
 * 회차는 완료일 때만 빠진다 — 대표님과 정한 규칙이다.
 */
import { Fragment, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { korDate, today } from "@/lib/time";
import {
  JOIN_STATES, STATE_TONE, KIND_PT, KIND_GROUP, addMinutes, toMinutes,
} from "@/lib/lessonMeta";

type Lesson = {
  id: string; 지점코드: string; 수업구분: string; 상품코드: string;
  트레이너사번: string; 날짜: string; 시작시각: string; 종료시각: string;
  정원: number; 진행상태: string; 메모: string;
};
type Join = {
  id: string; 수업번호: string; 회원번호: string; 이용권번호: string;
  진행상태: string; 차감회차: number; 메모: string;
};
type Person = { id: string; name: string; branch: string };
type Ticket = {
  id: string; 회원번호: string; 상품코드: string;
  잔여횟수: string; 총횟수: string; 종료일: string; 담당트레이너사번: string;
};
type Product = { code: string; name: string; kind: string; count: number };

type Props = {
  me: string;
  myBranch: string;
  lessons: Lesson[];
  joins: Join[];
  trainers: Person[];
  members: Person[];
  tickets: Ticket[];
  products: Product[];
  can: { create: boolean; update: boolean; remove: boolean };
  canSetup: boolean;
  ready: boolean;
  problem: string;
};

const int = (v: string) => {
  const n = Number((v ?? "").toString().replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** 하루를 몇 시부터 몇 시까지 그릴지 — 수업이 있는 시간대에 맞춘다 */
function dayRange(list: Lesson[]): [number, number] {
  let lo = 9;
  let hi = 22;
  list.forEach((l) => {
    const s = toMinutes(l.시작시각);
    const e = toMinutes(l.종료시각 || l.시작시각);
    if (s !== null) lo = Math.min(lo, Math.floor(s / 60));
    if (e !== null) hi = Math.max(hi, Math.ceil(e / 60));
  });
  return [Math.max(0, lo), Math.min(24, Math.max(hi, lo + 4))];
}

function shiftDay(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00+09:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

export default function Client(p: Props) {
  const now = today();
  const [day, setDay] = useState(now);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const memberName = useMemo(
    () => new Map(p.members.map((m) => [m.id, m.name])),
    [p.members]
  );
  const productName = useMemo(
    () => new Map(p.products.map((x) => [x.code, x.name])),
    [p.products]
  );
  const joinsOf = useMemo(() => {
    const map = new Map<string, Join[]>();
    p.joins.forEach((j) => {
      const list = map.get(j.수업번호) ?? [];
      list.push(j);
      map.set(j.수업번호, list);
    });
    return map;
  }, [p.joins]);

  const dayList = useMemo(
    () => p.lessons
      .filter((l) => l.날짜 === day)
      .filter((l) => !onlyMine || l.트레이너사번 === p.me)
      .sort((a, b) => (a.시작시각 || "").localeCompare(b.시작시각 || "")),
    [p.lessons, day, onlyMine, p.me]
  );

  /** 오늘 수업이 있는 트레이너만 세로줄로 세운다. 없으면 나라도 세운다 */
  const columns = useMemo(() => {
    const has = new Set(dayList.map((l) => l.트레이너사번));
    const list = p.trainers.filter((t) => has.has(t.id));
    if (list.length === 0) {
      const meRow = p.trainers.find((t) => t.id === p.me);
      return meRow ? [meRow] : [];
    }
    return list;
  }, [dayList, p.trainers, p.me]);

  // 이 달 트레이너별 실적 — 완료만 센다.
  // 훅은 반드시 이른 return 보다 위에 있어야 한다. 아래에 두면 화면이 갈릴 때 순서가 바뀐다
  const monthStats = useMemo(() => {
    const m = day.slice(0, 7);
    const stat = new Map<string, { done: number; miss: number }>();
    p.lessons.filter((l) => l.날짜.startsWith(m)).forEach((l) => {
      const s = stat.get(l.트레이너사번) ?? { done: 0, miss: 0 };
      (joinsOf.get(l.id) ?? []).forEach((j) => {
        if (j.진행상태 === "완료") s.done += 1;
        if (j.진행상태 === "노쇼") s.miss += 1;
      });
      stat.set(l.트레이너사번, s);
    });
    return stat;
  }, [p.lessons, joinsOf, day]);

  async function send(payload: any) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리하지 못했습니다.");
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
          <div><h1 className="page-title">PT · 수업</h1>
            <p className="page-sub">시트를 읽지 못했습니다</p></div>
        </div>
        <div className="alert-bad" style={{ lineHeight: 1.7 }}>{p.problem}</div>
      </>
    );
  }

  if (!p.ready) {
    return (
      <>
        <div className="page-head">
          <div><h1 className="page-title">PT · 수업</h1>
            <p className="page-sub">아직 준비되지 않았습니다</p></div>
        </div>
        <SetupTab can={p.canSetup} />
      </>
    );
  }

  // 트레이너가 한 명도 없으면 시간표를 그릴 세로줄이 없다.
  // "수업이 없습니다"로 보이면 원인을 못 찾으므로 무엇을 해야 하는지 적는다
  if (p.trainers.length === 0) {
    return (
      <>
        <div className="page-head">
          <div><h1 className="page-title">PT · 수업</h1>
            <p className="page-sub">수업을 맡을 사람이 아직 없습니다</p></div>
        </div>
        <div className="setup">
          <div>
            <b>「트레이너」로 체크된 직원이 없습니다</b>
            <p>
              <b>직원 관리</b>에서 직원을 열고 <b>트레이너</b>를 체크하면, 그 사람이 이 시간표에
              나오고 PT·수업을 쓸 수 있게 됩니다. 직급과는 상관없이 사람마다 정합니다.
            </p>
          </div>
          {p.canSetup && <a className="btn-dark" href="/dashboard/staff">직원 관리로 가기</a>}
        </div>
      </>
    );
  }

  const [lo, hi] = dayRange(dayList);
  const hours = Array.from({ length: hi - lo }, (_, i) => lo + i);
  const openLesson = dayList.find((l) => l.id === open);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">PT · 수업</h1>
          <p className="page-sub">수업을 미리 잡아두고, 끝나면 결과를 찍습니다 · 회차는 완료일 때만 빠집니다</p>
        </div>
        <div className="filter-right">
          <button className="icon-btn" onClick={() => setDay(shiftDay(day, -1))} aria-label="어제">‹</button>
          <input className="input" type="date" value={day} style={{ width: 148 }}
                 onChange={(e) => setDay(e.target.value || now)} />
          <button className="icon-btn" onClick={() => setDay(shiftDay(day, 1))} aria-label="내일">›</button>
          {day !== now && (
            <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setDay(now)}>오늘</button>
          )}
        </div>
      </div>

      <div className="pick-row">
        <button className={`mini-tab${onlyMine ? "" : " on"}`} onClick={() => setOnlyMine(false)}>전체</button>
        <button className={`mini-tab${onlyMine ? " on" : ""}`} onClick={() => setOnlyMine(true)}>내 수업</button>
        <span className="spacer" />
        {p.can.create && (
          <button className="btn-dark" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> 수업 잡기
          </button>
        )}
      </div>

      {msg && <div className="alert-bad" style={{ marginBottom: 14 }}>{msg}</div>}

      <p className="page-sub" style={{ margin: "2px 0 12px" }}>{korDate(day)}</p>

      {columns.length === 0 ? (
        <div className="norow">이 날에 잡힌 수업이 없습니다</div>
      ) : (
        <div className="tt-wrap">
          <div className="tt" style={{ gridTemplateColumns: `54px repeat(${columns.length}, minmax(132px, 1fr))` }}>
            <div className="tt-corner" />
            {columns.map((t) => {
              const s = monthStats.get(t.id);
              return (
                <div className="tt-head" key={t.id}>
                  <b>{t.name}</b>
                  <span>{s ? `이 달 ${s.done}회` : "이 달 0회"}</span>
                </div>
              );
            })}

            {hours.map((h) => (
              <Fragment key={h}>
                <div className="tt-hour">{h}시</div>
                {columns.map((t) => {
                  const cell = dayList.filter(
                    (l) => l.트레이너사번 === t.id && Math.floor((toMinutes(l.시작시각) ?? -60) / 60) === h
                  );
                  return (
                    <div className="tt-cell" key={t.id}>
                      {cell.map((l) => {
                        const js = joinsOf.get(l.id) ?? [];
                        const done = js.filter((j) => j.진행상태 === "완료").length;
                        const settled = js.every((j) => j.진행상태 !== "예정");
                        const tone = l.진행상태 === "취소" ? "gone" : settled ? "done" : "wait";
                        return (
                          <button className={`tt-item ${tone}`} key={l.id} onClick={() => setOpen(l.id)}>
                            <span className="tm">{l.시작시각}</span>
                            <span className="nm">
                              {l.수업구분 === KIND_GROUP
                                ? `${productName.get(l.상품코드) ?? "그룹수업"} ${js.length}명`
                                : memberName.get(js[0]?.회원번호) ?? "회원 미지정"}
                            </span>
                            {settled && <span className="mk">{done}회 완료</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {openLesson && (
        <LessonBox
          lesson={openLesson}
          joins={joinsOf.get(openLesson.id) ?? []}
          trainer={p.trainers.find((t) => t.id === openLesson.트레이너사번)?.name ?? openLesson.트레이너사번}
          memberName={memberName}
          productName={productName}
          tickets={p.tickets}
          canEdit={openLesson.트레이너사번 === p.me || p.can.update}
          canRemove={p.can.remove || p.can.update}
          busy={busy}
          onMark={(참석번호, 상태) => send({ action: "mark", 수업번호: openLesson.id, 참석번호, 상태 })}
          onDelete={() => send({ action: "delete", 수업번호: openLesson.id })}
          onClose={() => setOpen(null)}
        />
      )}

      {adding && (
        <AddBox
          day={day}
          me={p.me}
          myBranch={p.myBranch}
          trainers={p.trainers}
          members={p.members}
          tickets={p.tickets}
          products={p.products}
          canPickTrainer={p.can.create}
          busy={busy}
          onSave={(payload) => send({ action: "create", ...payload })}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}

/* ── 수업 한 칸 열기 ───────────────────────── */

function LessonBox(props: {
  lesson: Lesson;
  joins: Join[];
  trainer: string;
  memberName: Map<string, string>;
  productName: Map<string, string>;
  tickets: Ticket[];
  canEdit: boolean;
  canRemove: boolean;
  busy: boolean;
  onMark: (joinId: string, state: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const l = props.lesson;
  const [confirming, setConfirming] = useState(false);
  const left = new Map(props.tickets.map((t) => [t.id, t]));

  return (
    <div className="modal-back" onClick={props.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{l.시작시각}{l.종료시각 ? `–${l.종료시각}` : ""} · {props.trainer}</h3>
        <p className="page-sub" style={{ margin: "0 0 14px" }}>
          {korDate(l.날짜)} · {l.수업구분 === KIND_GROUP
            ? `${props.productName.get(l.상품코드) ?? "그룹수업"} (정원 ${l.정원}명)`
            : "1:1 PT"}
          {l.메모 && ` · ${l.메모}`}
        </p>

        {/*
          한 명씩 손대는 자리라 표가 아니라 목록이다.
          표는 서로 견줄 때 쓰고, 목록은 하나씩 처리할 때 쓴다.
          단추를 이름 아래로 내리면 휴대폰에서도 안 잘린다.
        */}
        <div className="lwrap">
          {props.joins.length === 0 && (
            <div className="lrow"><span className="dim">참석자가 없습니다</span></div>
          )}
          {props.joins.map((j) => {
            const t = left.get(j.이용권번호);
            return (
              <div className="jrow" key={j.id}>
                <div className="jtop">
                  <b>{props.memberName.get(j.회원번호) ?? j.회원번호}</b>
                  <span>
                    {t ? `남은 ${int(t.잔여횟수)}회 / 전체 ${int(t.총횟수)}회` : "이용권 없음"}
                  </span>
                </div>
                <div className="mk-row">
                  {JOIN_STATES.map((s) => (
                    <button
                      key={s}
                      className={`mk-btn ${STATE_TONE[s]}${j.진행상태 === s ? " on" : ""}`}
                      disabled={!props.canEdit || props.busy}
                      onClick={() => props.onMark(j.id, s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="page-sub" style={{ margin: "12px 0 0" }}>
          <b>완료</b>로 찍을 때만 회차가 1 빠집니다. 노쇼·취소는 회차가 그대로입니다.
          잘못 찍었으면 다시 눌러 되돌릴 수 있습니다.
        </p>

        <div className="modal-actions">
          {props.canRemove && (
            confirming ? (
              <button className="btn-danger" style={{ marginTop: 0, marginRight: "auto" }}
                      disabled={props.busy} onClick={props.onDelete}>
                정말 지웁니다
              </button>
            ) : (
              <button className="btn-ghost" style={{ marginTop: 0, marginRight: "auto" }}
                      onClick={() => setConfirming(true)}>
                수업 지우기
              </button>
            )
          )}
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={props.onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

/* ── 수업 잡기 ─────────────────────────────── */

function AddBox(props: {
  day: string;
  me: string;
  myBranch: string;
  trainers: Person[];
  members: Person[];
  tickets: Ticket[];
  products: Product[];
  canPickTrainer: boolean;
  busy: boolean;
  onSave: (payload: any) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<string>(KIND_PT);
  const [trainer, setTrainer] = useState(props.me);
  const [date, setDate] = useState(props.day);
  const [start, setStart] = useState("");
  /*
    끝나는 시각은 시작 + 50분을 먼저 채워두되, 손대면 그 값을 그대로 쓴다.
    수업료를 시간으로 계산하게 되면 이 값이 곧 돈이라, 짐작한 값을 쓰면 안 된다.
  */
  const [end, setEnd] = useState("");
  const [touched, setTouched] = useState(false);
  const [product, setProduct] = useState("");
  const [cap, setCap] = useState(8);
  const [memo, setMemo] = useState("");
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState<{ 회원번호: string; 이용권번호: string }[]>([]);
  const [err, setErr] = useState("");

  const usable = useMemo(() => {
    const codes = new Set(
      props.products.filter((x) => x.kind === kind).map((x) => x.code)
    );
    return props.tickets
      .filter((t) => codes.has(t.상품코드))
      .filter((t) => int(t.잔여횟수) > 0)
      .filter((t) => !t.종료일 || t.종료일 >= date);
  }, [props.tickets, props.products, kind, date]);

  const hits = useMemo(() => {
    const q = find.trim();
    const byMember = new Map(props.members.map((m) => [m.id, m]));
    const rows = usable
      .map((t) => ({ t, m: byMember.get(t.회원번호) }))
      .filter((x) => x.m)
      .filter((x) => !q || x.m.name.includes(q));
    return q ? rows.slice(0, 12) : rows.slice(0, 8);
  }, [usable, props.members, find]);

  const single = kind === KIND_PT;
  const limit = single ? 1 : Math.max(1, cap);

  function toggle(회원번호: string, 이용권번호: string) {
    setErr("");
    setPicked((prev) => {
      const has = prev.some((x) => x.이용권번호 === 이용권번호);
      if (has) return prev.filter((x) => x.이용권번호 !== 이용권번호);
      if (prev.length >= limit) {
        if (single) return [{ 회원번호, 이용권번호 }];
        setErr(`정원이 ${limit}명입니다.`);
        return prev;
      }
      return [...prev, { 회원번호, 이용권번호 }];
    });
  }

  function save() {
    if (!start) return setErr("시작 시각을 정해주세요.");
    if (!end) return setErr("끝나는 시각을 정해주세요.");
    if (toMinutes(end) <= toMinutes(start)) {
      return setErr("끝나는 시각이 시작보다 빠릅니다.");
    }
    if (picked.length === 0) return setErr("회원을 한 명 이상 골라주세요.");
    props.onSave({
      지점코드: props.myBranch,
      수업구분: kind,
      상품코드: product || usable.find((t) => t.id === picked[0].이용권번호)?.상품코드 || "",
      트레이너사번: trainer,
      날짜: date,
      시작시각: start,
      종료시각: end,
      정원: limit,
      메모: memo,
      members: picked,
    });
  }

  const nameOf = new Map(props.members.map((m) => [m.id, m.name]));

  return (
    <div className="modal-back" onClick={props.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>수업 잡기</h3>

        <div className="pick-row" style={{ marginBottom: 14 }}>
          {[KIND_PT, KIND_GROUP].map((k) => (
            <button key={k} className={`mini-tab${kind === k ? " on" : ""}`}
                    onClick={() => { setKind(k); setPicked([]); setErr(""); }}>
              {k === KIND_PT ? "1:1 PT" : "그룹수업"}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="ld">날짜</label>
            <input id="ld" className="input" type="date" value={date}
                   onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="lt">시작 시각</label>
            <input id="lt" className="input" type="time" value={start}
                   onChange={(e) => {
                     setStart(e.target.value);
                     if (!touched) setEnd(addMinutes(e.target.value, 50));
                   }} />
          </div>
          <div className="field">
            <label htmlFor="le">끝나는 시각</label>
            <input id="le" className="input" type="time" value={end}
                   onChange={(e) => { setEnd(e.target.value); setTouched(true); }} />
          </div>
          <div className="field">
            <label htmlFor="lr">담당 트레이너</label>
            <select id="lr" className="select" value={trainer} disabled={!props.canPickTrainer}
                    onChange={(e) => setTrainer(e.target.value)}>
              {props.trainers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {!single && (
            <>
              <div className="field">
                <label htmlFor="lp">수업 상품</label>
                <select id="lp" className="select" value={product}
                        onChange={(e) => setProduct(e.target.value)}>
                  <option value="">고르지 않음</option>
                  {props.products.filter((x) => x.kind === KIND_GROUP).map((x) => (
                    <option key={x.code} value={x.code}>{x.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="lc">정원</label>
                <input id="lc" className="input" type="number" min={1} max={40} value={cap}
                       onChange={(e) => setCap(Number(e.target.value) || 1)} />
              </div>
            </>
          )}
        </div>

        <div className="field">
          <label htmlFor="lf">회원 고르기 {single ? "(한 명)" : `(${picked.length} / ${limit}명)`}</label>
          <input id="lf" className="input" value={find} placeholder="이름으로 찾기"
                 onChange={(e) => setFind(e.target.value)} />
        </div>

        <div className="pickbox">
          {hits.length === 0 && (
            <div className="dim" style={{ padding: "10px 2px", fontSize: 12.5 }}>
              쓸 수 있는 이용권이 없습니다. 남은 회차가 있고 만료되지 않은 이용권만 나옵니다.
            </div>
          )}
          {hits.map(({ t, m }) => {
            const on = picked.some((x) => x.이용권번호 === t.id);
            return (
              <button key={t.id} className={`pickone${on ? " on" : ""}`}
                      onClick={() => toggle(t.회원번호, t.id)}>
                <span className="nm">{m.name}</span>
                <span className="dim">남은 {int(t.잔여횟수)}회</span>
                {t.종료일 && <span className="dim">~{t.종료일.slice(5)}</span>}
              </button>
            );
          })}
        </div>

        {picked.length > 0 && (
          <p className="page-sub" style={{ margin: "10px 0 0" }}>
            고른 사람: {picked.map((x) => nameOf.get(x.회원번호) ?? x.회원번호).join(" · ")}
          </p>
        )}

        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="lm">메모</label>
          <input id="lm" className="input" value={memo} placeholder="선택"
                 onChange={(e) => setMemo(e.target.value)} />
        </div>

        {err && <div className="alert-bad" style={{ marginTop: 10 }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={props.onClose}>취소</button>
          <button className="btn-primary" style={{ marginTop: 0 }} disabled={props.busy} onClick={save}>
            {props.busy ? "잡는 중…" : "수업 잡기"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 수업 탭이 아직 없을 때 ────────────────── */

function SetupTab({ can }: { can: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");

  if (done) {
    return (
      <div className="setup done">
        <div>{done} <b>새로고침</b>하면 PT·수업을 쓸 수 있습니다.</div>
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
        body: JSON.stringify({ set: "수업" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "만들지 못했습니다.");
      setDone(data.added?.length ? `${data.added.join(" · ")} 을(를) 만들었습니다.` : "이미 있었습니다.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <div>
        <b>수업 탭이 시트에 없습니다</b>
        <p>
          수업을 적어둘 자리가 필요합니다. 누르면 구글 시트에 <b>수업</b> 탭과{" "}
          <b>수업참석</b> 탭을 만듭니다. 이미 있으면 건너뜁니다.
        </p>
        {msg && <p className="err">{msg}</p>}
      </div>
      {can ? (
        <button className="btn-dark" onClick={run} disabled={busy}>
          {busy ? "만드는 중…" : "수업 탭 만들기"}
        </button>
      ) : (
        <span className="dim" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
          대표만 만들 수 있습니다
        </span>
      )}
    </div>
  );
}
