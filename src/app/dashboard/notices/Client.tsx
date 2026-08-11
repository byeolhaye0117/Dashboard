"use client";

/**
 * 공지 · 업무
 *
 * 「오늘 할 일」이 기본이다. 출근해서 여는 화면이므로, 오늘 손이 가야 하는 것이
 * 먼저 나와야 한다. 공지는 안 읽은 것이 있을 때만 눈에 띈다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { korDate, today, addDays, daysBetween } from "@/lib/time";
import { PRIORITIES, NO_PRIORITY, priorityName, priorityTone } from "@/lib/noticeMeta";
import { PRESETS } from "@/lib/taskPresets";

type Notice = {
  id: string; 지점코드: string; 제목: string; 내용: string;
  중요: boolean; 게시일: string; 마감일: string; 등록자: string;
};
type Read = { 공지번호: string; 사번: string; 읽은일시: string };
type Task = {
  id: string; 지점코드: string; 업무명: string; 담당사번: string;
  우선순위: number; 순서: number; 메모: string; 만든날: string; 쓰는중: boolean;
};
type Log = { id: string; 업무번호: string; 날짜: string; 처리자: string; 처리일시: string };
type Named = { code: string; name: string };
type Person = { id: string; name: string };

type Props = {
  me: string;
  myBranch: string;
  branches: Named[];
  people: Person[];
  notices: Notice[];
  reads: Read[];
  tasks: Task[];
  logs: Log[];
  can: { create: boolean; update: boolean; remove: boolean };
  canSetup: boolean;
  /** 아직 없는 탭 이름들 */
  missing: string[];
  ready: boolean;
  problem: string;
};

/**
 * 순위별로 묶는다
 *
 * 한 지점에 예순 개가 넘게 걸린다. 한 덩어리로 뿌리면 스크롤만 하다 끝난다.
 * 1순위가 먼저 눈에 들어오고, 그 안에서 몇 개 남았는지가 보여야 한다.
 */
function byPriority(list: Task[]): { v: number; name: string; tone: string; list: Task[] }[] {
  const order = [...PRIORITIES.map((x) => x.v), NO_PRIORITY];
  return order
    .map((v) => ({
      v,
      name: priorityName(v),
      tone: priorityTone(v),
      list: list.filter((t) => t.우선순위 === v),
    }))
    .filter((g) => g.list.length > 0);
}

/**
 * 순위 골라 보기
 *
 * 1순위만 스물한 개다. 다 펼쳐두면 2순위를 보려고 한참 내려야 한다.
 * 숫자는 "끝난 개수"가 아니라 "남은 개수"다 — 눌러야 할 것이 몇 개인지가
 * 궁금한 것이지, 해치운 것이 몇 개인지는 이미 위에 적혀 있다.
 *
 * 순위가 한 종류뿐이면 고를 것이 없으므로 아예 내보내지 않는다.
 */
function PrioChips(props: {
  list: Task[];
  done: Map<string, Log>;
  value: number;
  onPick: (v: number) => void;
}) {
  const groups = byPriority(props.list);
  if (groups.length < 2) return null;
  const leftOf = (l: Task[]) => l.filter((t) => !props.done.has(t.id)).length;

  const chip = (v: number, name: string, list: Task[]) => {
    const n = leftOf(list);
    return (
      <button key={v} type="button" className={`pickone${props.value === v ? " on" : ""}`}
              onClick={() => props.onPick(v)}>
        <span className="nm">{name}</span>
        <span className="dim">{n > 0 ? `${n} 남음` : "다 끝남"}</span>
      </button>
    );
  };

  return (
    <div className="pick-row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
      {chip(0, "전체", props.list)}
      {groups.map((g) => chip(g.v, g.name, g.list))}
    </div>
  );
}

export default function Client(p: Props) {
  const now = today();
  const [tab, setTab] = useState<"notice" | "check" | "today">("notice");
  const [day, setDay] = useState(now);
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState<Notice | "new" | null>(null);
  const [taskBox, setTaskBox] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  /** 「업무 완료」에서 보고 있는 순위 — 0이면 전체 */
  const [prio, setPrio] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const nameOf = useMemo(() => new Map(p.people.map((x) => [x.id, x.name])), [p.people]);
  const branchOf = useMemo(() => new Map(p.branches.map((b) => [b.code, b.name])), [p.branches]);

  /** 내가 읽은 공지 */
  const readByMe = useMemo(
    () => new Set(p.reads.filter((r) => r.사번 === p.me).map((r) => r.공지번호)),
    [p.reads, p.me]
  );
  const unread = p.notices.filter((n) => !readByMe.has(n.id));

  /** 그날 끝난 업무 */
  const doneOn = useMemo(() => {
    const m = new Map<string, Log>();
    p.logs.filter((l) => l.날짜 === day).forEach((l) => m.set(l.업무번호, l));
    return m;
  }, [p.logs, day]);

  /** 오늘 화면에 뿌릴 업무 — 지금 보는 지점 것 */
  const todayTasks = useMemo(
    // 꺼둔 업무는 오늘 할 일이 아니다
    () => p.tasks.filter((t) => t.지점코드 === p.myBranch && t.쓰는중),
    [p.tasks, p.myBranch]
  );
  const left = todayTasks.filter((t) => !doneOn.has(t.id));

  async function send(payload: any) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/notices", {
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
          <div><h1 className="page-title">공지 · 업무</h1>
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
          <div><h1 className="page-title">공지 · 업무</h1>
            <p className="page-sub">아직 준비되지 않았습니다</p></div>
        </div>
        <SetupTab can={p.canSetup} missing={p.missing} />
      </>
    );
  }

  const openOne = p.notices.find((n) => n.id === open);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">공지 · 업무</h1>
          <p className="page-sub">공지를 읽고, 오늘 업무를 완료로 체크합니다</p>
        </div>
      </div>

      <div className="pick-row" style={{ marginBottom: 14 }}>
        <button className={`mini-tab${tab === "notice" ? " on" : ""}`} onClick={() => setTab("notice")}>
          공지{unread.length > 0 && <span className="dot">{unread.length}</span>}
        </button>
        {/*
          업무를 배정하고 지점 전체를 살피는 자리 — 대표 · 매니저 몫이다.
          등록만 있고 수정이 없는 사람도 배정은 해야 하므로 둘 중 하나면 연다.
        */}
        {(p.can.update || p.can.create) && (
          <button className={`mini-tab${tab === "check" ? " on" : ""}`} onClick={() => setTab("check")}>
            업무 확인
          </button>
        )}
        <button className={`mini-tab${tab === "today" ? " on" : ""}`} onClick={() => setTab("today")}>
          업무 완료{left.length > 0 && <span className="dot">{left.length}</span>}
        </button>
      </div>

      {msg && <div className="alert-bad" style={{ marginBottom: 14 }}>{msg}</div>}

      {/* ── 오늘 할 일 ─────────────────────── */}
      {tab === "today" && (
        <>
          <div className="pick-row" style={{ marginBottom: 12 }}>
            <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="어제">‹</button>
            <input className="input" type="date" value={day} style={{ width: 148 }}
                   onChange={(e) => setDay(e.target.value || now)} />
            <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label="내일">›</button>
            {day !== now && (
              <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setDay(now)}>오늘</button>
            )}
          </div>

          <p className="page-sub" style={{ margin: "0 0 12px" }}>
            {korDate(day)} · {branchOf.get(p.myBranch) ?? p.myBranch}
            {" · "}
            {todayTasks.length === 0 ? "정해진 업무 없음" : <b>{todayTasks.length - left.length} / {todayTasks.length} 끝남</b>}
          </p>

          <PrioChips list={todayTasks} done={doneOn} value={prio} onPick={setPrio} />

          {todayTasks.length === 0 ? (
            <div className="setup">
              <div>
                <b>이 지점에 정해진 업무가 없습니다</b>
                <p>
                  대표님이나 매니저가 <b>업무 확인 → 업무 배정</b>에서 넣어두면
                  여기 체크리스트로 나옵니다. 담당자를 정해두면 그 사람 이름이 같이 보입니다.
                </p>
              </div>
              {(p.can.update || p.can.create) && (
                <button className="btn-dark" onClick={() => setTab("check")}>업무 배정</button>
              )}
            </div>
          ) : (
            byPriority(todayTasks)
              .filter((g) => prio === 0 || g.v === prio)
              .map((g) => {
              const gLeft = g.list.filter((t) => !doneOn.has(t.id)).length;
              return (
                <div key={g.v}>
                  {/* 한 순위만 보고 있으면 위 칸이 이미 말해 준다 */}
                  {prio === 0 && (
                    <h4 className="mini-title">
                      <span className={`pill ${g.tone}`}>{g.name}</span>
                      {" "}{g.list.length - gLeft} / {g.list.length} 끝남
                    </h4>
                  )}
                  <div className="lwrap">
                    {g.list.map((t) => {
                      const log = doneOn.get(t.id);
                      const who = nameOf.get(t.담당사번);
                      return (
                        <div className={`jrow${log ? " is-done" : ""}`} key={t.id}>
                          <div className="jtop">
                            <b>{t.업무명}</b>
                            <span>
                              {who ? `담당 ${who}` : "담당 없음"}
                              {log && ` · ${nameOf.get(log.처리자) ?? log.처리자}님이 ${log.처리일시.slice(11)} 완료`}
                              {t.메모 && ` · ${t.메모}`}
                            </span>
                          </div>
                          <button className={`mk-btn ${log ? "done on" : "go"}`} disabled={busy}
                                  onClick={() => send({ action: "check", 업무번호: t.id, 날짜: day, done: !log })}>
                            {log ? "완료 — 되돌리기" : "완료"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* ── 공지 ───────────────────────────── */}
      {tab === "notice" && (
        <>
          {p.can.create && (
            <div className="pick-row" style={{ marginBottom: 12 }}>
              <span className="spacer" />
              <button className="btn-dark" onClick={() => setWriting("new")}>
                <Icon name="plus" size={14} /> 공지 올리기
              </button>
            </div>
          )}

          {p.notices.length === 0 ? (
            <div className="norow">아직 올라온 공지가 없습니다</div>
          ) : (
            <div className="lwrap">
              {[...p.notices]
                .sort((a, b) => Number(b.중요) - Number(a.중요))
                .map((n) => {
                  const mine = readByMe.has(n.id);
                  const cnt = p.reads.filter((r) => r.공지번호 === n.id).length;
                  return (
                    <button className={`jrow nrow${mine ? "" : " unread"}`} key={n.id}
                            onClick={() => setOpen(n.id)}>
                      <div className="jtop">
                        <b>
                          {n.중요 && <span className="pill bad" style={{ marginRight: 6 }}>중요</span>}
                          {n.제목}
                        </b>
                        <span>
                          {n.게시일} · {n.지점코드 ? branchOf.get(n.지점코드) ?? n.지점코드 : "전 지점"}
                          {p.can.update && ` · ${cnt}명 읽음`}
                        </span>
                      </div>
                      {!mine && <span className="pill bad">안 읽음</span>}
                    </button>
                  );
                })}
            </div>
          )}
        </>
      )}

      {/* ── 업무 확인 (점장 · 대표) ──────────── */}
      {tab === "check" && (p.can.update || p.can.create) && (
        <TaskBoard
          branches={p.branches}
          people={p.people}
          tasks={p.tasks}
          logs={p.logs}
          canAdd={p.can.create}
          canEdit={p.can.update}
          busy={busy}
          onAdd={() => setAdding(true)}
          onEdit={(t) => setTaskBox(t)}
          onSend={send}
        />
      )}

      {openOne && (
        <NoticeBox
          notice={openOne}
          branchName={openOne.지점코드 ? branchOf.get(openOne.지점코드) ?? openOne.지점코드 : "전 지점"}
          readers={p.reads.filter((r) => r.공지번호 === openOne.id)}
          people={p.people}
          canManage={p.can.update}
          readAt={p.reads.find((r) => r.공지번호 === openOne.id && r.사번 === p.me)?.읽은일시 ?? ""}
          busy={busy}
          onRead={() => send({ action: "read", 공지번호: openOne.id })}
          onEdit={() => { setWriting(openOne); setOpen(null); }}
          onDelete={() => send({ action: "notice-del", 공지번호: openOne.id })}
          onClose={() => setOpen(null)}
        />
      )}

      {writing && (
        <NoticeForm
          notice={writing === "new" ? null : writing}
          branches={p.branches}
          busy={busy}
          onSave={(v, again) =>
            writing === "new"
              ? send({ action: "notice-add", ...v })
              : send({ action: "notice-edit", 공지번호: writing.id, changes: {
                  ...v, 중요: v.중요 ? "Y" : "",
                }, 다시읽기: again })
          }
          onClose={() => setWriting(null)}
        />
      )}

      {taskBox && (
        <TaskForm
          task={taskBox}
          branches={p.branches}
          people={p.people}
          myBranch={p.myBranch}
          canRemove={p.can.remove || p.can.update}
          busy={busy}
          onSave={(v) => send({ action: "task-edit", 업무번호: taskBox.id, changes: v })}
          onDelete={() => send({ action: "task-del", 업무번호: taskBox.id })}
          onClose={() => setTaskBox(null)}
        />
      )}

      {adding && (
        <TaskAdd
          branches={p.branches}
          people={p.people}
          myBranch={p.myBranch}
          busy={busy}
          onSave={(payload) => send(payload)}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}

/* ── 업무 확인 ─────────────────────────────── */

/**
 * 지점별로 오늘 무엇이 남았나
 *
 * 「오늘 할 일」은 내가 있는 지점만 본다. 대표님은 네 지점을 한 화면에서
 * 봐야 하고, 무엇보다 "안 끝난 것"이 먼저 보여야 한다.
 *
 * 이 달 몇 번 빠뜨렸는지도 같이 센다. 하루치만 보면 어제 빠뜨린 것은 영영 모른다.
 */
function TaskBoard(props: {
  branches: Named[];
  people: Person[];
  tasks: Task[];
  logs: Log[];
  canAdd: boolean;
  canEdit: boolean;
  busy: boolean;
  onAdd: () => void;
  onEdit: (t: Task) => void;
  onSend: (payload: any) => void;
}) {
  const nowDay = today();
  const [day, setDay] = useState(nowDay);
  const [prio, setPrio] = useState(0);
  /** 골라 둔 업무들 — 한 번에 고치거나 지울 대상 */
  const [picked, setPicked] = useState<string[]>([]);
  /** 꺼둔 업무까지 볼 것인가 */
  const [showOff, setShowOff] = useState(false);
  /** 열어 둔 일괄 처리 창 */
  const [box, setBox] = useState<"" | "who" | "prio" | "copy" | "off" | "on" | "del">("");
  const nameOf = new Map(props.people.map((x) => [x.id, x.name]));

  const live = props.tasks.filter((t) => t.쓰는중);
  const off = props.tasks.filter((t) => !t.쓰는중);
  const inView = showOff ? props.tasks : live;
  const pickedSet = new Set(picked);
  const toggleOne = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const doneOn = useMemo(() => {
    const m = new Map<string, Log>();
    props.logs.filter((l) => l.날짜 === day).forEach((l) => m.set(l.업무번호, l));
    return m;
  }, [props.logs, day]);

  /** 이 달에 며칠이나 했나 — 오늘까지만 센다. 아직 안 온 날은 빠뜨린 게 아니다 */
  /**
   * 이 업무를 이 달에 며칠이나 빠뜨렸나
   *
   * 이 달 지나간 날에서 해낸 날을 뺀다. 다만 만들기 전날까지 빠뜨렸다고 셀 수는
   * 없다 — 오늘 넣은 업무에 「이 달 12일 빠짐」이 붙으면 그 숫자를 아무도 안 믿는다.
   * 아직 안 온 날도 세지 않는다.
   */
  const missOf = useMemo(() => {
    const m = day.slice(0, 7);
    const first = `${m}-01`;
    const lastNo = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
    const last = `${m}-${String(lastNo).padStart(2, "0")}`;

    /*
      오늘은 세지 않는다. 아직 안 끝난 날이다 — 오늘 몫은 줄에 붙은 「안 함」이
      이미 말하고 있고, 여기서 또 세면 같은 하루를 두 번 말하게 된다.
      지난 달을 보고 있으면 그 달 마지막 날까지 다 센다.
    */
    const yesterday = addDays(nowDay, -1);
    const end = yesterday < last ? yesterday : last;

    // 해낸 날도 같은 구간 안에서만 센다. 밖의 것까지 빼면 빠뜨린 날이 가려진다
    const done = new Map<string, number>();
    props.logs.forEach((l) => {
      if (l.날짜 >= first && l.날짜 <= end) {
        done.set(l.업무번호, (done.get(l.업무번호) ?? 0) + 1);
      }
    });

    return (t: Task) => {
      if (end < first) return 0;                       // 아직 오지 않은 달
      const from = t.만든날 && t.만든날 > first ? t.만든날 : first;
      if (from > end) return 0;                        // 이 달에는 아직 없던 업무
      return Math.max(0, daysBetween(from, end) + 1 - (done.get(t.id) ?? 0));
    };
  }, [day, nowDay, props.logs]);

  const groups = props.branches
    .map((b) => ({ b, list: inView.filter((t) => t.지점코드 === b.code) }))
    .filter((g) => g.list.length > 0);

  const leftAll = groups.reduce(
    (n, g) => n + g.list.filter((t) => !doneOn.has(t.id)).length,
    0
  );

  return (
    <>
      <div className="pick-row" style={{ marginBottom: 12 }}>
        <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="어제">‹</button>
        <input className="input" type="date" value={day} style={{ width: 148 }}
               onChange={(e) => setDay(e.target.value || nowDay)} />
        <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label="내일">›</button>
        {day !== nowDay && (
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setDay(nowDay)}>오늘</button>
        )}
        <span className="spacer" />
        {props.canAdd && (
          <button className="btn-dark" onClick={props.onAdd}>
            <Icon name="plus" size={14} /> 업무 배정
          </button>
        )}
      </div>

      <p className="page-sub" style={{ margin: "0 0 12px" }}>
        {korDate(day)} · 지점 {groups.length}곳
        {" · "}
        {leftAll > 0 ? <b className="warn-text">안 끝난 일 {leftAll}개</b> : <b>모두 끝남</b>}
      </p>

      <PrioChips list={inView} done={doneOn} value={prio} onPick={setPrio} />

      {off.length > 0 && (
        <p className="stat-note" style={{ margin: "0 0 12px" }}>
          잠시 꺼둔 업무 {off.length}개{" "}
          <button className="linkish" onClick={() => { setShowOff(!showOff); setPicked([]); }}>
            {showOff ? "감추기" : "보기"}
          </button>
        </p>
      )}

      {/*
        고른 것이 있을 때만 나온다. 늘 떠 있으면 목록을 가리고,
        아무것도 고르지 않았을 때 눌리면 무엇에 대한 동작인지 알 수 없다.
      */}
      {props.canEdit && picked.length > 0 && (
        <div className="save-bar many" style={{ marginBottom: 12 }}>
          <span>{picked.length}개 골랐습니다</span>
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setBox("who")}>담당 바꾸기</button>
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setBox("prio")}>순위 바꾸기</button>
          {props.canAdd && (
            <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setBox("copy")}>다른 지점에 복사</button>
          )}
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setBox("off")}>
            잠시 끄기
          </button>
          {showOff && (
            <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setBox("on")}>
              다시 켜기
            </button>
          )}
          <button className="btn-danger" style={{ marginTop: 0 }} onClick={() => setBox("del")}>지우기</button>
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setPicked([])}>선택 해제</button>
        </div>
      )}

      {box && (
        <TaskBatch
          op={box}
          count={picked.length}
          people={props.people}
          branches={props.branches}
          busy={props.busy}
          onClose={() => setBox("")}
          onRun={(payload) => props.onSend({ ...payload, ids: picked })}
        />
      )}

      {groups.length === 0 ? (
        <div className="setup">
          <div>
            <b>아직 배정된 업무가 없습니다</b>
            <p>
              매일 반복되는 일을 <b>업무 배정</b>으로 넣어두면, 직원 화면의
              <b> 업무 완료</b>에 체크리스트로 나옵니다. 지점마다 따로 넣습니다.
            </p>
          </div>
          {props.canAdd && <button className="btn-dark" onClick={props.onAdd}>업무 배정</button>}
        </div>
      ) : (
        groups
          .filter((g) => prio === 0 || g.list.some((t) => t.우선순위 === prio))
          .map(({ b, list }) => {
          // 순위를 골라 보는 중이면 머리글 숫자도 그 순위 것이어야 한다
          const shown = prio === 0 ? list : list.filter((t) => t.우선순위 === prio);
          const left = shown.filter((t) => !doneOn.has(t.id));
          return (
            <div key={b.code} style={{ marginBottom: 18 }}>
              <h4 className="mini-title">
                {b.name} — {shown.length - left.length} / {shown.length} 끝남
                {prio > 0 && <span className="dim"> ({priorityName(prio)})</span>}
                {props.canEdit && shown.length > 0 && (
                  <button className="linkish"
                          onClick={() => {
                            const ids = shown.map((t) => t.id);
                            const allIn = ids.every((id) => pickedSet.has(id));
                            setPicked((cur) =>
                              allIn
                                ? cur.filter((x) => !ids.includes(x))
                                : [...new Set([...cur, ...ids])]
                            );
                          }}>
                    {shown.every((t) => pickedSet.has(t.id)) ? "선택 해제" : "다 고르기"}
                  </button>
                )}
              </h4>
              {byPriority(list)
                .filter((g) => prio === 0 || g.v === prio)
                .map((g) => {
                const gLeft = g.list.filter((t) => !doneOn.has(t.id)).length;
                return (
                  <div key={g.v} style={{ marginBottom: 10 }}>
                    {prio === 0 && (
                      <p className="stat-note" style={{ margin: "0 0 6px" }}>
                        <span className={`pill ${g.tone}`}>{g.name}</span>
                        {" "}{g.list.length - gLeft} / {g.list.length} 끝남
                      </p>
                    )}
                    <div className="lwrap">
                      {g.list.map((t) => {
                        const log = doneOn.get(t.id);
                        const miss = missOf(t);
                        return (
                          <div className={`jrow${log ? " is-done" : ""}${pickedSet.has(t.id) ? " is-picked" : ""}`}
                               key={t.id}>
                            <div className="jtop">
                              <b>
                                {props.canEdit && (
                                  <input type="checkbox" className="pick-box"
                                         style={{ marginRight: 8 }}
                                         checked={pickedSet.has(t.id)}
                                         onChange={() => toggleOne(t.id)}
                                         aria-label={`${t.업무명} 고르기`} />
                                )}
                                {t.업무명}
                              </b>
                              <span>
                                {nameOf.get(t.담당사번) ? `담당 ${nameOf.get(t.담당사번)}` : "담당 없음"}
                                {log
                                  ? ` · ${nameOf.get(log.처리자) ?? log.처리자}님이 ${log.처리일시.slice(11)} 완료`
                                  : ""}
                              </span>
                            </div>
                            <div className="pick-row">
                              {!t.쓰는중 ? (
                                <span className="pill">꺼둠</span>
                              ) : log ? (
                                <span className="pill good">완료</span>
                              ) : (
                                <span className="pill bad">안 함</span>
                              )}
                              {t.쓰는중 && miss > 0 && <span className="pill">이 달 {miss}일 빠짐</span>}
                              <span className="spacer" />
                              <button className="mk-btn" onClick={() => props.onEdit(t)}>고치기</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </>
  );
}

/* ── 공지 읽기 ─────────────────────────────── */

function NoticeBox(props: {
  notice: Notice;
  branchName: string;
  readers: Read[];
  people: Person[];
  canManage: boolean;
  /** 내가 읽음을 누른 시각. 비어 있으면 아직 안 누른 것 */
  readAt: string;
  busy: boolean;
  onRead: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [killing, setKilling] = useState(false);
  const n = props.notice;

  /*
    끝까지 내려온 사람만 읽음을 누를 수 있게 한다.
    본문이 짧아 내릴 것이 없으면 바로 켠다 — 내릴 수도 없는데 막으면
    영영 못 누른다.
  */
  const bodyRef = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => {
      // 1px 은 기기마다 소수점이 어긋나는 것을 봐주는 값이다
      setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight <= 2);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [n.id]);
  const nameOf = new Map(props.people.map((x) => [x.id, x.name]));
  const readIds = new Set(props.readers.map((r) => r.사번));
  const notYet = props.people.filter((x) => !readIds.has(x.id));

  return (
    <div className="modal-back" onClick={props.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{n.중요 && "★ "}{n.제목}</h3>
        <p className="page-sub" style={{ margin: "0 0 14px" }}>
          {n.게시일} · {props.branchName}
          {n.마감일 && ` · ${n.마감일}까지`}
        </p>

        <div className="ntext" ref={bodyRef}>{n.내용 || "(내용 없음)"}</div>

        {/*
          읽음은 눌러야 남는다. 열자마자 읽은 것으로 치면 "열어봤다"와
          "읽었다"가 구별되지 않는다. 단추를 내용 아래에 두어, 끝까지 내려온
          사람만 누르게 한다.
        */}
        {props.readAt ? (
          <div className="readmark">
            <Icon name="check" size={15} />
            <span>{props.readAt.slice(5, 16)} 에 읽음을 눌렀습니다</span>
          </div>
        ) : (
          <>
            <button className="btn-primary" style={{ marginTop: 14 }}
                    disabled={props.busy || !atEnd} onClick={props.onRead}>
              {props.busy ? "남기는 중…" : atEnd ? "다 읽었습니다" : "끝까지 내려주세요"}
            </button>
            {!atEnd && (
              <p className="stat-note" style={{ marginTop: 8 }}>
                내용을 끝까지 내리면 단추가 켜집니다.
              </p>
            )}
          </>
        )}

        {props.canManage && (
          <>
            <h4 className="mini-title" style={{ marginTop: 18 }}>
              읽음 {props.readers.length}명 · 안 읽음 {notYet.length}명
            </h4>
            <p className="page-sub" style={{ margin: "0 0 6px" }}>
              {props.readers.length > 0
                ? props.readers.map((r) => `${nameOf.get(r.사번) ?? r.사번}(${r.읽은일시.slice(5, 16)})`).join(" · ")
                : "아직 아무도 안 읽었습니다"}
            </p>
            {notYet.length > 0 && (
              <p className="page-sub" style={{ margin: 0, color: "var(--warn)" }}>
                안 읽음 — {notYet.map((x) => x.name).join(" · ")}
              </p>
            )}
          </>
        )}

        <div className="modal-actions">
          {props.canManage && (
            killing ? (
              <button className="btn-danger" style={{ marginTop: 0, marginRight: "auto" }}
                      disabled={props.busy} onClick={props.onDelete}>정말 지웁니다</button>
            ) : (
              <>
                <button className="btn-ghost" style={{ marginTop: 0, marginRight: "auto" }}
                        onClick={() => setKilling(true)}>지우기</button>
                <button className="btn-ghost" style={{ marginTop: 0 }} onClick={props.onEdit}>고치기</button>
              </>
            )
          )}
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={props.onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

/* ── 공지 올리기 ───────────────────────────── */

function NoticeForm(props: {
  notice: Notice | null;
  branches: Named[];
  busy: boolean;
  onSave: (v: any, again: boolean) => void;
  onClose: () => void;
}) {
  const n = props.notice;
  const [f, setF] = useState({
    지점코드: n?.지점코드 ?? "",
    제목: n?.제목 ?? "",
    내용: n?.내용 ?? "",
    중요: n?.중요 ?? false,
    마감일: n?.마감일 ?? "",
  });
  const [again, setAgain] = useState(false);
  const [err, setErr] = useState("");

  function save() {
    if (!f.제목.trim()) return setErr("제목을 적어주세요.");
    props.onSave(f, again);
  }

  return (
    <div className="modal-back" onClick={props.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{n ? "공지 고치기" : "공지 올리기"}</h3>

        <div className="field">
          <label htmlFor="nt">제목</label>
          <input id="nt" className="input" value={f.제목} autoFocus
                 onChange={(e) => setF({ ...f, 제목: e.target.value })} />
        </div>

        <div className="field">
          <label htmlFor="nc">내용</label>
          <textarea id="nc" className="input" rows={6} value={f.내용}
                    onChange={(e) => setF({ ...f, 내용: e.target.value })} />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="nb">받을 곳</label>
            <select id="nb" className="select" value={f.지점코드}
                    onChange={(e) => setF({ ...f, 지점코드: e.target.value })}>
              <option value="">전 지점</option>
              {props.branches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nd">언제까지 (선택)</label>
            <input id="nd" className="input" type="date" value={f.마감일}
                   onChange={(e) => setF({ ...f, 마감일: e.target.value })} />
          </div>
        </div>

        <label className="chk" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={f.중요}
                 onChange={(e) => setF({ ...f, 중요: e.target.checked })} />
          <span>
            <b>중요 표시</b>
            <em>목록 맨 위에 올라갑니다. 다 중요하다고 하면 아무것도 중요하지 않게 됩니다.</em>
          </span>
        </label>

        {n && (
          <label className="chk" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={again}
                   onChange={(e) => setAgain(e.target.checked)} />
            <span>
              <b>읽음을 지우고 다시 읽게 하기</b>
              <em>
                내용을 크게 고쳤을 때만 켜세요. 앞서 읽은 사람도 다시 「안 읽음」이 됩니다.
                오타 하나 고친 것이라면 끄고 저장하시면 됩니다.
              </em>
            </span>
          </label>
        )}

        {err && <div className="alert-bad" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={props.onClose}>취소</button>
          <button className="btn-primary" style={{ marginTop: 0 }} disabled={props.busy} onClick={save}>
            {props.busy ? "저장 중…" : n ? "저장" : "올리기"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 업무 정하기 ───────────────────────────── */

function TaskForm(props: {
  task: Task | null;
  branches: Named[];
  people: Person[];
  myBranch: string;
  canRemove: boolean;
  busy: boolean;
  onSave: (v: any) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = props.task;
  const [f, setF] = useState({
    지점코드: t?.지점코드 ?? props.myBranch,
    업무명: t?.업무명 ?? "",
    담당사번: t?.담당사번 ?? "",
    우선순위: String(t?.우선순위 && t.우선순위 < NO_PRIORITY ? t.우선순위 : ""),
    순서: String(t?.순서 ?? 10),
    메모: t?.메모 ?? "",
  });
  const [killing, setKilling] = useState(false);
  const [err, setErr] = useState("");

  function save() {
    if (!f.업무명.trim()) return setErr("업무 이름을 적어주세요.");
    if (!f.지점코드) return setErr("어느 지점 업무인지 정해주세요.");
    props.onSave({ ...f, 우선순위: Number(f.우선순위) || 0, 순서: Number(f.순서) || 99 });
  }

  return (
    <div className="modal-back" onClick={props.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>업무 고치기</h3>

        <div className="field">
          <label htmlFor="tn">업무 이름</label>
          <input id="tn" className="input" value={f.업무명} autoFocus placeholder="예: 오픈 청소"
                 onChange={(e) => setF({ ...f, 업무명: e.target.value })} />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="tb">지점</label>
            <select id="tb" className="select" value={f.지점코드}
                    onChange={(e) => setF({ ...f, 지점코드: e.target.value })}>
              {props.branches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tp">담당</label>
            <select id="tp" className="select" value={f.담당사번}
                    onChange={(e) => setF({ ...f, 담당사번: e.target.value })}>
              <option value="">정하지 않음</option>
              {props.people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tr">우선순위</label>
            <select id="tr" className="select" value={f.우선순위}
                    onChange={(e) => setF({ ...f, 우선순위: e.target.value })}>
              {PRIORITIES.map((x) => <option key={x.v} value={String(x.v)}>{x.name}</option>)}
              <option value="">정하지 않음</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="to">순서</label>
            <input id="to" className="input" inputMode="numeric" value={f.순서}
                   onChange={(e) => setF({ ...f, 순서: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>
          <div className="field">
            <label htmlFor="tm">메모 (선택)</label>
            <input id="tm" className="input" value={f.메모} placeholder="예: 오픈 30분 전까지"
                   onChange={(e) => setF({ ...f, 메모: e.target.value })} />
          </div>
        </div>

        <p className="stat-note">
          <b>우선순위</b>가 먼저고, 같은 순위 안에서는 <b>순서</b>가 작을수록 위에 나옵니다.
          중간에 끼워 넣으려면 앞뒤 사이의 숫자를 적으시면 됩니다 (10과 20 사이면 15).
        </p>

        {err && <div className="alert-bad" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions">
          {t && props.canRemove && (
            killing ? (
              <button className="btn-danger" style={{ marginTop: 0, marginRight: "auto" }}
                      disabled={props.busy} onClick={props.onDelete}>정말 지웁니다</button>
            ) : (
              <button className="btn-ghost" style={{ marginTop: 0, marginRight: "auto" }}
                      onClick={() => setKilling(true)}>지우기</button>
            )
          )}
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={props.onClose}>취소</button>
          <button className="btn-primary" style={{ marginTop: 0 }} disabled={props.busy} onClick={save}>
            {props.busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 목록 붙여넣기 ─────────────────────────── */

type Parsed = {
  업무명: string;
  담당사번: string;
  담당표기: string;
  우선순위: number;
  메모: string;
  /** 이름을 적었는데 못 찾았거나 같은 이름이 둘일 때 */
  경고: string;
};

/** 「1순위」처럼 그 줄 하나가 머리글인가 — 아래 줄들의 순위를 정한다 */
function headerPriority(line: string): number {
  const m = line.replace(/[[\]()【】]/g, "").trim().match(/^([1-3])\s*순위$/);
  return m ? Number(m[1]) : 0;
}

/**
 * 붙여넣은 글을 업무 목록으로 읽는다
 *
 * 한 줄에 하나. 앞에 붙은 번호(1. 2) -)는 떼어 낸다 — 어디서 복사해 오든
 * 그 정도는 붙어 온다. 슬래시로 담당자와 메모를 덧붙일 수 있게 했다.
 *
 * 「1순위」만 적힌 줄은 업무가 아니라 머리글로 읽고, 그 아래 줄들에 그 순위를
 * 물려준다. 이렇게 해야 예순 개짜리 목록을 세 덩이로 한 번에 붙여넣을 수 있다.
 *   1순위
 *   에어컨 점검 / 정예진 / 온도점검
 *   2순위
 *   바닥 청소
 */
function parseTasks(text: string, people: Person[]): Parsed[] {
  const out: Parsed[] = [];
  let 순위 = 0;

  text.split("\n").forEach((raw) => {
    const line = raw.replace(/^\s*(?:\d+\s*[.)\]]|[-–—•*])\s*/, "").trim();
    if (!line) return;

    // 머리글 줄은 아래 줄들의 순위만 바꾸고 자신은 업무가 되지 않는다
    const head = headerPriority(raw.trim()) || headerPriority(line);
    if (head) { 순위 = head; return; }

    const parts = line.split("/").map((s) => s.trim());
    const 업무명 = parts[0] ?? "";
    if (!업무명) return;
    const who = parts[1] ?? "";
    const 메모 = parts.slice(2).join(" / ").trim();

    let 담당사번 = "";
    let 담당표기 = "";
    let 경고 = "";
    if (who) {
      const hit = people.filter((x) => x.name === who);
      if (hit.length === 1) {
        담당사번 = hit[0].id;
        담당표기 = hit[0].name;
      } else if (hit.length === 0) {
        경고 = `${who} — 그런 이름이 없어 담당을 비웁니다`;
      } else {
        경고 = `${who} — 같은 이름이 ${hit.length}명이라 담당을 비웁니다`;
      }
    }
    out.push({ 업무명, 담당사번, 담당표기, 우선순위: 순위, 메모, 경고 });
  });

  return out;
}

/**
 * 업무를 새로 넣는 창
 *
 * 두 가지 길을 한 창에 둔다. 하나만 넣을 때는 칸을 채우는 편이 정확하고
 * (순서 숫자까지 직접 정한다), 예순 개를 넣을 때는 글로 적는 편이 빠르다.
 * 창을 둘로 나누면 어느 단추를 눌러야 하는지부터 고민하게 된다.
 */
function TaskAdd(props: {
  branches: Named[];
  people: Person[];
  myBranch: string;
  busy: boolean;
  onSave: (payload: any) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"one" | "many">("one");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>(
    props.branches.some((b) => b.code === props.myBranch) ? [props.myBranch] : []
  );
  /** 줄에 이름을 안 쓴 업무를 맡을 사람 */
  const [defWho, setDefWho] = useState("");
  /** 「한 개씩」에서 쓰는 칸들 */
  const [one, setOne] = useState({
    업무명: "",
    담당사번: "",
    우선순위: "1",
    순서: "",
    메모: "",
  });
  const [err, setErr] = useState("");

  const parsed = useMemo(() => parseTasks(text, props.people), [text, props.people]);

  /*
    이름을 안 쓴 줄은 위에서 고른 사람이 맡는다. 예순 줄에 「/ 정예진」을
    예순 번 쓰게 할 이유가 없다. 줄에 쓴 이름이 언제나 위 칸을 이긴다 —
    한 사람만 다르게 지정하는 것이 흔한 일이다.
  */
  const rows = useMemo(() => {
    if (!defWho) return parsed;
    const nm = props.people.find((x) => x.id === defWho)?.name ?? "";
    return parsed.map((r) =>
      r.담당사번 ? r : { ...r, 담당사번: defWho, 담당표기: nm, 경고: "" }
    );
  }, [parsed, defWho, props.people]);

  const warns = rows.filter((r) => r.경고);

  /** 순위별 몇 개인지 — 붙여넣기가 제대로 나뉘었는지 눈으로 확인하는 자리다 */
  const tally = useMemo(() => {
    const parts = PRIORITIES
      .map((x) => ({ x, n: rows.filter((r) => r.우선순위 === x.v).length }))
      .filter((g) => g.n > 0)
      .map((g) => `${g.x.name} ${g.n}`);
    const none = rows.filter((r) => r.우선순위 === 0).length;
    if (none > 0 && parts.length > 0) parts.push(`순위 없음 ${none}`);
    return parts.length > 1 ? parts.join(" · ") : "";
  }, [rows]);

  const toggle = (code: string) =>
    setPicked((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  function save() {
    if (picked.length === 0) return setErr("어느 지점에 넣을지 골라주세요.");

    if (mode === "one") {
      if (!one.업무명.trim()) return setErr("업무 이름을 적어주세요.");
      /*
        여러 지점을 골랐어도 한 번에 보낸다. 「한 개씩」은 만드는 방식을 말하는
        것이지 지점 수를 말하는 것이 아니다 — 같은 일을 네 지점에 하나씩 넣는
        일도 흔하다.
      */
      return props.onSave({
        action: "task-bulk",
        지점들: picked,
        items: [{
          업무명: one.업무명.trim(),
          담당사번: one.담당사번 || defWho,
          우선순위: Number(one.우선순위) || 0,
          메모: one.메모,
          순서: Number(one.순서) || 0,
        }],
      });
    }

    if (rows.length === 0) return setErr("업무를 한 줄에 하나씩 적어주세요.");
    props.onSave({
      action: "task-bulk",
      지점들: picked,
      items: rows.map((r) => ({
        업무명: r.업무명, 담당사번: r.담당사번, 우선순위: r.우선순위, 메모: r.메모,
      })),
    });
  }

  return (
    <div className="modal-back" onClick={props.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>업무 배정</h3>

        <div className="pick-row" style={{ margin: "12px 0 4px" }}>
          <button className={`mini-tab${mode === "one" ? " on" : ""}`}
                  onClick={() => { setMode("one"); setErr(""); }}>한 개씩</button>
          <button className={`mini-tab${mode === "many" ? " on" : ""}`}
                  onClick={() => { setMode("many"); setErr(""); }}>목록으로</button>
        </div>

        {mode === "one" ? (
          <p className="stat-note" style={{ marginTop: 0 }}>
            칸을 채워 하나를 넣습니다. <b>순서</b> 숫자까지 직접 정할 수 있어,
            이미 있는 목록 사이에 끼워 넣을 때 씁니다.
          </p>
        ) : (
          <p className="stat-note" style={{ marginTop: 0 }}>
            <b>한 줄에 하나씩</b> 적습니다. 적은 차례가 그대로 화면에 나오는 차례가 됩니다.
            <br />
            줄마다 메모를 붙이려면 <b>업무 이름 / 메모</b>, 그 줄만 담당자가 다르면
            <b> 업무 이름 / 담당자 이름 / 메모</b> 로 적습니다.
            <br />
            <b>1순위</b>·<b>2순위</b>·<b>3순위</b>만 적힌 줄을 사이에 넣으면 그 아래가 그 순위로
            묶입니다. 앞에 붙은 번호(1. 2) -)는 알아서 뗍니다.
          </p>
        )}

        <div className="field" style={{ marginTop: 16 }}>
          <label>어느 지점에 넣을까요</label>
          <div className="pickbox">
            {props.branches.map((b) => (
              <button key={b.code} type="button"
                      className={`pickone${picked.includes(b.code) ? " on" : ""}`}
                      onClick={() => toggle(b.code)}>
                <span className="nm">{b.name}</span>
              </button>
            ))}
          </div>
          <p className="stat-note">
            여러 지점을 고르면 같은 목록이 지점마다 따로 만들어집니다.
          </p>
        </div>

        {mode === "many" && (
          <div className="field">
            <label htmlFor="defwho">담당 (줄에 이름을 안 쓴 업무)</label>
            <select id="defwho" className="select" value={defWho}
                    onChange={(e) => setDefWho(e.target.value)}>
              <option value="">담당 없음</option>
              {props.people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <p className="stat-note">
              줄에 <b>/ 이름</b>을 적은 업무는 그 사람이 맡습니다. 여기서 고른 사람은
              이름을 안 쓴 줄에만 들어갑니다.
            </p>
          </div>
        )}

        {mode === "one" && (
          <>
            <div className="field">
              <label htmlFor="on">업무 이름</label>
              <input id="on" className="input" value={one.업무명} autoFocus placeholder="예: 오픈 청소"
                     onChange={(e) => { setOne({ ...one, 업무명: e.target.value }); setErr(""); }} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ow">담당</label>
                <select id="ow" className="select" value={one.담당사번}
                        onChange={(e) => setOne({ ...one, 담당사번: e.target.value })}>
                  <option value="">정하지 않음</option>
                  {props.people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="op">우선순위</label>
                <select id="op" className="select" value={one.우선순위}
                        onChange={(e) => setOne({ ...one, 우선순위: e.target.value })}>
                  {PRIORITIES.map((x) => <option key={x.v} value={String(x.v)}>{x.name}</option>)}
                  <option value="">정하지 않음</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="oo">순서 (선택)</label>
                <input id="oo" className="input" inputMode="numeric" value={one.순서}
                       placeholder="비우면 맨 뒤"
                       onChange={(e) => setOne({ ...one, 순서: e.target.value.replace(/[^0-9]/g, "") })} />
              </div>
              <div className="field">
                <label htmlFor="om">메모 (선택)</label>
                <input id="om" className="input" value={one.메모} placeholder="예: 오픈 30분 전까지"
                       onChange={(e) => setOne({ ...one, 메모: e.target.value })} />
              </div>
            </div>
            <p className="stat-note">
              순서를 비우면 같은 순위의 <b>맨 뒤</b>에 붙습니다. 사이에 끼우려면 앞뒤 사이의
              숫자를 적으시면 됩니다 — 10과 20 사이면 15.
            </p>
          </>
        )}

        {mode === "many" && (
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="pastebox">업무 목록</label>
          {/*
            예순 개짜리 목록을 휴대폰에서 복사해 붙여넣게 하는 것은 그 자체가 일이다.
            자주 쓰는 목록은 여기서 바로 채운다.
          */}
          {PRESETS.length > 0 && (
            <div className="pick-row" style={{ marginBottom: 8 }}>
              {PRESETS.map((ps) => (
                <button key={ps.name} type="button" className="btn-ghost"
                        style={{ marginTop: 0 }}
                        onClick={() => { setText(ps.text); setErr(""); }}>
                  {ps.name} 불러오기
                </button>
              ))}
              <span className="dim" style={{ fontSize: 11.5 }}>{PRESETS[0].note}</span>
            </div>
          )}
          <textarea id="pastebox" className="input" style={{ height: 190 }} value={text} autoFocus
                    placeholder={"1순위\n오픈 청소 / 김코치\n2순위\n수건 정리\n기구 점검 / 김코치 / 오픈 30분 전까지"}
                    onChange={(e) => { setText(e.target.value); setErr(""); }} />
        </div>
        )}

        {mode === "many" && rows.length > 0 && (
          <>
            <h4 className="mini-title">
              이렇게 만들어집니다 — {rows.length}개
              {picked.length > 1 && ` × 지점 ${picked.length}곳 = ${rows.length * picked.length}개`}
              {tally && ` (${tally})`}
            </h4>
            <div className="lwrap">
              {rows.map((r, i) => (
                <div className="jrow" key={i}>
                  <div className="jtop">
                    <b>
                      {r.우선순위 > 0 && (
                        <span className={`pill ${priorityTone(r.우선순위)}`}
                              style={{ marginRight: 6 }}>
                          {priorityName(r.우선순위)}
                        </span>
                      )}
                      {i + 1}. {r.업무명}
                    </b>
                    <span>
                      {r.담당표기 ? `담당 ${r.담당표기}` : "담당 없음"}
                      {r.메모 ? ` · ${r.메모}` : ""}
                    </span>
                  </div>
                  {r.경고 && <span className="pill bad">{r.경고}</span>}
                </div>
              ))}
            </div>
            {warns.length > 0 && (
              <p className="stat-note">
                이름을 못 찾은 줄은 <b>{defWho ? "위에서 고른 담당" : "담당 없음"}</b>으로
                만들어집니다. 나중에 한 줄씩 고칠 수 있으니 그대로 넣어도 됩니다.
              </p>
            )}
          </>
        )}

        {err && <div className="alert-bad" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={props.onClose}>취소</button>
          <button className="btn-primary" style={{ marginTop: 0 }} disabled={props.busy} onClick={save}>
            {props.busy
              ? "만드는 중…"
              : mode === "one"
                ? picked.length > 1 ? `지점 ${picked.length}곳에 만들기` : "만들기"
                : rows.length === 0
                  ? "만들기"
                  : `${rows.length * Math.max(1, picked.length)}개 만들기`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 여러 개를 한꺼번에 처리하는 창
 *
 * 무엇을, 몇 개에 하는지를 먼저 크게 적는다. 예순 개를 골라 놓고
 * 무심코 지우는 일이 없어야 한다.
 */
function TaskBatch(props: {
  op: "who" | "prio" | "copy" | "off" | "on" | "del";
  count: number;
  people: Person[];
  branches: Named[];
  busy: boolean;
  onClose: () => void;
  onRun: (payload: any) => void;
}) {
  const [who, setWho] = useState("");
  const [prio, setPrio] = useState("1");
  const [toBranches, setToBranches] = useState<string[]>([]);
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState("");

  const TITLES: Record<string, string> = {
    who: "담당 바꾸기", prio: "순위 바꾸기", copy: "다른 지점에 복사",
    off: "잠시 끄기", on: "다시 켜기", del: "지우기",
  };

  function run() {
    if (props.op === "who") return props.onRun({ action: "task-batch", changes: { 담당사번: who } });
    if (props.op === "prio")
      return props.onRun({ action: "task-batch", changes: { 우선순위: Number(prio) || 0 } });
    if (props.op === "copy") {
      if (toBranches.length === 0) return setErr("어느 지점에 넣을지 골라주세요.");
      return props.onRun({ action: "task-copy", 지점들: toBranches });
    }
    if (props.op === "off") return props.onRun({ action: "task-batch", changes: { 사용여부: "N" } });
    if (props.op === "on") return props.onRun({ action: "task-batch", changes: { 사용여부: "Y" } });
    return props.onRun({ action: "task-batch", changes: { 삭제여부: "Y" } });
  }

  return (
    <div className="modal-back" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{TITLES[props.op]}</h3>
        <p className="stat-note" style={{ marginTop: 0 }}>
          고른 업무 <b>{props.count}개</b>에 적용합니다.
        </p>

        {props.op === "who" && (
          <div className="field">
            <label htmlFor="bw">누구에게</label>
            <select id="bw" className="select" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">담당 없음으로</option>
              {props.people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        )}

        {props.op === "prio" && (
          <div className="field">
            <label htmlFor="bp">어느 순위로</label>
            <select id="bp" className="select" value={prio} onChange={(e) => setPrio(e.target.value)}>
              {PRIORITIES.map((x) => <option key={x.v} value={String(x.v)}>{x.name}</option>)}
              <option value="">순위 없음으로</option>
            </select>
          </div>
        )}

        {props.op === "copy" && (
          <div className="field">
            <label>어느 지점에</label>
            <div className="pickbox">
              {props.branches.map((b) => (
                <button key={b.code} type="button"
                        className={`pickone${toBranches.includes(b.code) ? " on" : ""}`}
                        onClick={() =>
                          setToBranches((cur) =>
                            cur.includes(b.code) ? cur.filter((c) => c !== b.code) : [...cur, b.code]
                          )
                        }>
                  <span className="nm">{b.name}</span>
                </button>
              ))}
            </div>
            <p className="stat-note">
              원래 지점 것은 그대로 두고 <b>새로 만듭니다.</b> 순위·순서·담당·메모를 그대로 옮깁니다.
            </p>
          </div>
        )}

        {props.op === "off" && (
          <p className="stat-note">
            체크리스트에서 빠지지만 <b>지워지지 않습니다.</b> 지난 기록도 그대로 남습니다.
            필요해지면 <b>꺼둔 업무 보기 → 다시 켜기</b>로 되돌립니다.
          </p>
        )}
        {props.op === "on" && (
          <p className="stat-note">다시 오늘 체크리스트에 나옵니다.</p>
        )}
        {props.op === "del" && (
          <p className="stat-note">
            체크리스트에서 사라집니다. 지난 기록은 남지만 목록에서는 다시 못 켭니다.
            <b> 잠시 안 하는 일이라면 「잠시 끄기」</b>가 낫습니다.
          </p>
        )}

        {err && <div className="alert-bad" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={props.onClose}>취소</button>
          {props.op === "del" ? (
            sure ? (
              <button className="btn-danger" style={{ marginTop: 0 }} disabled={props.busy} onClick={run}>
                {props.busy ? "지우는 중…" : "정말 지웁니다"}
              </button>
            ) : (
              <button className="btn-danger" style={{ marginTop: 0 }} onClick={() => setSure(true)}>
                지우기
              </button>
            )
          ) : (
            <button className="btn-primary" style={{ marginTop: 0 }} disabled={props.busy} onClick={run}>
              {props.busy ? "바꾸는 중…" : `${props.count}개 바꾸기`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 탭이 아직 없을 때 ─────────────────────── */

function SetupTab({ can, missing }: { can: boolean; missing: string[] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");

  if (done) {
    return (
      <div className="setup done">
        <div>{done} <b>새로고침</b>하면 공지·업무를 쓸 수 있습니다.</div>
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
        body: JSON.stringify({ set: "공지" }),
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
        <b>
          {missing.length > 0
            ? `시트에 ${missing.join(" · ")} 탭이 없습니다`
            : "공지 탭이 시트에 없습니다"}
        </b>
        <p>
          누르면 구글 시트에 <b>공지 · 공지읽음 · 업무 · 업무기록</b> 네 탭을 만듭니다.
          이미 있는 것은 건너뛰고 없는 것만 만듭니다.
        </p>
        {msg && <p className="err">{msg}</p>}
      </div>
      {can ? (
        <button className="btn-dark" onClick={run} disabled={busy}>
          {busy ? "만드는 중…" : "공지 탭 만들기"}
        </button>
      ) : (
        <span className="dim" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
          대표만 만들 수 있습니다
        </span>
      )}
    </div>
  );
}
