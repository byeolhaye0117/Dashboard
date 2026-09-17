"use client";

/**
 * 근태 화면
 *
 * 맨 위는 오늘 나 — 버튼 두 개면 끝나야 한다. 출근길에 오래 붙잡지 않는다.
 * 그 아래는 이 달 한 장 — 날짜 × 직원 격자로 한 달을 통째로 본다.
 * 빠진 칸이 눈에 띄어야 "누가 안 찍었나"를 바로 안다.
 */
import { useEffect, useMemo, useState } from "react";
import { today, korDate, weekdayIndex, hourNow, minuteNow } from "@/lib/time";
import {
  WORK_KINDS, KIND_MARK as MARK, toMinutes, hourText, worksOn, daysText,
} from "@/lib/attendanceMeta";
import { backdrop } from "@/lib/backdrop";

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
  /** 근무하는 요일 "월화수목금" — 비어 있으면 매일로 본다 */
  workDays: string;
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
  /*
   * 진짜 근무 구간만 따로 센다
   *
   * ── 무엇이 틀렸었나 ────────────────────────────────────────
   * 달력 칸의 작은 「2」가 줄 개수를 세고 있었다. 그런데 출근을 안 찍은 빈
   * 줄도 한 줄이라, 빈 줄이 하나 끼면 하루도 두 번 나온 것처럼 보였다.
   * 눌러서 열어 보면 2회차에는 아무것도 없어, 화면과 창이 서로 다른 말을
   * 했다.
   *
   * 출근 시각이 적힌 줄만 근무 구간이다. 오전에 갔다 저녁에 다시 온 날은
   * 출근이 둘이다 — 그때만 둘로 센다.
   */
  const spans = rounds.filter((r) => r.출근시각);
  return {
    rounds,
    /** 실제로 출근을 찍은 구간 수 — 달력의 작은 숫자가 이것을 말한다 */
    spanCount: spans.length,
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

/**
 * 하루를 한 줄 문장으로
 *
 * 「출근 10:37 · 휴게 13:05~13:40 (35분) · 퇴근 19:30」
 * 없는 것은 적지 않는다 — 빈 자리를 「-」로 채우면 읽는 눈이 거기 걸린다.
 */
function dayLine(f: ReturnType<typeof foldDay>): string {
  const parts: string[] = [];
  f.rounds.forEach((r, i) => {
    const nth = f.rounds.length > 1 ? `${i + 1}회차 ` : "";
    if (r.출근시각) parts.push(`${nth}출근 ${r.출근시각}`);
    if (r.퇴근시각) parts.push(`${nth}퇴근 ${r.퇴근시각}`);
  });
  if (f.spans) parts.push(`휴게 ${f.spans}${f.punched > 0 ? ` (${hourText(f.punched)})` : ""}`);
  else if (f.rest > 0) parts.push(`휴게 ${hourText(f.rest)} (자동으로 빠짐)`);
  if (f.openRest) parts.push(`휴게 ${f.openRest}부터 쉬는 중`);
  if (f.head?.메모) parts.push(f.head.메모);
  return parts.length ? parts.join(" · ") : "기록만 있고 시각이 비어 있습니다";
}

type Props = {
  me: string;
  rows: Row[];
  people: Person[];
  branches: { code: string; name: string }[];
  canEdit: boolean;
  /** 그날 기록을 통째로 지울 수 있는가 — 고치는 것보다 무거운 일이다 */
  canRemove: boolean;
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
const weekdayOf = (d: string) => weekdayIndex(d);

export default function Client(p: Props) {
  const now = today();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [edit, setEdit] = useState<{ 사번: string; 날짜: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  /** 휴게 중일 때 "몇 분째"를 흐르게 하려고 1분마다 다시 그린다 */
  const [tick, setTick] = useState(0);
  const [confirmOut, setConfirmOut] = useState(false);
  /*
   * 퇴근 보고
   *
   * 퇴근을 찍기 전에 하루를 한 줄로 남긴다 — 몇 분과 상담했고, 몇 분이
   * 등록했고, 몇 분을 놓쳤는가. 놓친 분은 이름과 번호까지 적어 둔다.
   *
   * 보고를 못 올려도 퇴근은 찍히게 한다. 시트 한 곳이 잘못돼서 직원이 퇴근을
   * 못 찍고 서 있는 일이 있어서는 안 된다.
   */
  const [report, setReport] = useState(false);
  /** 휴게를 같이 적고 퇴근하는 경우 그 분 수 */
  const [restMin, setRestMin] = useState(0);

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

  /**
   * 줄글로 볼 내 근태 — 기록이 있는 날만, 최근 날짜가 위로
   *
   * 격자는 여러 사람을 한눈에 볼 때 쓰는 모양이다. 자기 것만 보는 사람에게는
   * 칸에 점 하나가 찍힌 달력보다, 그날 몇 시에 와서 얼마나 일했는지가 문장으로
   * 적혀 있는 편이 훨씬 빨리 읽힌다.
   */
  const myDays = useMemo(() => {
    const bag: Record<string, Row[]> = {};
    p.rows
      .filter((r) => r.사번 === p.me && r.날짜.startsWith(month))
      .forEach((r) => (bag[r.날짜] ??= []).push(r));
    return Object.keys(bag)
      .sort((a, b) => b.localeCompare(a))
      .map((d) => ({
        날짜: d,
        f: foldDay(bag[d], meSelf?.restMin ?? "", Boolean(meSelf?.restVary)),
      }));
  }, [p.rows, p.me, month, meSelf]);

  /** 휴게를 몇 분째 하고 있는지 — 1분마다 다시 센다 */
  const restingFor = useMemo(() => {
    if (!meToday?.openRest) return 0;
    const from = toMinutes(meToday.openRest);
    // 서버는 세계표준시로 돈다 — 한국 시각으로 물어야 아홉 시간이 안 밀린다
    const nowMin = hourNow() * 60 + minuteNow();
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

  /** 오늘이 내 근무일인가 — 아니어도 찍는 것은 막지 않는다. 대타로 나오는 날이 있다 */
  const offToday = worksOn(meSelf?.workDays ?? "", now);

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
            {meSelf?.workDays ? ` · ${daysText(meSelf.workDays)}` : ""}
          </span>
          {!offToday && <span className="pill" style={{ marginTop: 6 }}>오늘은 근무일이 아닙니다</span>}
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
                  {busy === "break-in"
                    ? "시작하는 중…"
                    : busy === "break-out"
                    ? "복귀하는 중…"
                    : meToday.resting
                    ? "휴게 끝내고 복귀"
                    : "휴게 시작"}
                </button>
              )}
              {!meToday.resting && (
                <button className={vary ? "btn-ghost tall" : "btn-dark big"}
                        onClick={() => (needRest ? setConfirmOut(true) : setReport(true))}
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
          <button className="btn-ghost"
                  onClick={() => { setRestMin(30); setConfirmOut(false); setReport(true); }}
                  disabled={Boolean(busy)}>
            휴게 30분 적고 퇴근
          </button>
          <button className="btn-dark" onClick={() => { setConfirmOut(false); setReport(true); }} disabled={Boolean(busy)}>
            그대로 퇴근
          </button>
        </div>
      )}

      {/*
        퇴근 보고

        하루를 닫으면서 남기는 한 줄이다. 놓친 분은 이름과 번호까지 적는다 —
        「실패 3명」이라는 숫자만 남으면 다음에 할 수 있는 일이 없다. 이름과
        번호가 있어야 다시 연락을 드릴 수 있다.

        보고를 못 올려도 퇴근은 찍힌다. 시트 한 곳이 잘못돼서 직원이 퇴근을
        못 찍고 서 있는 일이 있어서는 안 된다.
      */}
      {report && (
        <ShiftReport
          busy={Boolean(busy)}
          onSkip={() => { setReport(false); punch("out", restMin); setRestMin(0); }}
          onDone={() => { setReport(false); punch("out", restMin); setRestMin(0); }}
        />
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

      {/* 자기 것만 보는 사람에게는 줄글로 — 격자는 여러 사람을 볼 때 쓰는 모양이다 */}
      {!p.canEdit ? (
        <>
          <h2 className="sec-title">{Number(month.slice(5, 7))}월 내 근태</h2>
          <p className="sec-sub">기록이 있는 날만 나옵니다 · 고치실 일이 있으면 점장님께 말씀해주세요</p>
          {myDays.length === 0 ? (
            <p className="empty">이 달에 찍은 기록이 없습니다.</p>
          ) : (
            <div className="mcard">
              {myDays.map(({ 날짜, f }) => (
                <div className="mrow" key={날짜}>
                  <div className="t">
                    <b>{korDate(날짜)}</b>
                    {f.kind && f.kind !== "정상" && (
                      <span className={`pill ${f.kind === "지각" || f.kind === "결근" ? "bad" : "warn"}`}>
                        {f.kind}
                        {f.kind === "지각" && Number(f.head?.지각분) > 0 && ` ${f.head.지각분}분`}
                      </span>
                    )}
                    <span className="dim">
                      {f.net > 0 ? `일한 시간 ${hourText(f.net)}` : f.working ? "근무 중" : ""}
                    </span>
                  </div>
                  <span className="sub">{dayLine(f)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
      <>
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
                <td className="sticky">
                  <span className="nm">{s.name}</span>
                  {s.workDays && <em className="wd">{daysText(s.workDays)}</em>}
                </td>
                {days.map((d) => {
                  const f = byKey[`${s.id}|${d}`];
                  const kind = f?.kind || "";
                  /* 출근을 찍은 구간이 둘 이상일 때만 숫자를 붙인다.
                     몇 번인지도 그대로 적는다 — 셋인 날에 「2」가 뜨면
                     그 자체로 틀린 말이다 */
                  const spans = f?.spanCount ?? 0;
                  // 원래 안 나오는 날은 빈 칸이 정상이다. "안 찍음"과 구분되어야 한다
                  const offDay = !worksOn(s.workDays, d) && !kind;
                  return (
                    <td key={d}
                        className={`cell k-${kind || "none"}${offDay ? " off-day" : ""}${p.canEdit ? " hit" : ""}`}
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
                            : `${korDate(d)} ${s.name}\n${offDay ? "근무일이 아닙니다" : "기록 없음"}`
                        }
                        onClick={() => p.canEdit && setEdit({ 사번: s.id, 날짜: d })}>
                      {MARK[kind] ?? (offDay ? "·" : "")}
                      {spans > 1 && <em className="twice">{spans}</em>}
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
      </>
      )}

      {edit && (
        <EditBox
          person={p.people.find((x) => x.id === edit.사번)!}
          day={edit.날짜}
          rounds={byKey[`${edit.사번}|${edit.날짜}`]?.rounds ?? []}
          canRemove={p.canRemove}
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
function EditBox({ person, day, rounds, canRemove, onClose }: {
  person: Person;
  day: string;
  /** 그날의 근무 구간들. 오전·저녁이면 둘이다 */
  rounds: Row[];
  canRemove: boolean;
  onClose: () => void;
}) {
  /*
   * 어느 회차를 먼저 열 것인가
   *
   * ── 무엇이 틀렸었나 ────────────────────────────────────────
   * 회차 단추를 늘 1·2 두 개로 세워 두었다. 그래서 2회차가 없는 날에도
   * 단추가 서 있었고, 거기서 저장하면 빈 줄이 하나 생겼다 — 그 빈 줄 때문에
   * 달력에 「2」가 붙고, 눌러 보면 아무것도 없는 일이 났다.
   *
   * 이제 실제로 있는 회차만 세운다. 오전에 갔다 저녁에 다시 온 것을 손으로
   * 적으셔야 할 때를 위해 「다음 회차」 자리를 하나만 더 둔다.
   */
  /*
   * 단추는 회차 번호가 아니라 「있는 줄」로 세운다
   *
   * ── 무엇이 틀렸었나 ────────────────────────────────────────
   * 회차 번호로 단추를 세우고, 그 번호로 줄을 찾았다. 그런데 회차가 같은 줄이
   * 둘 있는 날이 있다 — 옛 줄에 회차가 안 적혀 있으면 둘 다 1회차로 읽힌다.
   * 그러면 칸에 마우스를 대면 두 구간이 다 보이는데, 눌러서 열면 앞의 한
   * 줄만 나오고 뒤의 줄은 손댈 길이 없었다. 화면과 창이 서로 다른 말을 했다.
   *
   * 이제 줄마다 단추 하나다. 어느 줄을 고치는지가 번호가 아니라 눈에 보이는
   * 시각으로 갈린다. 저장할 때도 그 줄의 근태번호를 그대로 집어 보낸다 —
   * 회차로 찾지 않으니 헷갈릴 일이 없다.
   */
  const 줄들 = rounds.slice().sort((a, b) => a.회차 - b.회차);
  /** 새로 만들 때 쓸 회차 — 있는 것 중 제일 큰 것 다음 */
  const 다음회차 = (줄들[줄들.length - 1]?.회차 ?? 0) + 1;

  /* 값이 적힌 줄부터 연다 — 빈 줄이 앞에 끼어 있어도 빈 창이 뜨지 않는다 */
  const 첫자리 = Math.max(0, 줄들.findIndex((r) => r.출근시각));
  /** 몇 번째 줄을 보고 있나. 줄 수와 같으면 「새 구간」이다 */
  const [nth, setNth] = useState(줄들.length > 0 ? 첫자리 : 0);
  const row = 줄들[nth];
  const round = row?.회차 ?? 다음회차;
  const [f, setF] = useState({
    근무구분: rounds[0]?.근무구분 ?? "",
    출근시각: row?.출근시각 ?? "",
    퇴근시각: row?.퇴근시각 ?? "",
    휴게분: row?.휴게분 ?? "",
    메모: row?.메모 ?? "",
  });

  /** 줄을 바꾸면 그 줄 값으로 갈아 끼운다 */
  const pick = (i: number) => {
    const r = 줄들[i];
    setNth(i);
    setF({
      근무구분: 줄들[0]?.근무구분 ?? "",
      출근시각: r?.출근시각 ?? "",
      퇴근시각: r?.퇴근시각 ?? "",
      휴게분: r?.휴게분 ?? "",
      메모: r?.메모 ?? "",
    });
  };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  /* 지우기는 한 번 더 묻는다. 근태는 급여로 이어지는 기록이라 되돌리기가 번거롭다 */
  const [askDel, setAskDel] = useState(false);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  async function wipe() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "del", 사번: person.id, 날짜: day }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "지우지 못했습니다.");
      location.reload();
    } catch (e: any) {
      setMsg(e.message);
      setBusy(false);
      setAskDel(false);
    }
  }

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
          /* 고치는 줄을 번호로 집어 보낸다 — 회차가 같은 줄이 둘 있는 날에도
             화면이 보고 있는 그 줄이 고쳐진다. 새로 만들 때는 비어 있다 */
          근태번호: row?.id ?? "",
          // 그날 판정은 첫 줄에만 적는다. 뒤 구간을 고칠 땐 건드리지 않는다
          changes: nth === 0 ? f : { 출근시각: f.출근시각, 퇴근시각: f.퇴근시각, 휴게분: f.휴게분, 메모: f.메모 },
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
    <div className="modal-back" {...backdrop(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{person.name} · {korDate(day)}</h3>

        <div className="tab-bar rounds" style={{ marginBottom: 12 }}>
          {줄들.map((r, i) => (
            <button key={r.id || i} type="button"
                    className={`mini-tab${nth === i ? " on" : ""}`}
                    onClick={() => pick(i)}>
              {/* 어느 줄인지가 번호가 아니라 눈에 보이는 시각으로 갈린다 */}
              <span>{i + 1}회차</span>
              <span className="tm">
                {r.출근시각 ? `${r.출근시각} ~ ${r.퇴근시각 || "…"}` : "비어 있음"}
              </span>
            </button>
          ))}
          <button type="button"
                  className={`mini-tab${nth === 줄들.length ? " on" : ""}`}
                  onClick={() => pick(줄들.length)}>
            <span>{줄들.length === 0 ? "기록 적기" : "구간 더 넣기"}</span>
            <span className="tm">{줄들.length === 0 ? "손으로 채우기" : `${줄들.length + 1}회차`}</span>
          </button>
        </div>

        <div className="form-grid">
          {/* 그날 판정은 첫 줄에만 적는다 — 여러 줄에 같은 값을 두면 언젠가 어긋난다 */}
          <div className="field full" style={{ display: nth === 0 ? "block" : "none" }}>
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

        {askDel && (
          <div className="confirm-box">
            <b>{korDate(day)} 기록을 통째로 지웁니다</b>
            <p>회차가 둘이면 둘 다 지워집니다. 지운 사람과 시각은 시트에 남습니다.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setAskDel(false)}>그만두기</button>
              <button className="btn-danger" onClick={wipe} disabled={busy}>
                {busy ? "지우는 중…" : "지웁니다"}
              </button>
            </div>
          </div>
        )}

        <div className="modal-actions">
          {canRemove && rounds.length > 0 && !askDel && (
            <button className="btn-ghost danger" style={{ marginRight: "auto" }}
                    onClick={() => setAskDel(true)} disabled={busy}>
              이 날 지우기
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>닫기</button>
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={save} disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 퇴근 보고 창
 *
 * 상담 · 성공 · 실패를 적고, 놓친 분은 명단으로 남긴다. 실패 수는 손으로
 * 적지 않는다 — 적어 주신 명단에서 센다. 손으로 적은 수와 명단이 어긋나면
 * 어느 쪽이 맞는지 아무도 모른다.
 */
function ShiftReport({ busy, onSkip, onDone }: {
  busy: boolean;
  onSkip: () => void;
  onDone: () => void;
}) {
  const [상담, set상담] = useState("");
  const [성공, set성공] = useState("");
  const [문제, set문제] = useState("");
  const [실패, set실패] = useState<{ 이름: string; 전화번호: string; 사유: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  /* 놓친 분 한 줄을 받는 작은 창 — 목록 위에 겹쳐 뜬다 */
  const [adding, setAdding] = useState(false);
  const [one, setOne] = useState({ 이름: "", 전화번호: "", 사유: "" });

  const num = (v: string) => Number((v ?? "").replace(/[^0-9]/g, "")) || 0;

  async function save() {
    if (saving) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/attendance/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 상담수: String(num(상담)), 성공수: String(num(성공)), 문제사항: 문제, 실패 }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "보고를 올리지 못했습니다.");
      onDone();
    } catch (e: any) {
      setMsg(`${String(e.message ?? e)} — 보고는 못 올렸지만 퇴근은 찍으실 수 있습니다.`);
      setSaving(false);
    }
  }

  return (
    <div className="modal-back" {...backdrop(() => !saving && onSkip())}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>오늘 하루 보고</h3>
        <p className="modal-lead">
          적어 주시면 그대로 퇴근이 찍힙니다. 놓친 분은 <b>이름과 번호</b>까지 적어 주세요 —
          그래야 다시 연락을 드릴 수 있습니다.
        </p>

        <div className="form-grid">
          <div className="field">
            <label>상담한 분</label>
            <input className="input" inputMode="numeric" value={상담} autoFocus
                   placeholder="예: 5"
                   onChange={(e) => set상담(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>
          <div className="field">
            <label>등록하신 분</label>
            <input className="input" inputMode="numeric" value={성공}
                   placeholder="예: 3"
                   onChange={(e) => set성공(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>
        </div>

        <h4 className="viz-title mt">
          놓친 분 {실패.length}명
          <button type="button" className="linkish" onClick={() => { setOne({ 이름: "", 전화번호: "", 사유: "" }); setAdding(true); }}>
            한 분 적기
          </button>
        </h4>
        {실패.length === 0 ? (
          <p className="stat-note">놓친 분이 없으면 비워 두셔도 됩니다.</p>
        ) : (
          <div className="lwrap">
            {실패.map((x, i) => (
              <div className="lrow" key={i}>
                <div className="who">
                  <b>{x.이름 || "이름 모름"}</b>
                  <span>{x.전화번호 || "번호 모름"} · {x.사유 || "사유 안 적음"}</span>
                </div>
                <div className="mid">
                  <button type="button" className="btn-ghost mini danger"
                          onClick={() => set실패(실패.filter((_, k) => k !== i))}>빼기</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="field full" style={{ marginTop: 14 }}>
          <label>문제사항 및 해결</label>
          <textarea className="input area" rows={3} value={문제}
                    placeholder="오늘 있었던 일과 어떻게 하셨는지 적어주세요"
                    onChange={(e) => set문제(e.target.value)} />
        </div>

        {msg && <div className="alert-bad">{msg}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onSkip} disabled={saving || busy}>
            보고 없이 퇴근
          </button>
          <button className="btn-dark" onClick={save} disabled={saving || busy}>
            {saving ? "올리는 중…" : "보고하고 퇴근"}
          </button>
        </div>

        {/* 놓친 분 한 분을 받는 창 — 보고 창 위에 겹쳐 뜬다 */}
        {adding && (
          <div className="modal-back" {...backdrop(() => setAdding(false))}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>놓친 분 적기</h3>
              <div className="form-grid">
                <div className="field">
                  <label>이름</label>
                  <input className="input" value={one.이름} autoFocus
                         onChange={(e) => setOne({ ...one, 이름: e.target.value })} />
                </div>
                <div className="field">
                  <label>전화번호</label>
                  <input className="input" inputMode="tel" placeholder="010-0000-0000"
                         value={one.전화번호}
                         onChange={(e) => setOne({ ...one, 전화번호: e.target.value })} />
                </div>
                <div className="field full">
                  <label>등록 안 한 까닭</label>
                  <input className="input" value={one.사유}
                         placeholder="예: 가격 부담 · 타 업체 비교 중"
                         onChange={(e) => setOne({ ...one, 사유: e.target.value })} />
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setAdding(false)}>그만두기</button>
                <button className="btn-dark"
                        onClick={() => {
                          if (!one.이름.trim() && !one.전화번호.trim()) return;
                          set실패([...실패, one]);
                          setAdding(false);
                        }}>
                  더하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
