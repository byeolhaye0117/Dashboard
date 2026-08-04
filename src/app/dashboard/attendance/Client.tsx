"use client";

/**
 * 근태 화면
 *
 * 맨 위는 오늘 나 — 버튼 두 개면 끝나야 한다. 출근길에 오래 붙잡지 않는다.
 * 그 아래는 이 달 한 장 — 날짜 × 직원 격자로 한 달을 통째로 본다.
 * 빠진 칸이 눈에 띄어야 "누가 안 찍었나"를 바로 안다.
 */
import { useMemo, useState } from "react";
import { today, korDate } from "@/lib/time";
import { WORK_KINDS, KIND_MARK as MARK } from "@/lib/attendanceMeta";

type Row = {
  id: string;
  사번: string;
  지점코드: string;
  날짜: string;
  출근시각: string;
  퇴근시각: string;
  근무구분: string;
  지각분: string;
  메모: string;
};
type Person = { id: string; name: string; branch: string; baseTime: string };

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

  const days = useMemo(() => daysOf(month), [month]);
  const byKey = useMemo(() => {
    const m: Record<string, Row> = {};
    p.rows.forEach((r) => (m[`${r.사번}|${r.날짜}`] = r));
    return m;
  }, [p.rows]);

  const meRow = byKey[`${p.me}|${now}`];
  const meName = p.people.find((x) => x.id === p.me)?.name ?? "";
  const meBase = p.people.find((x) => x.id === p.me)?.baseTime ?? "";

  /** 이 달 내 근태 셈 */
  const mine = useMemo(() => {
    const list = p.rows.filter((r) => r.사번 === p.me && r.날짜.startsWith(month));
    const count = (k: string) => list.filter((r) => r.근무구분 === k).length;
    const worked = list.filter((r) => r.출근시각 && r.퇴근시각);
    const minutes = worked.reduce((s, r) => {
      const a = Number(r.출근시각.slice(0, 2)) * 60 + Number(r.출근시각.slice(3, 5));
      const b = Number(r.퇴근시각.slice(0, 2)) * 60 + Number(r.퇴근시각.slice(3, 5));
      return s + Math.max(0, b - a);
    }, 0);
    return {
      정상: count("정상"), 지각: count("지각"), 결근: count("결근"),
      휴무: count("휴무") + count("연차") + count("반차"),
      days: list.filter((r) => r.출근시각).length,
      hours: Math.round((minutes / 60) * 10) / 10,
      lateMin: list.reduce((s, r) => s + (Number(r.지각분) || 0), 0),
    };
  }, [p.rows, p.me, month]);

  async function punch(action: "in" | "out") {
    setBusy(action);
    setMsg("");
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
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

      {/* 오늘 나 — 버튼 두 개 */}
      <div className="punch">
        <div className="pk-me">
          <span className="lb">{korDate(now)}</span>
          <b className="nm">{meName}</b>
          <span className="base">
            {meBase ? `출근 기준 ${meBase}` : "출근 기준 시각 없음 · 지각은 표시되지 않습니다"}
          </span>
        </div>

        <div className="pk-time">
          <div>
            <span>출근</span>
            <b className={meRow?.출근시각 ? "on num" : "num"}>{meRow?.출근시각 || "—"}</b>
          </div>
          <div>
            <span>퇴근</span>
            <b className={meRow?.퇴근시각 ? "on num" : "num"}>{meRow?.퇴근시각 || "—"}</b>
          </div>
          {meRow?.근무구분 === "지각" && (
            <span className="pill bad">{Number(meRow.지각분) > 0 ? `${meRow.지각분}분 지각` : "지각"}</span>
          )}
        </div>

        <div className="pk-act">
          {!meRow?.출근시각 ? (
            <button className="btn-dark big" onClick={() => punch("in")} disabled={Boolean(busy)}>
              {busy === "in" ? "찍는 중…" : "출근"}
            </button>
          ) : !meRow?.퇴근시각 ? (
            <button className="btn-dark big" onClick={() => punch("out")} disabled={Boolean(busy)}>
              {busy === "out" ? "찍는 중…" : "퇴근"}
            </button>
          ) : (
            <span className="done">오늘 근무 끝</span>
          )}
        </div>
      </div>
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
          <b className="vl num">{mine.hours}시간</b>
          <span className="sub">출근·퇴근 다 찍힌 날만</span>
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
                  const r = byKey[`${s.id}|${d}`];
                  const kind = r?.근무구분 || "";
                  return (
                    <td key={d}
                        className={`cell k-${kind || "none"}${p.canEdit ? " hit" : ""}`}
                        title={
                          r
                            ? `${korDate(d)} ${s.name}\n${kind || "-"} · 출근 ${r.출근시각 || "-"} · 퇴근 ${r.퇴근시각 || "-"}`
                            : `${korDate(d)} ${s.name}\n기록 없음`
                        }
                        onClick={() => p.canEdit && setEdit({ 사번: s.id, 날짜: d })}>
                      {MARK[kind] ?? ""}
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
          row={byKey[`${edit.사번}|${edit.날짜}`]}
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
function EditBox({ person, day, row, onClose }: {
  person: Person;
  day: string;
  row?: Row;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    근무구분: row?.근무구분 ?? "",
    출근시각: row?.출근시각 ?? "",
    퇴근시각: row?.퇴근시각 ?? "",
    메모: row?.메모 ?? "",
  });
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
        body: JSON.stringify({ action: "patch", 사번: person.id, 날짜: day, changes: f }),
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

        <div className="form-grid">
          <div className="field full">
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
          <div className="field full">
            <label>메모</label>
            <input className="input" value={f.메모} placeholder="사유를 적어두면 나중에 압니다"
                   onChange={(e) => set("메모", e.target.value)} />
          </div>
        </div>

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
