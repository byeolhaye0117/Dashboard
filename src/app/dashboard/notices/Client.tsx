"use client";

/**
 * 공지 · 업무
 *
 * 「오늘 할 일」이 기본이다. 출근해서 여는 화면이므로, 오늘 손이 가야 하는 것이
 * 먼저 나와야 한다. 공지는 안 읽은 것이 있을 때만 눈에 띈다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { korDate, today } from "@/lib/time";

type Notice = {
  id: string; 지점코드: string; 제목: string; 내용: string;
  중요: boolean; 게시일: string; 마감일: string; 등록자: string;
};
type Read = { 공지번호: string; 사번: string; 읽은일시: string };
type Task = { id: string; 지점코드: string; 업무명: string; 담당사번: string; 순서: number; 메모: string };
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
  ready: boolean;
  problem: string;
};

function shiftDay(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00+09:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

export default function Client(p: Props) {
  const now = today();
  const [tab, setTab] = useState<"today" | "notice" | "check" | "task">("today");
  const [day, setDay] = useState(now);
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState<Notice | "new" | null>(null);
  const [taskBox, setTaskBox] = useState<Task | "new" | null>(null);
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
    () => p.tasks.filter((t) => t.지점코드 === p.myBranch),
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
        <SetupTab can={p.canSetup} />
      </>
    );
  }

  const openOne = p.notices.find((n) => n.id === open);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">공지 · 업무</h1>
          <p className="page-sub">오늘 할 일을 체크하고, 공지를 읽습니다</p>
        </div>
      </div>

      <div className="pick-row" style={{ marginBottom: 14 }}>
        <button className={`mini-tab${tab === "today" ? " on" : ""}`} onClick={() => setTab("today")}>
          오늘 할 일{left.length > 0 && <span className="dot">{left.length}</span>}
        </button>
        <button className={`mini-tab${tab === "notice" ? " on" : ""}`} onClick={() => setTab("notice")}>
          공지{unread.length > 0 && <span className="dot">{unread.length}</span>}
        </button>
        {p.can.update && (
          <>
            <button className={`mini-tab${tab === "check" ? " on" : ""}`} onClick={() => setTab("check")}>
              업무 확인
            </button>
            <button className={`mini-tab${tab === "task" ? " on" : ""}`} onClick={() => setTab("task")}>
              업무 정하기
            </button>
          </>
        )}
      </div>

      {msg && <div className="alert-bad" style={{ marginBottom: 14 }}>{msg}</div>}

      {/* ── 오늘 할 일 ─────────────────────── */}
      {tab === "today" && (
        <>
          <div className="pick-row" style={{ marginBottom: 12 }}>
            <button className="icon-btn" onClick={() => setDay(shiftDay(day, -1))} aria-label="어제">‹</button>
            <input className="input" type="date" value={day} style={{ width: 148 }}
                   onChange={(e) => setDay(e.target.value || now)} />
            <button className="icon-btn" onClick={() => setDay(shiftDay(day, 1))} aria-label="내일">›</button>
            {day !== now && (
              <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setDay(now)}>오늘</button>
            )}
          </div>

          <p className="page-sub" style={{ margin: "0 0 12px" }}>
            {korDate(day)} · {branchOf.get(p.myBranch) ?? p.myBranch}
            {" · "}
            {todayTasks.length === 0 ? "정해진 업무 없음" : <b>{todayTasks.length - left.length} / {todayTasks.length} 끝남</b>}
          </p>

          {todayTasks.length === 0 ? (
            <div className="setup">
              <div>
                <b>이 지점에 정해진 업무가 없습니다</b>
                <p>
                  매일 반복되는 일을 <b>업무 정하기</b>에서 넣어두면, 여기 체크리스트로 나옵니다.
                  담당자를 정해두면 그 사람 이름이 같이 보입니다.
                </p>
              </div>
              {p.can.update && (
                <button className="btn-dark" onClick={() => setTab("task")}>업무 정하기</button>
              )}
            </div>
          ) : (
            <div className="lwrap">
              {todayTasks.map((t) => {
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
      {tab === "check" && p.can.update && (
        <TaskBoard
          branches={p.branches}
          people={p.people}
          tasks={p.tasks}
          logs={p.logs}
        />
      )}

      {/* ── 업무 정하기 ─────────────────────── */}
      {tab === "task" && p.can.update && (
        <>
          <div className="pick-row" style={{ marginBottom: 12 }}>
            <span className="spacer" />
            {p.can.create && (
              <button className="btn-dark" onClick={() => setTaskBox("new")}>
                <Icon name="plus" size={14} /> 업무 추가
              </button>
            )}
          </div>

          {p.tasks.length === 0 ? (
            <div className="norow">정해진 업무가 없습니다</div>
          ) : (
            <div className="lwrap">
              {p.tasks.map((t) => (
                <div className="jrow" key={t.id}>
                  <div className="jtop">
                    <b>{t.업무명}</b>
                    <span>
                      {branchOf.get(t.지점코드) ?? t.지점코드}
                      {" · "}
                      {nameOf.get(t.담당사번) ? `담당 ${nameOf.get(t.담당사번)}` : "담당 없음"}
                      {` · 순서 ${t.순서}`}
                    </span>
                  </div>
                  <button className="mk-btn" onClick={() => setTaskBox(t)}>고치기</button>
                </div>
              ))}
            </div>
          )}
        </>
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
          task={taskBox === "new" ? null : taskBox}
          branches={p.branches}
          people={p.people}
          myBranch={p.myBranch}
          canRemove={p.can.remove || p.can.update}
          busy={busy}
          onSave={(v) =>
            taskBox === "new"
              ? send({ action: "task-add", ...v })
              : send({ action: "task-edit", 업무번호: taskBox.id, changes: v })
          }
          onDelete={() => taskBox !== "new" && send({ action: "task-del", 업무번호: taskBox.id })}
          onClose={() => setTaskBox(null)}
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
}) {
  const nowDay = today();
  const [day, setDay] = useState(nowDay);
  const nameOf = new Map(props.people.map((x) => [x.id, x.name]));

  const doneOn = useMemo(() => {
    const m = new Map<string, Log>();
    props.logs.filter((l) => l.날짜 === day).forEach((l) => m.set(l.업무번호, l));
    return m;
  }, [props.logs, day]);

  /** 이 달에 며칠이나 했나 — 오늘까지만 센다. 아직 안 온 날은 빠뜨린 게 아니다 */
  const monthDone = useMemo(() => {
    const m = day.slice(0, 7);
    const cnt = new Map<string, number>();
    props.logs
      .filter((l) => l.날짜.startsWith(m) && l.날짜 <= nowDay)
      .forEach((l) => cnt.set(l.업무번호, (cnt.get(l.업무번호) ?? 0) + 1));
    return cnt;
  }, [props.logs, day, nowDay]);

  /** 이 달에 지나간 날 수 */
  const passed = useMemo(() => {
    const m = day.slice(0, 7);
    const last = nowDay.startsWith(m) ? Number(nowDay.slice(8, 10)) : new Date(
      Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0
    ).getDate();
    return nowDay.slice(0, 7) < m ? 0 : last;
  }, [day, nowDay]);

  const groups = props.branches
    .map((b) => ({ b, list: props.tasks.filter((t) => t.지점코드 === b.code) }))
    .filter((g) => g.list.length > 0);

  const leftAll = groups.reduce(
    (n, g) => n + g.list.filter((t) => !doneOn.has(t.id)).length,
    0
  );

  return (
    <>
      <div className="pick-row" style={{ marginBottom: 12 }}>
        <button className="icon-btn" onClick={() => setDay(shiftDay(day, -1))} aria-label="어제">‹</button>
        <input className="input" type="date" value={day} style={{ width: 148 }}
               onChange={(e) => setDay(e.target.value || nowDay)} />
        <button className="icon-btn" onClick={() => setDay(shiftDay(day, 1))} aria-label="내일">›</button>
        {day !== nowDay && (
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setDay(nowDay)}>오늘</button>
        )}
      </div>

      <p className="page-sub" style={{ margin: "0 0 12px" }}>
        {korDate(day)} · 지점 {groups.length}곳
        {" · "}
        {leftAll > 0 ? <b className="warn-text">안 끝난 일 {leftAll}개</b> : <b>모두 끝남</b>}
      </p>

      {groups.length === 0 ? (
        <div className="norow">정해진 업무가 없습니다</div>
      ) : (
        groups.map(({ b, list }) => {
          const left = list.filter((t) => !doneOn.has(t.id));
          return (
            <div key={b.code} style={{ marginBottom: 18 }}>
              <h4 className="mini-title">
                {b.name} — {list.length - left.length} / {list.length} 끝남
              </h4>
              <div className="lwrap">
                {list.map((t) => {
                  const log = doneOn.get(t.id);
                  const did = monthDone.get(t.id) ?? 0;
                  const miss = Math.max(0, passed - did);
                  return (
                    <div className={`jrow${log ? " is-done" : ""}`} key={t.id}>
                      <div className="jtop">
                        <b>{t.업무명}</b>
                        <span>
                          {nameOf.get(t.담당사번) ? `담당 ${nameOf.get(t.담당사번)}` : "담당 없음"}
                          {log
                            ? ` · ${nameOf.get(log.처리자) ?? log.처리자}님이 ${log.처리일시.slice(11)} 완료`
                            : ""}
                        </span>
                      </div>
                      <div className="pick-row">
                        {log ? (
                          <span className="pill good">완료</span>
                        ) : (
                          <span className="pill bad">안 함</span>
                        )}
                        {miss > 0 && <span className="pill">이 달 {miss}일 빠짐</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
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
    순서: String(t?.순서 ?? 10),
    메모: t?.메모 ?? "",
  });
  const [killing, setKilling] = useState(false);
  const [err, setErr] = useState("");

  function save() {
    if (!f.업무명.trim()) return setErr("업무 이름을 적어주세요.");
    if (!f.지점코드) return setErr("어느 지점 업무인지 정해주세요.");
    props.onSave({ ...f, 순서: Number(f.순서) || 99 });
  }

  return (
    <div className="modal-back" onClick={props.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{t ? "업무 고치기" : "업무 추가"}</h3>

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
          매일 반복되는 일만 넣습니다. 한 번만 하는 일은 <b>공지</b>로 알리는 편이 낫습니다.
          순서가 작을수록 위에 나옵니다.
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

/* ── 탭이 아직 없을 때 ─────────────────────── */

function SetupTab({ can }: { can: boolean }) {
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
        <b>공지 탭이 시트에 없습니다</b>
        <p>
          누르면 구글 시트에 <b>공지 · 공지읽음 · 업무 · 업무기록</b> 네 탭을 만듭니다.
          이미 있으면 건너뜁니다.
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
