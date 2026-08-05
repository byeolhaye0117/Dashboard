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
import { Fragment, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { korDate, today } from "@/lib/time";
import {
  JOIN_STATES, STATE_TONE, KIND_PT, KIND_GROUP, addMinutes, toMinutes, lastSlot,
} from "@/lib/lessonMeta";

type Lesson = {
  id: string; 지점코드: string; 수업구분: string; 상품코드: string;
  트레이너사번: string; 날짜: string; 시작시각: string; 종료시각: string;
  정원: number; 진행상태: string; 메모: string; 사진파일: string;
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
  /** 지금 보는 사람이 수업을 하는 사람인가 — 아니면 보고할 것이 없다 */
  iAmTrainer: boolean;
  /** 사번 → 맡은 그룹수업 시간대 */
  groupSlots: Record<string, string[]>;
  /** 사진 폴더가 준비 안 됐으면 그 이유 */
  photoProblem: string;
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

/**
 * 올리기 전에 사진을 줄인다
 *
 * 요즘 휴대폰 사진은 한 장에 3~5MB다. 그대로 올리면 밖에서 느린 통신으로
 * 보고할 때 한참 걸리고, 보관 용량도 금방 찬다.
 * 수업 후 확인용이라 긴 변 1600px 이면 충분하다.
 *
 * 못 줄이겠으면 원본을 그대로 쓴다. 줄이기에 실패했다고 보고를 막을 이유는 없다.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const long = Math.max(bmp.width, bmp.height);
    const scale = long > 1600 ? 1600 / long : 1;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);

    const out = await new Promise<Blob | null>((ok) =>
      canvas.toBlob((b) => ok(b), "image/jpeg", 0.8)
    );
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
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
  const [showLate, setShowLate] = useState(false);
  const [tab, setTab] = useState<"sched" | "pt" | "group">("sched");
  const [sub, setSub] = useState<"do" | "check">("do");

  /*
    보고하기는 수업하는 사람 몫이고, 보고 확인은 남의 것까지 보는 사람 몫이다.
    둘 다 되는 사람(수업하는 점장)만 탭을 고르고, 나머지는 볼 수 있는 쪽으로 고정한다.
    고를 것이 하나뿐인데 탭을 보여주면 누를 이유가 없는 단추가 생긴다.
  */
  const canDo = p.iAmTrainer;
  const canCheck = p.can.update;
  const view: "do" | "check" = !canDo ? "check" : !canCheck ? "do" : sub;
  // 보고할 것도 없고 남의 것을 볼 권한도 없으면 시간표만 본다
  const shown = canDo || canCheck ? tab : "sched";
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

  /**
   * 밀린 수업 — 날짜는 지났는데 아직 안 찍은 것
   *
   * 안 찍으면 회차가 안 빠지고 회원의 남은 횟수가 실제보다 많아 보인다.
   * 시간이 지날수록 기억이 흐려져 고치기 어려워지므로 눈에 띄게 알린다.
   */
  const late = useMemo(() => {
    const rows = p.lessons
      .filter((l) => l.수업구분 !== KIND_GROUP)
      .filter((l) => l.날짜 < now && l.진행상태 !== "취소")
      .filter((l) => !onlyMine || l.트레이너사번 === p.me)
      .map((l) => ({ lesson: l, waiting: (joinsOf.get(l.id) ?? []).filter((j) => j.진행상태 === "예정") }))
      .filter((x) => x.waiting.length > 0);
    rows.sort((a, b) => (a.lesson.날짜 + a.lesson.시작시각).localeCompare(b.lesson.날짜 + b.lesson.시작시각));
    return rows;
  }, [p.lessons, joinsOf, now, onlyMine, p.me]);

  /** 시간표에 그릴 것 — 1:1 과 그룹수업을 같이 본다 */
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
    if (list.length === 0 && p.iAmTrainer) {
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

  /** 사번|날짜 → 그날 보고한 타임들 */
  const reported = useMemo(() => {
    const map = new Map<string, { slots: string[]; photo: string }>();
    p.lessons.filter((l) => l.수업구분 === KIND_GROUP).forEach((l) => {
      const key = `${l.트레이너사번}|${l.날짜}`;
      const cur = map.get(key) ?? { slots: [], photo: "" };
      cur.slots.push(l.시작시각);
      if (l.사진파일) cur.photo = l.사진파일;
      map.set(key, { ...cur, slots: [...cur.slots].sort() });
    });
    return map;
  }, [p.lessons]);

  const slotsOf = useMemo(
    () => new Map(Object.entries(p.groupSlots)),
    [p.groupSlots]
  );

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

  /** 1:1 보고 화면에서 다루는 그날 수업 — 그룹은 따로 보고한다 */
  const ptDay = dayList.filter((l) => l.수업구분 !== KIND_GROUP);

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

      <div className="pick-row" style={{ marginBottom: 14 }}>
        <button className={`mini-tab${tab === "sched" ? " on" : ""}`} onClick={() => setTab("sched")}>
          시간표
        </button>
        {(canDo || canCheck) && (
          <>
            <button className={`mini-tab${tab === "pt" ? " on" : ""}`} onClick={() => setTab("pt")}>
              1:1 PT {canDo ? "보고" : "확인"}
            </button>
            <button className={`mini-tab${tab === "group" ? " on" : ""}`} onClick={() => setTab("group")}>
              그룹수업 {canDo ? "보고" : "확인"}
            </button>
          </>
        )}
      </div>

      {/* 보고 안에서 「보고하기」와 「보고 확인」을 오간다.
          확인은 남의 보고까지 볼 수 있는 사람 — 점장 · 대표에게만 보인다 */}
      {shown !== "sched" && canDo && canCheck && (
        <div className="pick-row" style={{ marginBottom: 14 }}>
          <button className={`mini-tab${view === "do" ? " on" : ""}`} onClick={() => setSub("do")}>
            보고하기
          </button>
          <button className={`mini-tab${view === "check" ? " on" : ""}`} onClick={() => setSub("check")}>
            보고 확인
          </button>
        </div>
      )}

      {shown === "group" ? (
        view === "check" ? (
          <GroupBoard trainers={p.trainers} slotsOf={slotsOf} reported={reported}
                    photoProblem={p.photoProblem} />
        ) : (
          <GroupReport
            me={p.me}
            myBranch={p.myBranch}
            trainers={p.trainers}
            slotsOf={slotsOf}
            reported={reported}
            canPickOther={p.can.update}
            photoProblem={p.photoProblem}
            onDone={() => location.reload()}
          />
        )
      ) : shown === "pt" && view === "check" ? (
        <PtBoard day={day} trainers={p.trainers} lessons={p.lessons} joinsOf={joinsOf} />
      ) : (
      <>
      {/* 수업을 잡고 거르는 일은 수업하는 사람 몫이다.
          안 하는 사람에게는 이 줄이 통째로 필요 없다 */}
      {canDo && (
        <div className="pick-row">
          <button className={`mini-tab${onlyMine ? "" : " on"}`} onClick={() => setOnlyMine(false)}>전체</button>
          <button className={`mini-tab${onlyMine ? " on" : ""}`} onClick={() => setOnlyMine(true)}>내 수업</button>
          <span className="spacer" />
          {p.can.create && (
            <button className="btn-dark" onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} /> 1:1 PT 잡기
            </button>
          )}
        </div>
      )}

      {msg && <div className="alert-bad" style={{ marginBottom: 14 }}>{msg}</div>}

      {late.length > 0 && (
        <div className="banner">
          <span className="lead"><Icon name="warn" size={18} /></span>
          <div>
            <b>
              지난 수업 {late.length}건이 아직 처리되지 않았습니다
              {" · "}
              {late.reduce((n, x) => n + x.waiting.length, 0)}명
            </b>
            <p>
              완료로 찍지 않으면 회차가 빠지지 않아, 회원의 남은 횟수가 실제보다 많아 보입니다.
              아래에서 바로 처리하실 수 있습니다.
            </p>
          </div>
          <button className="btn-dark" onClick={() => setShowLate((v) => !v)}
                  style={{ whiteSpace: "nowrap" }}>
            {showLate ? "접기" : "지금 처리하기"}
          </button>
        </div>
      )}

      {showLate && late.length > 0 && (
        <div className="lwrap" style={{ marginBottom: 18 }}>
          {late.map(({ lesson: l, waiting }) => (
            <div className="jrow" key={l.id}>
              <div className="jtop">
                <b>{korDate(l.날짜)} {l.시작시각}</b>
                <span>
                  {p.trainers.find((t) => t.id === l.트레이너사번)?.name ?? l.트레이너사번}
                  {" · "}
                  {l.수업구분 === KIND_GROUP
                    ? `${productName.get(l.상품코드) ?? "그룹수업"} ${waiting.length}명`
                    : memberName.get(waiting[0]?.회원번호) ?? ""}
                </span>
              </div>
              <div className="mk-row">
                <button className="mk-btn go" disabled={busy}
                        onClick={() => send({ action: "complete", 수업번호: l.id })}>
                  {waiting.length > 1 ? `전원 완료 (${waiting.length}명)` : "완료"}
                </button>
                <button className="mk-btn" disabled={busy} onClick={() => setOpen(l.id)}>
                  한 명씩 정하기
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="page-sub" style={{ margin: "2px 0 12px" }}>{korDate(day)}</p>

      {shown === "sched" ? (
        <>
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
                        /*
                          그룹수업은 참석자를 따로 적지 않는다. 보고로 올라온 것이므로
                          이미 끝난 일이고, 회차 수가 아니라 사진이 올라왔는지가 관심사다.
                        */
                        const group = l.수업구분 === KIND_GROUP;
                        const tone =
                          l.진행상태 === "취소" ? "gone"
                            : group ? "done"
                              : settled ? "done"
                                : l.날짜 < now ? "late"
                                  : "wait";
                        return (
                          <button className={`tt-item ${tone}`} key={l.id}
                                  onClick={() => !group && setOpen(l.id)}>
                            <span className="tm">{l.시작시각}</span>
                            <span className="nm">
                              {group
                                ? productName.get(l.상품코드) || "그룹수업"
                                : memberName.get(js[0]?.회원번호) ?? "회원 미지정"}
                            </span>
                            {group
                              ? <span className="mk">{l.사진파일 ? "보고 · 사진" : "보고"}</span>
                              : settled
                                ? <span className="mk">{done}회 완료</span>
                                : l.날짜 < now && <span className="mk">아직 안 찍음</span>}
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
        </>
      ) : (
        <PtReport
          list={ptDay}
          joinsOf={joinsOf}
          memberName={memberName}
          trainers={p.trainers}
          me={p.me}
          canEditOther={p.can.update}
          busy={busy}
          onMark={(수업번호, 참석번호, 상태) => send({ action: "mark", 수업번호, 참석번호, 상태 })}
          onCompleteAll={(수업번호) => send({ action: "complete", 수업번호 })}
          onOpen={(id) => setOpen(id)}
        />
      )}
      </>
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
          onCompleteAll={() => send({ action: "complete", 수업번호: openLesson.id })}
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
  onCompleteAll: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const l = props.lesson;
  const [confirming, setConfirming] = useState(false);
  const left = new Map(props.tickets.map((t) => [t.id, t]));
  const waiting = props.joins.filter((j) => j.진행상태 === "예정").length;

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

        {waiting > 0 && props.canEdit && (
          <button className="btn-primary" style={{ marginTop: 14 }} disabled={props.busy}
                  onClick={props.onCompleteAll}>
            {props.busy
              ? "처리 중…"
              : waiting > 1
                ? `수업 완료 — ${waiting}명 한 번에`
                : "수업 완료"}
          </button>
        )}

        <p className="page-sub" style={{ margin: "12px 0 0" }}>
          <b>완료</b>로 찍을 때만 회차가 1 빠집니다. 노쇼·취소는 회차가 그대로입니다.
          잘못 찍었으면 다시 눌러 되돌릴 수 있습니다.
          {waiting > 1 && " 「수업 완료」는 아직 안 찍은 사람만 완료로 바꿉니다 — 이미 노쇼로 찍은 사람은 그대로 둡니다."}
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

/* ── 1:1 PT 보고 ───────────────────────────── */

/**
 * 그날 1:1 수업을 목록으로 놓고 결과를 찍는다
 *
 * 시간표는 "누가 언제 비어 있나"를 보는 자리고, 여기는 "무엇을 아직 안 찍었나"를
 * 처리하는 자리다. 같은 자료라도 하는 일이 다르면 모양이 달라야 한다.
 * 특히 휴대폰에서는 시간표 칸을 정확히 누르기가 어렵다.
 */
function PtReport(props: {
  list: Lesson[];
  joinsOf: Map<string, Join[]>;
  memberName: Map<string, string>;
  trainers: Person[];
  me: string;
  canEditOther: boolean;
  busy: boolean;
  onMark: (lessonId: string, joinId: string, state: string) => void;
  onCompleteAll: (lessonId: string) => void;
  onOpen: (lessonId: string) => void;
}) {
  const nameOf = new Map(props.trainers.map((t) => [t.id, t.name]));
  if (props.list.length === 0) {
    return <div className="norow">이 날에 잡힌 1:1 PT가 없습니다</div>;
  }

  return (
    <div className="lwrap">
      {props.list.map((l) => {
        const js = props.joinsOf.get(l.id) ?? [];
        const waiting = js.filter((j) => j.진행상태 === "예정");
        const mine = l.트레이너사번 === props.me || props.canEditOther;
        const one = js[0];
        return (
          <div className="jrow" key={l.id}>
            <div className="jtop">
              <b>{l.시작시각}{l.종료시각 ? `–${l.종료시각}` : ""}</b>
              <span>
                {nameOf.get(l.트레이너사번) ?? l.트레이너사번}
                {" · "}
                {props.memberName.get(one?.회원번호) ?? "회원 미지정"}
                {waiting.length === 0 && ` · ${js.map((j) => j.진행상태).join(" · ")}`}
              </span>
            </div>
            {waiting.length === 0 ? (
              <button className="mk-btn" onClick={() => props.onOpen(l.id)}>
                고치기
              </button>
            ) : (
              <div className="mk-row">
                {JOIN_STATES.filter((x) => x !== "예정").map((st) => (
                  <button key={st} className={`mk-btn ${STATE_TONE[st]}${st === "완료" ? " go" : ""}`}
                          disabled={!mine || props.busy}
                          onClick={() =>
                            st === "완료" && waiting.length > 1
                              ? props.onCompleteAll(l.id)
                              : props.onMark(l.id, waiting[0].id, st)
                          }>
                    {st}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 1:1 보고 확인 — 그날 누가 몇 건을 찍었고 무엇이 남았나
 *
 * 그룹수업 확인과 같은 생각이다. 안 찍은 것이 먼저 보여야 한다.
 */
function PtBoard(props: {
  day: string;
  trainers: Person[];
  lessons: Lesson[];
  joinsOf: Map<string, Join[]>;
}) {
  const [day, setDay] = useState(props.day);
  const nowDay = today();

  const rows = props.trainers.map((t) => {
    const mine = props.lessons.filter(
      (l) => l.수업구분 !== KIND_GROUP && l.날짜 === day && l.트레이너사번 === t.id
    );
    let done = 0;
    let miss = 0;
    let waiting = 0;
    mine.forEach((l) =>
      (props.joinsOf.get(l.id) ?? []).forEach((j) => {
        if (j.진행상태 === "완료") done += 1;
        else if (j.진행상태 === "노쇼") miss += 1;
        else if (j.진행상태 === "예정") waiting += 1;
      })
    );
    return { t, total: mine.length, done, miss, waiting };
  }).filter((r) => r.total > 0);

  const left = rows.reduce((n, r) => n + r.waiting, 0);

  return (
    <>
      <div className="pick-row" style={{ marginBottom: 14 }}>
        <button className="icon-btn" onClick={() => setDay(shiftDay(day, -1))} aria-label="어제">‹</button>
        <input className="input" type="date" value={day} style={{ width: 148 }}
               onChange={(e) => setDay(e.target.value || nowDay)} />
        <button className="icon-btn" onClick={() => setDay(shiftDay(day, 1))} aria-label="내일">›</button>
        {day !== nowDay && (
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setDay(nowDay)}>오늘</button>
        )}
      </div>

      <p className="page-sub" style={{ margin: "0 0 12px" }}>
        {korDate(day)} · 1:1 PT {rows.reduce((n, r) => n + r.total, 0)}건
      </p>

      {rows.length === 0 ? (
        <div className="norow">이 날에 잡힌 1:1 PT가 없습니다</div>
      ) : (
        <>
          {left > 0 && day <= nowDay && (
            <div className="banner">
              <span className="lead"><Icon name="warn" size={18} /></span>
              <div>
                <b>아직 찍지 않은 수업 {left}건</b>
                <p>
                  {rows.filter((r) => r.waiting > 0).map((r) => `${r.t.name} ${r.waiting}건`).join(" · ")}
                </p>
              </div>
            </div>
          )}

          <div className="lwrap">
            {rows.map((r) => (
              <div className="jrow" key={r.t.id}>
                <div className="jtop">
                  <b>{r.t.name}</b>
                  <span>{r.total}건 잡힘</span>
                </div>
                <div className="pick-row">
                  <span className="pill good">완료 {r.done}</span>
                  {r.miss > 0 && <span className="pill">노쇼 {r.miss}</span>}
                  {r.waiting > 0 && <span className="pill bad">아직 {r.waiting}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ── 그룹수업 보고 확인 (점장 · 대표) ────────── */

/**
 * 올라온 보고를 한자리에서 본다
 *
 * 사진을 보려고 구글 드라이브를 따로 열게 하면, 파일 이름만 잔뜩 쌓인 폴더에서
 * 누가 언제 올린 것인지 짚어내야 한다. 그건 확인이 아니라 일이다.
 * 날짜 하나를 고르면 그날 누가 무엇을 했는지 한 화면에 뜨게 한다.
 *
 * 올라온 것보다 "안 올라온 것"이 더 중요하다. 그래서 보고 안 한 사람을 위에 세운다.
 */
function GroupBoard(props: {
  trainers: Person[];
  slotsOf: Map<string, string[]>;
  reported: Map<string, { slots: string[]; photo: string }>;
  /** 사진 폴더가 준비 안 됐으면 그 이유 — 준비는 대표님 일이라 여기에도 띄운다 */
  photoProblem: string;
}) {
  const nowDay = today();
  const [day, setDay] = useState(nowDay);
  const [zoom, setZoom] = useState("");
  /** 지우기는 되돌릴 수 없으니 한 번 더 묻는다 */
  const [killing, setKilling] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function remove(사번: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-group", 사번, 날짜: day }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "지우지 못했습니다.");
      location.reload();
    } catch (e: any) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  // 그룹수업 시간이 정해진 사람만 본다. 1:1 만 하는 사람은 보고할 것이 없다
  const people = props.trainers.filter((t) => (props.slotsOf.get(t.id) ?? []).length > 0);
  const rows = people.map((t) => ({ t, got: props.reported.get(`${t.id}|${day}`) }));
  const done = rows.filter((r) => r.got).length;
  const missing = rows.filter((r) => !r.got);

  return (
    <>
      {props.photoProblem && (
        <div className="setup" style={{ marginBottom: 14 }}>
          <div>
            <b>사진을 보관할 곳이 아직 없습니다</b>
            <p style={{ whiteSpace: "pre-line", wordBreak: "break-all" }}>{props.photoProblem}</p>
          </div>
          <a className="btn-dark" href="https://vercel.com" target="_blank" rel="noreferrer">
            Vercel 열기
          </a>
        </div>
      )}

      <div className="pick-row" style={{ marginBottom: 14 }}>
        <button className="icon-btn" onClick={() => setDay(shiftDay(day, -1))} aria-label="어제">‹</button>
        <input className="input" type="date" value={day} style={{ width: 148 }}
               onChange={(e) => setDay(e.target.value || nowDay)} />
        <button className="icon-btn" onClick={() => setDay(shiftDay(day, 1))} aria-label="내일">›</button>
        {day !== nowDay && (
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setDay(nowDay)}>오늘</button>
        )}
      </div>

      <p className="page-sub" style={{ margin: "0 0 12px" }}>
        {korDate(day)} · 그룹수업 담당 {people.length}명 중 <b>{done}명</b> 보고
      </p>

      {people.length === 0 ? (
        <div className="norow">그룹수업 시간이 정해진 직원이 없습니다</div>
      ) : (
        <>
          {missing.length > 0 && day <= nowDay && (
            <div className="banner">
              <span className="lead"><Icon name="warn" size={18} /></span>
              <div>
                <b>아직 보고하지 않은 사람 {missing.length}명</b>
                <p>{missing.map((r) => r.t.name).join(" · ")}</p>
              </div>
            </div>
          )}

          <div className="lwrap">
            {rows.map(({ t, got }) => (
              <div className="jrow" key={t.id}>
                <div className="jtop">
                  <b>{t.name}</b>
                  <span>
                    {got
                      ? `${got.slots.length}타임 · ${got.slots.join(" · ")}`
                      : `맡은 타임 ${(props.slotsOf.get(t.id) ?? []).join(" · ")}`}
                  </span>
                </div>
                {got ? (
                  <div className="shotrow">
                    {got.photo ? (
                      <button className="thumb" onClick={() => setZoom(got.photo)}>
                        <img src={`/api/lesson-photo?id=${encodeURIComponent(got.photo)}`} alt={`${t.name} 수업 후 사진`} />
                        <span>눌러서 크게 보기</span>
                      </button>
                    ) : (
                      <span className="pill bad">사진 없음</span>
                    )}
                    <span className="spacer" />
                    {killing === t.id ? (
                      <button className="mk-btn miss on" disabled={busy} onClick={() => remove(t.id)}>
                        정말 지웁니다
                      </button>
                    ) : (
                      <button className="mk-btn" onClick={() => setKilling(t.id)}>지우기</button>
                    )}
                  </div>
                ) : (
                  <span className="pill bad">아직 보고 안 함</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {msg && <div className="alert-bad" style={{ marginTop: 12 }}>{msg}</div>}

      {zoom && (
        <div className="modal-back" onClick={() => setZoom("")}>
          <img className="zoom" src={`/api/lesson-photo?id=${encodeURIComponent(zoom)}`} alt="수업 후 사진"
               onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

/* ── 그룹수업 보고 ─────────────────────────── */

/**
 * 그룹수업은 담당 직원과 시간이 이미 정해져 있다
 *
 * 그래서 회원을 고르고 정원을 적는 절차가 없다. 그날 어느 타임을 했는지만 고른다.
 * 사진은 고른 타임 중 가장 늦은 하나에만 붙는다 — 타임마다 올리라고 하면
 * 하루 세 번 올려야 하고, 그러면 안 하게 된다.
 */
function GroupReport(props: {
  me: string;
  myBranch: string;
  trainers: Person[];
  slotsOf: Map<string, string[]>;
  reported: Map<string, { slots: string[]; photo: string }>;
  canPickOther: boolean;
  photoProblem: string;
  onDone: () => void;
}) {
  const nowDay = today();
  const [who, setWho] = useState(
    props.trainers.some((t) => t.id === props.me) ? props.me : (props.trainers[0]?.id ?? "")
  );
  const [day, setDay] = useState(nowDay);
  const [picked, setPicked] = useState<string[]>([]);
  const [photo, setPhoto] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [killing, setKilling] = useState(false);

  const slots = props.slotsOf.get(who) ?? [];
  const already = props.reported.get(`${who}|${day}`);
  const last = lastSlot(picked);

  /*
    이미 보고한 날을 열면 그때 고른 값을 채워 넣는다.
    빈 화면에서 다시 고르게 하면 "고치기"가 아니라 "처음부터 다시"가 되고,
    한 타임만 바꾸려던 사람이 나머지를 빠뜨린다.
  */
  const [filled, setFilled] = useState("");
  const key = `${who}|${day}`;
  useEffect(() => {
    if (filled === key) return;
    setFilled(key);
    setPicked(already ? already.slots : []);
    setPhoto(already ? already.photo : "");
    setMsg("");
    setKilling(false);
  }, [key, already, filled]);

  async function remove() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-group", 사번: who, 날짜: day }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "지우지 못했습니다.");
      props.onDone();
    } catch (e: any) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setMsg("");
    try {
      const small = await shrink(file);
      const fd = new FormData();
      fd.append("file", small, file.name);
      fd.append("날짜", day);
      const res = await fetch("/api/lesson-photo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "사진을 올리지 못했습니다.");
      setPhoto(data.id);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (picked.length === 0) return setMsg("수업한 시간대를 골라주세요.");
    if (!photo) return setMsg("수업 후 사진을 올려야 보고할 수 있습니다.");
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report-group",
          사번: who,
          지점코드: props.myBranch,
          날짜: day,
          slots: picked,
          사진파일: photo,
          메모: memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "보고하지 못했습니다.");
      props.onDone();
    } catch (e: any) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="form-grid" style={{ marginBottom: 14 }}>
        <div className="field">
          <label htmlFor="gd">날짜</label>
          <input id="gd" className="input" type="date" value={day} max={nowDay}
                 onChange={(e) => setDay(e.target.value || nowDay)} />
        </div>
        <div className="field">
          <label htmlFor="gw">수업한 사람</label>
          <select id="gw" className="select" value={who} disabled={!props.canPickOther}
                  onChange={(e) => setWho(e.target.value)}>
            {props.trainers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {already && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <span className="lead"><Icon name="check" size={18} /></span>
          <div>
            <b>이 날은 이미 보고했습니다 — {already.slots.join(" · ")}</b>
            <p>
              아래에 그때 고른 값이 그대로 채워져 있습니다. 고쳐서 다시 보내시면 이 날 기록이
              새것으로 바뀝니다. 아예 없던 일로 하시려면 지우시면 됩니다.
            </p>
          </div>
          {killing ? (
            <button className="btn-danger" style={{ marginTop: 0, whiteSpace: "nowrap" }}
                    disabled={busy} onClick={remove}>
              정말 지웁니다
            </button>
          ) : (
            <button className="btn-ghost" style={{ marginTop: 0, whiteSpace: "nowrap" }}
                    onClick={() => setKilling(true)}>
              보고 지우기
            </button>
          )}
        </div>
      )}

      {slots.length === 0 ? (
        <div className="setup">
          <div>
            <b>이 직원의 그룹수업 시간이 정해져 있지 않습니다</b>
            <p>
              <b>직원 관리</b>에서 그 사람을 열고 <b>그룹수업 시간</b>에
              맡은 타임을 적어주세요 (예: 06:00, 10:00, 19:00). 그러면 여기서 단추로 고르게 됩니다.
            </p>
          </div>
          <a className="btn-dark" href="/dashboard/staff">직원 관리로 가기</a>
        </div>
      ) : (
        <>
          <div className="field">
            <label>오늘 수업한 시간대 ({picked.length}개)</label>
            <div className="pick-row">
              {slots.map((t) => (
                <button key={t} className={`mini-tab${picked.includes(t) ? " on" : ""}`}
                        onClick={() =>
                          setPicked((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))
                        }>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>
              수업 후 사진
              {last && ` — 마지막 타임 ${last} 에 붙습니다`}
            </label>
            {props.photoProblem ? (
              <div className="setup" style={{ marginBottom: 0 }}>
                <div>
                  <b>사진을 보관할 곳이 아직 없습니다</b>
                  {/* 줄바꿈이 그대로 보여야 계정 주소가 한 줄로 떨어진다 */}
                  <p style={{ whiteSpace: "pre-line", wordBreak: "break-all" }}>
                    {props.photoProblem}
                  </p>
                </div>
              </div>
            ) : photo ? (
              <div className="shot">
                <img src={`/api/lesson-photo?id=${encodeURIComponent(photo)}`} alt="수업 후 사진" />
                <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setPhoto("")}>
                  다시 올리기
                </button>
              </div>
            ) : (
              <label className="drop">
                <input type="file" accept="image/*" capture="environment" disabled={busy}
                       onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <Icon name="plus" size={18} />
                <b>{busy ? "올리는 중…" : "사진 고르기 · 찍기"}</b>
                <em>사진이 없으면 보고할 수 없습니다</em>
              </label>
            )}
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="gm">메모</label>
            <input id="gm" className="input" value={memo} placeholder="선택"
                   onChange={(e) => setMemo(e.target.value)} />
          </div>

          {msg && <div className="alert-bad" style={{ marginTop: 12 }}>{msg}</div>}

          <button className="btn-primary" disabled={busy || !photo || picked.length === 0}
                  onClick={send}>
            {busy ? "보내는 중…" : already ? `보고 고치기 (${picked.length}타임)` : `보고 (${picked.length}타임)`}
          </button>
          {!photo && picked.length > 0 && (
            <p className="stat-note" style={{ marginTop: 8 }}>
              사진을 올리면 보고 단추가 켜집니다.
            </p>
          )}
        </>
      )}
    </>
  );
}

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
  const kind = KIND_PT;
  const [trainer, setTrainer] = useState(
    props.trainers.some((t) => t.id === props.me) ? props.me : (props.trainers[0]?.id ?? "")
  );
  const [date, setDate] = useState(props.day);
  const [start, setStart] = useState("");
  /*
    끝나는 시각은 시작 + 50분을 먼저 채워두되, 손대면 그 값을 그대로 쓴다.
    수업료를 시간으로 계산하게 되면 이 값이 곧 돈이라, 짐작한 값을 쓰면 안 된다.
  */
  const [end, setEnd] = useState("");
  const [touched, setTouched] = useState(false);
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

  // 1:1 PT 는 한 명이다. 그룹수업은 여기서 잡지 않고 「그룹수업 보고」에서 다룬다
  const single = true;
  const limit = 1;

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
      상품코드: usable.find((t) => t.id === picked[0].이용권번호)?.상품코드 || "",
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
        <h3>1:1 PT 잡기</h3>

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
