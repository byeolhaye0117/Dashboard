"use client";

/**
 * 근태 화면
 *
 * 맨 위는 오늘 나 — 버튼 두 개면 끝나야 한다. 출근길에 오래 붙잡지 않는다.
 * 그 아래는 이 달 한 장 — 날짜 × 직원 격자로 한 달을 통째로 본다.
 * 빠진 칸이 눈에 띄어야 "누가 안 찍었나"를 바로 안다.
 */
import { useEffect, useMemo, useState } from "react";
import { today, korDate } from "@/lib/time";
import { WORK_KINDS, KIND_MARK as MARK, toMinutes, hourText } from "@/lib/attendanceMeta";

type Row = {
  id: string;
  사번: string;
  지점코드: string;
  날짜: string;
  회차: number;
  출근시각: string;
  퇴근시각: string;
  휴게시작: string;
  휴게분: string;
  휴게내역: string;
  근무구분: string;
  지각분: string;
  조퇴분: string;
  메모: string;
};
type Person = {
  id: string; name: string; branch: string;
  baseTime: string; outTime: string; restMin: string;
  /** 휴게가 날마다 다른 사람인가 */
  restVary: boolean;
};

/**
 * 하루치를 한 덩어리로 묶는다
 *
 * 한 줄이 한 번의 근무 구간이라 하루가 여러 줄일 수 있다.
 * 일한 시간에서 휴게를 뺀다. 그날 찍은 휴게가 없으면 직원의 고정 휴게분을 쓴다.
 */
function foldDay(list: Row[], restMin: string, vary: boolean) {
  const rounds = list.slice().sort((a, b) => a.회차 - b.회차);
  const gross = rounds.reduce((s, r) => {
    const a = toMinutes(r.출근시각);
    const b = toMinutes(r.퇴근시각);
    return s + (a !== null && b !== null && b > a ? b - a : 0);
  }, 0);
  const punched = rounds.reduce((s, r) => s + (Number(r.휴게분) || 0), 0);
  const fixedMin = vary ? 0 : Number(restMin) || 0;
  // 찍은 휴게가 있으면 그걸 쓴다. 없으면 고정분. 둘 다 없으면 0
  const rest = punched > 0 ? punched : gross > 0 ? fixedMin : 0;
  const head = rounds[0];
  const openRest = rounds.find((r) => r.휴게시작)?.휴게시작 ?? "";
  return {
    rounds,
    head,
    kind: head?.근무구분 ?? "",
    gross,
    rest,
    /** 찍어서 쌓인 휴게 (고정분은 뺀 값) */
    punched,
    /** 고정 휴게분을 쓰고 있는가 */
    fixed: punched === 0 && rest > 0,
    spans: rounds.map((r) => r.휴게내역).filter(Boolean).join(" · "),
    openRest,
    net: Math.max(0, gross - rest),
    resting: Boolean(openRest),
    working: rounds.some((r) => r.출근시각 && !r.퇴근시각),
    started: rounds.some((r) => r.출근시각),
  };
}

type Props = {
  me: string;
  rows: Row[];
  people: Person[];
  branches: { code: string; name: string }[];
  canEdit: boolean;
  canSetup: boolean;
  ready: boolean;
  problem: string;
};

function shiftMonth(m: string, d: number): string {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm - 1 + d, 1)).toISOString().slice(0, 7);
}

function daysOf(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const weekdayOf = (d: string) => new Date(`${d}T00:00:00+09:00`).getDay();

export default function Client(p: Props) {
  const now = today();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [edit, setEdit] = useState<{ 사번: string; 날짜: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  /** 휴게 중일 때 "몇 분째"를 흐르게 하려고 1분마다 다시 그린다 */
  const [tick, setTick] = useState(0);
  const [confirmOut, setConfirmOut] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const days = useMemo(() => daysOf(month), [month]);
  const personOf = (id: string) => p.people.find((x) => x.id === id);

  /** 사람·날짜별로 하루치를 묶어 둔다 — 하루가 여러 줄일 수 있다 */
  const byKey = useMemo(() => {
    const bag: Record<string, Row[]> = {};
    p.rows.forEach((r) => (bag[`${r.사번}|${r.날짜}`] ??= []).push(r));
    const m: Record<string, ReturnType<typeof foldDay>> = {};
    Object.entries(bag).forEach(([k, list]) => {
      const who = personOf(k.split("|")[0]);
      m[k] = foldDay(list, who?.restMin ?? "", Boolean(who?.restVary));
    });
    return m;
  }, [p.rows, p.people]);

  const meToday = byKey[`${p.me}|${now}`];
  const meSelf = p.people.find((x) => x.id === p.me);

  /** 이 달 내 근태 셈 */
  const mine = useMemo(() => {
    const bag: Record<string, Row[]> = {};
    p.rows
      .filter((r) => r.사번 === p.me && r.날짜.startsWith(month))
      .forEach((r) => (bag[r.날짜] ??= []).push(r));
    const folds = Object.values(bag).map((list) =>
      foldDay(list, meSelf?.restMin ?? "", Boolean(meSelf?.restVary))
    );
    const count = (k: string) => folds.filter((f) => f.kind === k).length;
    return {
      지각: count("지각"),
      휴무: count("휴무") + count("연차") + count("반차"),
      days: folds.filter((f) => f.started).length,
      net: folds.reduce((s, f) => s + f.net, 0),
      rest: folds.reduce((s, f) => s + f.rest, 0),
      lateMin: folds.reduce((s, f) => s + (Number(f.head?.지각분) || 0), 0),
    };
  }, [p.rows, p.me, month, meSelf]);

  /** 휴게를 몇 분째 하고 있는지 — 1분마다 다시 센다 */
  const restingFor = useMemo(() => {
    if (!meToday?.openRest) return 0;
    const from = toMinutes(meToday.openRest);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    return from === null ? 0 : Math.max(0, nowMin - from);
  }, [meToday?.openRest, tick]);

  /**
   * 휴게 없이 오래 일했는가
   *
   * 근로기준법은 4시간 일하면 30분 쉬게 한다. 막지는 않고 물어만 본다.
   * 정말 못 쉰 날도 있는데 퇴근을 막으면 거짓 기록을 만들게 된다.
   */
  const needRest = Boolean(meToday && meToday.rest === 0 && meToday.gross >= 240);

  /** 나는 휴게를 찍는 사람인가 */
  const vary = Boolean(meSelf?.restVary);

  async function punch(action: "in" | "out" | "break-in" | "break-out", rest = 0) {
    setBusy(action);
    setMsg("");
    setConfirmOut(false);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rest }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "찍지 못했습니다.");
      location.reload();
    } catch (e: any) {
      setMsg(e.message);
      setBusy("");
    }
  }

  if (p.problem) {
    return (
      <>
        <div className="page-head">
          <div><h1 className="page-title">근태</h1>
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
          <div><h1 className="page-title">근태</h1>
            <p className="page-sub">아직 준비되지 않았습니다</p></div>
        </div>
        <SetupTab can={p.canSetup} />
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">근태</h1>
          <p className="page-sub">출퇴근은 본인이 찍습니다 · 시각은 서버가 적습니다</p>
        </div>
        <div className="filter-right">
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))}
                  aria-label="지난달">‹</button>
          <select className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
            {Array.from({ length: 13 }, (_, i) => shiftMonth(now.slice(0, 7), -i)).map((m) => (
              <option key={m} value={m}>{m.slice(0, 4)}년 {Number(m.slice(5, 7))}월</option>
            ))}
          </select>
          <button className="icon-btn" disabled={month >= now.slice(0, 7)}
                  onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음달">›</button>
        </div>
      </div>

      {/* 오늘 나 — 근무 구간이 여럿일 수 있다 */}
      <div className="punch">
        <div className="pk-me">
          <span className="lb">{korDate(now)}</span>
          <b className="nm">{meSelf?.name ?? ""}</b>
          <span className="base">
            {meSelf?.baseTime || meSelf?.outTime
              ? `기준 ${meSelf?.baseTime || "—"} ~ ${meSelf?.outTime || "—"}`
              : "기준 시각 없음 · 지각·조퇴는 표시되지 않습니다"}
            {vary
              ? " · 휴게는 찍는 대로"
              : Number(meSelf?.restMin) > 0
                ? ` · 휴게 ${meSelf?.restMin}분 자동`
                : ""}
          </span>
        </div>

        <div className="pk-time">
          {(meToday?.rounds ?? []).map((r) => (
            <div key={r.id}>
              <span>{(meToday?.rounds.length ?? 0) > 1 ? `${r.회차}회차` : "출근 · 퇴근"}</span>
              <b className="on num">{r.출근시각 || "—"} ~ {r.퇴근시각 || "—"}</b>
            </div>
          ))}
          {!meToday?.started && (
            <div><span>출근 · 퇴근</span><b className="num">— ~ —</b></div>
          )}
          <div>
            <span>일한 시간</span>
            <b className={meToday?.net ? "on num" : "num"}>
              {meToday?.net ? hourText(meToday.net) : "—"}
            </b>
          </div>
          {Number(meToday?.rest) > 0 && (
            <div><span>휴게</span><b className="num">{hourText(meToday!.rest)}</b></div>
          )}
          {meToday?.kind === "지각" && (
            <span className="pill bad">
              {Number(meToday.head?.지각분) > 0 ? `${meToday.head?.지각분}분 지각` : "지각"}
            </span>
          )}
          {meToday?.resting && (
            <span className="pill warn">휴게 중 {restingFor}분째</span>
          )}
        </div>

        <div className="pk-act">
          {meToday?.working ? (
            <>
              {/* 휴게 버튼은 날마다 다른 사람에게만 — 안 눌러도 되는 버튼은 실수를 부른다 */}
              {vary && (
                <button className={meToday.resting ? "btn-dark big" : "btn-rest big"}
                        onClick={() => punch(meToday.resting ? "break-out" : "break-in")}
                        disabled={Boolean(busy)}>
                  {meToday.resting ? "휴게 끝내고 복귀" : "휴게 시작"}
                </button>
              )}
              {!meToday.resting && (
                <button className={vary ? "btn-ghost tall" : "btn-dark big"}
                        onClick={() => (needRest ? setConfirmOut(true) : punch("out"))}
                        disabled={Boolean(busy)}>
                  {busy === "out" ? "찍는 중…" : "퇴근"}
                </button>
              )}
            </>
          ) : (
            <button className="btn-dark big" onClick={() => punch("in")} disabled={Boolean(busy)}>
              {busy === "in" ? "찍는 중…" : meToday?.started ? "다시 출근" : "출근"}
            </button>
          )}
        </div>
      </div>

      {/* 오늘 휴게 — 출근 전에도 어떤 방식인지 알 수 있어야 한다 */}
      <div className={`rest-strip${vary ? " vary" : ""}`}>
        {vary ? (
          Number(meToday?.punched) > 0 ? (
            <span>
              오늘 휴게 <b>{hourText(meToday!.punched)}</b>
              {meToday?.resting && " · 지금 쉬는 중"}
            </span>
          ) : (
            <span>
              오늘 휴게 <b>없음</b>
              {meToday?.working ? " · 쉬실 때 「휴게 시작」을 눌러주세요" : ""}
            </span>
          )
        ) : Number(meSelf?.restMin) > 0 ? (
          <span>휴게 <b>{meSelf?.restMin}분</b>이 일한 시간에서 매일 자동으로 빠집니다</span>
        ) : (
          <span>휴게 <b>없음</b>으로 되어 있습니다</span>
        )}
        <span className="spacer" />
        <span className="dim">
          {vary ? meToday?.spans || "휴게 시작 · 끝을 찍는 사람" : "직원 관리에서 바꿉니다"}
        </span>
      </div>

      {/* 오래 일했는데 휴게가 없을 때 — 막지 않고 알린다 */}
      {confirmOut && (
        <div className="warnbox">
          <div>
            <b>{hourText(meToday?.gross ?? 0)}을 일했는데 휴게 기록이 없습니다.</b>
            <p>쉬셨다면 휴게를 적어주세요. 정말 못 쉬셨다면 그대로 퇴근하셔도 됩니다.</p>
          </div>
          <span className="spacer" />
          <button className="btn-ghost" onClick={() => punch("out", 30)} disabled={Boolean(busy)}>
            휴게 30분 적고 퇴근
          </button>
          <button className="btn-dark" onClick={() => punch("out")} disabled={Boolean(busy)}>
            그대로 퇴근
          </button>
        </div>
      )}

      {msg && <div className="alert-bad">{msg}</div>}

      {/* 이 달 내 근태 */}
      <div className="tiles four" style={{ marginTop: 12 }}>
        <div className="tile">
          <span className="lb">나온 날</span>
          <b className="vl num">{mine.days}일</b>
          <span className="sub">이 달 기준</span>
        </div>
        <div className="tile">
          <span className="lb">일한 시간</span>
          <b className="vl num">{hourText(mine.net)}</b>
          <span className="sub">
            {mine.rest > 0 ? `휴게 ${hourText(mine.rest)} 뺀 시간` : "휴게 없음"}
          </span>
        </div>
        <div className="tile">
          <span className="lb">지각</span>
          <b className={`vl num${mine.지각 > 0 ? " bad" : ""}`}>{mine.지각}회</b>
          <span className="sub">{mine.lateMin > 0 ? `모두 ${mine.lateMin}분` : "없음"}</span>
        </div>
        <div className="tile">
          <span className="lb">쉰 날</span>
          <b className="vl num">{mine.휴무}일</b>
          <span className="sub">휴무 · 연차 · 반차</span>
        </div>
      </div>

      {/* 한 달 격자 */}
      <h2 className="sec-title">{Number(month.slice(5, 7))}월 근태표</h2>
      <p className="sec-sub">
        빈 칸은 아무 기록이 없는 날입니다
        {p.canEdit && " · 칸을 누르면 고칩니다"}
      </p>
      <div className="table-wrap">
        <table className="grid cal" style={{ minWidth: 60 + days.length * 26 }}>
          <thead>
            <tr>
              <th className="sticky">직원</th>
              {days.map((d) => {
                const w = weekdayOf(d);
                return (
                  <th key={d} className={`dcol${w === 0 ? " sun" : w === 6 ? " sat" : ""}`}>
                    <span>{Number(d.slice(8))}</span>
                    <em>{WEEK[w]}</em>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {p.people.map((s) => (
              <tr key={s.id}>
                <td className="sticky"><span className="nm">{s.name}</span></td>
                {days.map((d) => {
                  const f = byKey[`${s.id}|${d}`];
                  const kind = f?.kind || "";
                  const twice = (f?.rounds.length ?? 0) > 1;
                  return (
                    <td key={d}
                        className={`cell k-${kind || "none"}${p.canEdit ? " hit" : ""}`}
                        title={
                          f
                            ? [
                                `${korDate(d)} ${s.name}`,
                                kind || "-",
                                ...f.rounds.map(
                                  (r) => `${r.회차}회차 ${r.출근시각 || "-"} ~ ${r.퇴근시각 || "-"}`
                                ),
                                f.rest > 0 ? `휴게 ${hourText(f.rest)}` : "",
                                f.net > 0 ? `일한 시간 ${hourText(f.net)}` : "",
                              ]
                                .filter(Boolean)
                                .join("\n")
                            : `${korDate(d)} ${s.name}\n기록 없음`
                        }
                        onClick={() => p.canEdit && setEdit({ 사번: s.id, 날짜: d })}>
                      {MARK[kind] ?? ""}
                      {twice && <em className="twice">2</em>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="legrow">
          {WORK_KINDS.map((k) => (
            <span key={k}><i className={`km k-${k}`}>{MARK[k]}</i>{k}</span>
          ))}
        </div>
      </div>

      {edit && (
        <EditBox
          person={p.people.find((x) => x.id === edit.사번)!}
          day={edit.날짜}
          rounds={byKey[`${edit.사번}|${edit.날짜}`]?.rounds ?? []}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}

/* ── 조각들 ────────────────────────────────── */

/** 근태 탭이 아직 없을 때 */
function SetupTab({ can }: { can: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");

  if (done) {
    return (
      <div className="setup done">
        <div>{done} <b>새로고침</b>하면 근태를 쓸 수 있습니다.</div>
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
        body: JSON.stringify({ set: "근태" }),
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
        <b>근태 탭이 시트에 없습니다</b>
        <p>
          출퇴근을 적어둘 자리가 필요합니다. 누르면 구글 시트에 <b>근태</b> 탭을 만들고,
          직원 탭에 <b>출근기준시각</b> 칸을 더합니다. 이미 있으면 건너뜁니다.
        </p>
        {msg && <p className="err">{msg}</p>}
      </div>
      {can ? (
        <button className="btn-dark" onClick={run} disabled={busy}>
          {busy ? "만드는 중…" : "근태 탭 만들기"}
        </button>
      ) : (
        <span className="dim" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
          대표만 만들 수 있습니다
        </span>
      )}
    </div>
  );
}

/** 한 칸 고치기 — 점장·대표 */
function EditBox({ person, day, rounds, onClose }: {
  person: Person;
  day: string;
  /** 그날의 근무 구간들. 오전·저녁이면 둘이다 */
  rounds: Row[];
  onClose: () => void;
}) {
  // 고칠 회차를 먼저 고른다. 없던 회차를 고르면 새로 만들어진다
  const [round, setRound] = useState(rounds[0]?.회차 ?? 1);
  const row = rounds.find((r) => r.회차 === round);
  const [f, setF] = useState({
    근무구분: rounds[0]?.근무구분 ?? "",
    출근시각: row?.출근시각 ?? "",
    퇴근시각: row?.퇴근시각 ?? "",
    휴게분: row?.휴게분 ?? "",
    메모: row?.메모 ?? "",
  });

  /** 회차를 바꾸면 그 회차 값으로 갈아 끼운다 */
  const pick = (n: number) => {
    const r = rounds.find((x) => x.회차 === n);
    setRound(n);
    setF({
      근무구분: rounds[0]?.근무구분 ?? "",
      출근시각: r?.출근시각 ?? "",
      퇴근시각: r?.퇴근시각 ?? "",
      휴게분: r?.휴게분 ?? "",
      메모: r?.메모 ?? "",
    });
  };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "patch",
          사번: person.id,
          날짜: day,
          회차: round,
          // 그날 판정은 첫 줄에만 적는다. 회차 2를 고칠 땐 건드리지 않는다
          changes: round === 1 ? f : { 출근시각: f.출근시각, 퇴근시각: f.퇴근시각, 휴게분: f.휴게분, 메모: f.메모 },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      location.reload();
    } catch (e: any) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{person.name} · {korDate(day)}</h3>

        <div className="tab-bar" style={{ marginBottom: 12 }}>
          {[1, 2].map((n) => (
            <button key={n} type="button"
                    className={`mini-tab${round === n ? " on" : ""}`}
                    onClick={() => pick(n)}>
              {n}회차{!rounds.some((r) => r.회차 === n) && n > 1 ? " (없음)" : ""}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <div className="field full" style={{ display: round === 1 ? "block" : "none" }}>
            <label>근무 구분</label>
            <select className="input" value={f.근무구분} onChange={(e) => set("근무구분", e.target.value)}>
              <option value="">기록 없음</option>
              {WORK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="field">
            <label>출근</label>
            <input className="input" type="time" value={f.출근시각}
                   onChange={(e) => set("출근시각", e.target.value)} />
          </div>
          <div className="field">
            <label>퇴근</label>
            <input className="input" type="time" value={f.퇴근시각}
                   onChange={(e) => set("퇴근시각", e.target.value)} />
          </div>
          <div className="field">
            <label>휴게 (분)</label>
            <input className="input" inputMode="numeric" value={f.휴게분} placeholder={person.restMin || "0"}
                   onChange={(e) => set("휴게분", e.target.value)} />
          </div>
          <div className="field full">
            <label>메모</label>
            <input className="input" value={f.메모} placeholder="사유를 적어두면 나중에 압니다"
                   onChange={(e) => set("메모", e.target.value)} />
          </div>
        </div>

        <p className="stat-note">
          오전에 갔다 저녁에 다시 온 날은 <b>2회차</b>에 적습니다.
          휴게를 비워두면 이 직원의 고정 휴게
          {Number(person.restMin) > 0 ? ` ${person.restMin}분` : "(없음)"}을 뺍니다.
        </p>

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
