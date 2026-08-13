"use client";

/**
 * 직원 목록 · 계정 발급 · 담당 지점 배정
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { showPhone } from "@/lib/phone";
import { WEEKDAYS, WEEKEND, daysText } from "@/lib/attendanceMeta";

type Staff = {
  id: string;
  name: string;
  phone: string;
  roleCode: string;
  mainBranch: string;
  branches: string[];
  status: string;
  accountOn: boolean;
  hasPassword: boolean;
  temp: boolean;
  /** 근태 기준 시각 — 비어 있으면 지각·조퇴를 판정하지 않는다 */
  baseTime: string;
  outTime: string;
  restMin: string;
  restVary: boolean;
  workDays: string;
  /** 수업을 맡는 사람인가 — 직급과 별개로 사람마다 정한다 */
  trainer: boolean;
  /** 맡은 그룹수업 시간대 "06:00,10:00,19:00" */
  groupSlots: string;
};

type Named = { code: string; name: string };

type Props = {
  items: Staff[];
  roles: Named[];
  branches: Named[];
  me: string;
  myRole: string;
  can: { create: boolean; update: boolean; remove: boolean };
};

const STATUSES = ["재직중", "휴직", "퇴사"];

/** 로그인이 되는 상태인가 */
const canLogin = (s: Staff) => s.accountOn && s.status === "재직중" && s.hasPassword;
/** 계정은 살아 있는데 비밀번호만 없는 사람 — 지금 손이 가야 하는 사람이다 */
const needsPassword = (s: Staff) => s.accountOn && s.status === "재직중" && !s.hasPassword;

export default function Client(p: Props) {
  const [tab, setTab] = useState("전체");
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [detail, setDetail] = useState<Staff | null>(null);
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);
  /** 목록에서 고른 사람들 — 한 번에 바꾸기용 */
  const [picked, setPicked] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);

  const roleName = (c: string) => p.roles.find((r) => r.code === c)?.name ?? c;
  const branchName = (c: string) => p.branches.find((b) => b.code === c)?.name ?? c;

  const waiting = p.items.filter(needsPassword).length;
  const active = p.items.filter(canLogin).length;
  const off = p.items.filter((s) => s.status !== "재직중" || !s.accountOn).length;

  const list = useMemo(() => {
    return p.items.filter((s) => {
      if (tab === "발급대기" && !needsPassword(s)) return false;
      if (tab === "사용중" && !canLogin(s)) return false;
      if (tab === "중지" && s.status === "재직중" && s.accountOn) return false;
      if (q) {
        const hay = `${s.name} ${s.phone} ${roleName(s.roleCode)}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [p.items, tab, q]);

  /** 지금 필터에 걸린 사람 중 고른 사람 — 필터를 바꿔도 고른 것은 남는다 */
  const shown = list.map((s) => s.id);
  const allOn = shown.length > 0 && shown.every((id) => picked.includes(id));

  function toggleOne(id: string) {
    setPicked((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }
  function toggleAll() {
    setPicked((v) =>
      allOn ? v.filter((id) => !shown.includes(id)) : [...new Set([...v, ...shown])]
    );
  }

  async function issue(id: string) {
    const res = await fetch("/api/staff/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error ?? "발급하지 못했습니다.");
    setIssued({ name: data.name, password: data.password });
    setDetail(null);
  }

  /* 예전에 넣었던 [샘플] 자료 지우기 — 한 번 쓰고 말 일이라 화면 맨 아래 작게 둔다 */
  const [wiping, setWiping] = useState(false);
  const [wipeNote, setWipeNote] = useState("");

  async function wipeSample() {
    if (wiping) return;
    setWiping(true);
    setWipeNote("");
    try {
      const res = await fetch("/api/cleanup", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "지우지 못했습니다.");
      setWipeNote(
        j.count > 0
          ? `가짜 자료 ${j.count}줄을 지웠습니다. 새로고침하면 반영됩니다.`
          : "지울 가짜 자료가 없습니다. 시트에 있는 것은 전부 진짜 자료입니다."
      );
    } catch (e: any) {
      setWipeNote(String(e.message ?? e));
    } finally {
      setWiping(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">직원 관리</h1>
        </div>
        {p.can.create && (
          <button className="btn-dark" onClick={() => setOpenNew(true)}>
            <Icon name="plus" size={16} strokeWidth={2} />
            직원 추가
          </button>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="lb">전체 직원</div>
          <div className="vl num">{p.items.length}</div>
          <div className="dt">지점 {p.branches.length}곳</div>
        </div>
        <div className="stat">
          <div className="lb">로그인 가능</div>
          <div className="vl num">{active}</div>
          <div className="dt">비밀번호가 정해진 계정</div>
        </div>
        <div className="stat">
          <div className="lb">발급 대기</div>
          <div className="vl num">{waiting}</div>
          <div className="dt">아직 못 들어오는 직원</div>
        </div>
        <div className="stat">
          <div className="lb">중지 · 퇴사</div>
          <div className="vl num">{off}</div>
          <div className="dt">로그인이 막힌 계정</div>
        </div>
      </div>

      <p className="stat-note">
        {waiting > 0 ? (
          <>
            <b className="warn-text">{waiting}명</b>이 아직 로그인할 수 없습니다.
            이름을 눌러 <b>비밀번호 발급</b>을 하시고, 그 자리에서 나오는 비밀번호를
            본인에게 알려주시면 됩니다.
          </>
        ) : (
          <>재직 중인 직원 모두 계정이 준비되어 있습니다.</>
        )}{" "}
        직원은 비밀번호를 스스로 바꿀 수 없습니다. 잊어버렸다는 연락이 오면 여기서 새로 발급해주세요.
      </p>

      <div className="filters">
        <div className="chips">
          <button className={`chip${tab === "전체" ? " on" : ""}`} onClick={() => setTab("전체")}>
            전체<span className="cnt num">{p.items.length}</span>
          </button>
          <button className={`chip${tab === "사용중" ? " on" : ""}`} onClick={() => setTab("사용중")}>
            사용 중<span className="cnt num">{active}</span>
          </button>
          <button className={`chip${tab === "중지" ? " on" : ""}`} onClick={() => setTab("중지")}>
            중지 · 퇴사<span className="cnt num">{off}</span>
          </button>
          {waiting > 0 && (
            <button
              className={`chip warn-chip${tab === "발급대기" ? " on" : ""}`}
              onClick={() => setTab("발급대기")}
            >
              발급 대기<span className="cnt num">{waiting}</span>
            </button>
          )}
        </div>
        <div className="filter-right">
          <input
            className="search"
            placeholder="이름 · 연락처 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <Icon name="badge" size={26} />
          <b>조건에 맞는 직원이 없습니다</b>
          <p>필터를 바꿔보세요.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                {p.can.update && (
                  <th style={{ width: 34 }}>
                    <input type="checkbox" className="pick-box" checked={allOn}
                           onChange={toggleAll} aria-label="보이는 직원 모두 고르기" />
                  </th>
                )}
                <th>이름</th>
                <th>직급</th>
                <th>소속</th>
                <th>담당 지점</th>
                <th>연락처</th>
                <th>상태</th>
                <th>로그인</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} onClick={() => setDetail(s)}
                    className={picked.includes(s.id) ? "is-picked" : ""}>
                  {p.can.update && (
                    // 고르는 칸을 눌렀을 때 상세가 열리면 안 된다
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="pick-box" checked={picked.includes(s.id)}
                             onChange={() => toggleOne(s.id)} aria-label={`${s.name} 고르기`} />
                    </td>
                  )}
                  <td className="strong">
                    {s.name}
                    {s.id === p.me && <span className="auto-tag">본인</span>}
                  </td>
                  <td className="dim">{roleName(s.roleCode)}</td>
                  <td className="dim">{branchName(s.mainBranch)}</td>
                  <td className="dim">
                    {s.branches.length === 0
                      ? "-"
                      : s.branches.length === p.branches.length
                        ? "전 지점"
                        : s.branches.map(branchName).join(" · ")}
                  </td>
                  <td className="num dim">{showPhone(s.phone)}</td>
                  <td>
                    <span className={`pill ${s.status === "재직중" ? "" : "bad"}`}>{s.status}</span>
                  </td>
                  <td>
                    {!s.accountOn ? (
                      <span className="pill bad">계정 꺼짐</span>
                    ) : !s.hasPassword ? (
                      <span className="pill bad">발급 대기</span>
                    ) : (
                      <span className="pill good">사용 중</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {p.can.update && picked.length > 0 && (
        <div className="save-bar">
          <span>
            <b>{picked.length}명</b> 골랐습니다
          </span>
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => setPicked([])}>
            고른 것 지우기
          </button>
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => setBulk(true)}>
            한 번에 바꾸기
          </button>
        </div>
      )}

      {bulk && (
        <BulkForm
          names={picked.map((id) => p.items.find((s) => s.id === id)?.name ?? id)}
          ids={picked}
          branches={p.branches}
          onClose={() => setBulk(false)}
        />
      )}

      {issued && <IssuedBox {...issued} onClose={() => setIssued(null)} />}

      {openNew && (
        <StaffForm
          roles={p.roles}
          branches={p.branches}
          myRole={p.myRole}
          onClose={() => setOpenNew(false)}
        />
      )}

      {detail && (
        <Detail
          item={detail}
          roles={p.roles}
          branches={p.branches}
          me={p.me}
          myRole={p.myRole}
          can={p.can}
          onIssue={() => issue(detail.id)}
          onClose={() => setDetail(null)}
        />
      )}

      {/* 예전에 화면 확인용으로 넣었던 가짜 자료를 지운다.
          한 번 쓰고 말 일이라 눈에 안 띄는 자리에 작게 둔다 */}
      {p.can.update && (
        <div className="stat-note" style={{ marginTop: 22 }}>
          예전에 화면 확인용으로 넣은 가짜 자료(메모에 [샘플] 표시)가 남아 있다면
          <button type="button" className="linkish" disabled={wiping} onClick={wipeSample}>
            {wiping ? "지우는 중…" : "여기서 지웁니다"}
          </button>
          {wipeNote && <span style={{ display: "block", marginTop: 6 }}>{wipeNote}</span>}
        </div>
      )}
    </>
  );
}

/* ── 발급된 비밀번호 보여주기 ───────────────── */
function IssuedBox({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{name}님 비밀번호</h3>
        <p className="modal-lead">
          아래 비밀번호를 본인에게 알려주세요. <b>이 창을 닫으면 다시 볼 수 없습니다.</b>{" "}
          잊어버리셔도 괜찮습니다 — 언제든 새로 발급하시면 됩니다.
        </p>

        <div className="pw-show">
          <span className="pw-val num">{password}</span>
          <button className="btn-ghost" onClick={copy}>{copied ? "복사됨" : "복사"}</button>
        </div>

        <p className="modal-lead" style={{ marginTop: 12 }}>
          이 비밀번호로 바로 로그인됩니다. 직원은 스스로 바꿀 수 없으니,
          바꿔야 할 일이 생기면 이 화면에서 새로 발급해주세요.
          발급하는 순간 이전 비밀번호는 통하지 않습니다.
        </p>

        <div className="modal-actions">
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={onClose}>확인했습니다</button>
        </div>
      </div>
    </div>
  );
}

/* ── 직원 추가 ─────────────────────────────── */
function StaffForm({
  roles, branches, myRole, onClose,
}: {
  roles: Named[];
  branches: Named[];
  myRole: string;
  onClose: () => void;
}) {
  const pickable = roles.filter((r) => r.code !== "R1" || myRole === "R1");
  const [f, setF] = useState<Record<string, string>>({
    직급코드: pickable[pickable.length - 1]?.code ?? "",
    주소속지점: branches[0]?.code ?? "",
  });
  const [picked, setPicked] = useState<string[]>(branches[0] ? [branches[0].code] : []);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  async function save() {
    if (!f["이름"]?.trim()) return setMsg("이름을 입력해주세요.");
    if (!f["휴대폰"]?.trim()) return setMsg("휴대폰 번호를 입력해주세요.");
    setBusy(true);
    const res = await fetch("/api/staff/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, 담당지점: picked }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    location.reload();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>직원 추가</h3>
        <p className="modal-lead">
          먼저 사람만 등록됩니다. 비밀번호는 목록에서 이름을 눌러 따로 발급하시면 됩니다.
        </p>

        <div className="form-grid">
          <L label="이름" req>
            <input className="input" value={f["이름"] ?? ""} onChange={(e) => set("이름", e.target.value)} />
          </L>
          <L label="휴대폰" req>
            <input className="input" inputMode="tel" placeholder="010-0000-0000"
                   value={f["휴대폰"] ?? ""} onChange={(e) => set("휴대폰", e.target.value)} />
          </L>
          <L label="직급">
            <select className="input" value={f["직급코드"] ?? ""} onChange={(e) => set("직급코드", e.target.value)}>
              {pickable.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </L>
          <L label="소속 지점">
            <select className="input" value={f["주소속지점"] ?? ""} onChange={(e) => set("주소속지점", e.target.value)}>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </L>
          <L label="담당 지점" full>
            <BranchPick branches={branches} picked={picked} onChange={setPicked} />
          </L>
        </div>

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

/* ── 상세 · 수정 ───────────────────────────── */
function Detail({
  item, roles, branches, me, myRole, can, onIssue, onClose,
}: {
  item: Staff;
  roles: Named[];
  branches: Named[];
  me: string;
  myRole: string;
  can: { create: boolean; update: boolean; remove: boolean };
  onIssue: () => void;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    이름: item.name,
    휴대폰: item.phone,
    직급코드: item.roleCode,
    주소속지점: item.mainBranch,
    재직상태: item.status,
    계정사용: item.accountOn,
    출근기준시각: item.baseTime,
    퇴근기준시각: item.outTime,
    휴게분: item.restMin,
    휴게변동: item.restVary,
    근무요일: item.workDays,
    트레이너: item.trainer,
    그룹수업시간: item.groupSlots,
  });
  const [picked, setPicked] = useState<string[]>(item.branches);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmPw, setConfirmPw] = useState(false);

  const isSelf = item.id === me;
  const lockedRole = item.roleCode === "R1" && myRole !== "R1";
  const editable = can.update && !lockedRole;
  const pickable = roles.filter((r) => r.code !== "R1" || myRole === "R1");

  async function save() {
    setBusy(true);
    const res = await fetch("/api/staff/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, changes: { ...f, 담당지점: picked } }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    location.reload();
  }

  async function remove() {
    setBusy(true);
    const res = await fetch("/api/staff/delete", {
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
            <h3 style={{ margin: 0 }}>{item.name}</h3>
            <span className="dim num">사번 {item.id}</span>
          </div>
          {item.hasPassword ? (
            <span className="pill good">사용 중</span>
          ) : (
            <span className="pill bad">발급 대기</span>
          )}
        </div>

        {lockedRole && (
          <div className="alert-soft">대표 계정입니다. 대표 본인만 바꿀 수 있습니다.</div>
        )}

        {can.update && !lockedRole && (
          <>
            <h4 className="mini-title">로그인 비밀번호</h4>
            {confirmPw ? (
              <div className="confirm-box">
                <b>{item.name}님의 비밀번호를 새로 발급할까요?</b>
                <p>
                  지금 쓰던 비밀번호는 즉시 통하지 않게 됩니다.
                  새 비밀번호는 발급 직후 한 번만 화면에 나오니, 본인에게 바로 알려주세요.
                </p>
                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button className="btn-ghost" onClick={() => setConfirmPw(false)}>그만두기</button>
                  <button className="btn-primary" style={{ marginTop: 0 }} onClick={onIssue}>발급</button>
                </div>
              </div>
            ) : (
              <div className="inline-form">
                <span className="dim" style={{ fontSize: 12.5, flex: 1 }}>
                  {item.hasPassword
                    ? "비밀번호는 암호로 저장되어 있어 대표님도 볼 수 없습니다. 직원이 잊어버렸다면 새로 발급해주세요."
                    : "아직 비밀번호가 없어 이 직원은 로그인할 수 없습니다."}
                </span>
                <button className="btn-dark" onClick={() => setConfirmPw(true)}>
                  {item.hasPassword ? "새로 발급" : "비밀번호 발급"}
                </button>
              </div>
            )}
          </>
        )}

        <h4 className="mini-title">직원 정보</h4>
        <div className="form-grid">
          <L label="이름">
            <input className="input" value={f.이름} disabled={!editable}
                   onChange={(e) => setF({ ...f, 이름: e.target.value })} />
          </L>
          <L label="휴대폰">
            <input className="input" inputMode="tel" value={f.휴대폰} disabled={!editable}
                   onChange={(e) => setF({ ...f, 휴대폰: e.target.value })} />
          </L>
          <L label="직급">
            <select className="input" value={f.직급코드} disabled={!editable || isSelf}
                    onChange={(e) => setF({ ...f, 직급코드: e.target.value })}>
              {pickable.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </L>
          <L label="소속 지점">
            <select className="input" value={f.주소속지점} disabled={!editable}
                    onChange={(e) => setF({ ...f, 주소속지점: e.target.value })}>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </L>
          <L label="재직 상태">
            <select className="input" value={f.재직상태} disabled={!editable || isSelf}
                    onChange={(e) => setF({ ...f, 재직상태: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </L>
          <L label="계정 사용">
            <select className="input" value={f.계정사용 ? "Y" : "N"} disabled={!editable || isSelf}
                    onChange={(e) => setF({ ...f, 계정사용: e.target.value === "Y" })}>
              <option value="Y">사용 (로그인 가능)</option>
              <option value="N">중지 (로그인 막음)</option>
            </select>
          </L>
          <L label="담당 지점" full>
            <BranchPick branches={branches} picked={picked} onChange={setPicked} disabled={!editable} />
          </L>
        </div>

        <h4 className="mini-title" style={{ marginTop: 20 }}>맡은 일</h4>
        <div className="form-grid">
          <L label="수업" full>
            <label className="chk">
              <input type="checkbox" checked={f.트레이너} disabled={!editable}
                     onChange={(e) => setF({ ...f, 트레이너: e.target.checked })} />
              <span>
                <b>이 직원은 수업을 맡습니다 (트레이너)</b>
                <em>
                  체크하면 <b>PT · 수업</b> 메뉴를 쓸 수 있고, 시간표에 이 사람 줄이 생깁니다.
                  직급과 상관없이 사람마다 정합니다. 남의 수업까지 고치는 것은 여전히
                  점장 · 대표만 됩니다.
                </em>
              </span>
            </label>
          </L>
          {f.트레이너 && (
            <L label="그룹수업 시간" full>
              <input className="input" value={f.그룹수업시간} disabled={!editable}
                     placeholder="06:00, 10:00, 19:00"
                     onChange={(e) => setF({ ...f, 그룹수업시간: e.target.value })} />
              <p className="stat-note" style={{ marginTop: 6 }}>
                이 사람이 <b>맡은 타임</b>을 쉼표로 나눠 적습니다. 그러면 그룹수업 보고 화면에서
                시각을 입력하지 않고 <b>단추로 고르게</b> 됩니다. 1:1 PT만 하는 분은 비워두세요.
              </p>
            </L>
          )}
        </div>

        <h4 className="mini-title" style={{ marginTop: 20 }}>근무 시각</h4>
        <div className="form-grid">
          <L label="출근">
            <input className="input" type="time" value={f.출근기준시각} disabled={!editable}
                   onChange={(e) => setF({ ...f, 출근기준시각: e.target.value })} />
          </L>
          <L label="퇴근">
            <input className="input" type="time" value={f.퇴근기준시각} disabled={!editable}
                   onChange={(e) => setF({ ...f, 퇴근기준시각: e.target.value })} />
          </L>
          {!f.휴게변동 && (
            <L label="휴게 (분)">
              <input className="input" inputMode="numeric" placeholder="0" value={f.휴게분}
                     disabled={!editable}
                     onChange={(e) => setF({ ...f, 휴게분: e.target.value.replace(/[^0-9]/g, "") })} />
            </L>
          )}
          <L label="근무 요일" full>
            <DayPick value={f.근무요일} disabled={!editable}
                     onChange={(v) => setF({ ...f, 근무요일: v })} />
          </L>
          <L label="휴게 방식" full>
            <label className="chk">
              <input type="checkbox" checked={f.휴게변동} disabled={!editable}
                     onChange={(e) =>
                       setF({ ...f, 휴게변동: e.target.checked, 휴게분: e.target.checked ? "" : f.휴게분 })
                     } />
              <span>
                <b>휴게 시간이 날마다 다릅니다</b>
                <em>
                  근태 화면에 「휴게 시작 · 끝」 버튼이 나오고, 찍은 만큼만 빠집니다.
                  체크를 풀면 위에 적은 분이 매일 자동으로 빠집니다.
                </em>
              </span>
            </label>
          </L>
        </div>
        <p className="stat-note">
          출근·퇴근 시각을 넘겨 찍으면 <b>지각</b>, 이르게 퇴근하면 <b>조퇴</b>로 표시됩니다.
          비워두면 시각만 기록하고 아무 판정도 하지 않습니다.
          <br />
          근무 요일을 정하면 근태표에서 <b>원래 안 나오는 날</b>과
          <b> 나와야 하는데 안 찍은 날</b>이 구분됩니다. 안 정하면 매일 나오는 것으로 봅니다.
        </p>

        {isSelf && (
          <p className="stat-note">
            본인 계정입니다. 스스로 갇히는 일이 없도록 직급 · 재직 상태 · 계정 사용은 바꿀 수 없습니다.
          </p>
        )}

        {msg && <div className="alert-bad">{msg}</div>}

        {confirmDel ? (
          <div className="confirm-box">
            <b>{item.name}님을 목록에서 지울까요?</b>
            <p>
              지난 상담 · 매출 기록은 그대로 남습니다. 시트에서도 줄을 지우지 않고
              삭제 표시만 하므로 되살릴 수 있습니다.
              <br />
              잠깐 쉬는 경우라면 지우지 말고 <b>재직 상태를 휴직</b>으로 바꾸는 편이 낫습니다.
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
            {can.remove && !isSelf && !lockedRole && (
              <button className="btn-ghost danger" onClick={() => setConfirmDel(true)}>지우기</button>
            )}
            <button className="btn-ghost" onClick={onClose}>닫기</button>
            {editable && (
              <button className="btn-primary" style={{ marginTop: 0 }} onClick={save} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 담당 지점 고르기 ──────────────────────── */
/**
 * 여러 명을 한 번에 바꾸기
 *
 * 항목마다 「이 항목 바꾸기」를 켠 것만 보낸다.
 * 화면에 보이는 값을 전부 보내면, 손대지 않은 칸이 빈 값으로 덮어써진다.
 * 여러 명을 한꺼번에 다루는 자리라 그 사고가 여러 명분으로 커진다.
 *
 * 직급은 여기 없다. 여러 명의 권한이 한 번에 바뀌는 것은 되돌리기 어려워서,
 * 직급은 한 명씩 열어 바꾸게 두었다.
 */
function BulkForm({ names, ids, branches, onClose }: {
  names: string[];
  ids: string[];
  branches: Named[];
  onClose: () => void;
}) {
  const [on, setOn] = useState({ 트레이너: false, 근무: false, 지점: false, 상태: false });
  const [f, setF] = useState({
    트레이너: true,
    출근기준시각: "",
    퇴근기준시각: "",
    휴게분: "",
    휴게변동: false,
    근무요일: "",
    주소속지점: "",
    담당지점: [] as string[],
    재직상태: "재직중",
    계정사용: true,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<{ done: string[]; failed: { name: string; why: string }[] } | null>(null);

  const nothing = !on.트레이너 && !on.근무 && !on.지점 && !on.상태;

  async function save() {
    if (nothing) return setMsg("바꿀 항목을 하나 이상 켜주세요.");
    setBusy(true);
    setMsg("");

    const changes: Record<string, any> = {};
    if (on.트레이너) changes.트레이너 = f.트레이너;
    if (on.근무) {
      changes.출근기준시각 = f.출근기준시각;
      changes.퇴근기준시각 = f.퇴근기준시각;
      changes.휴게변동 = f.휴게변동;
      changes.휴게분 = f.휴게변동 ? "" : f.휴게분;
      changes.근무요일 = f.근무요일;
    }
    if (on.지점) {
      if (f.주소속지점) changes.주소속지점 = f.주소속지점;
      changes.담당지점 = f.담당지점;
    }
    if (on.상태) {
      changes.재직상태 = f.재직상태;
      changes.계정사용 = f.계정사용;
    }

    try {
      const res = await fetch("/api/staff/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      setResult({ done: data.done ?? [], failed: data.failed ?? [] });
      if ((data.failed ?? []).length === 0) setTimeout(() => location.reload(), 900);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="modal-back" onClick={() => location.reload()}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>{result.done.length}명을 바꿨습니다</h3>
          {result.done.length > 0 && (
            <p className="page-sub" style={{ margin: "0 0 12px" }}>{result.done.join(" · ")}</p>
          )}
          {result.failed.length > 0 && (
            <>
              <div className="alert-bad" style={{ lineHeight: 1.7 }}>
                <b>{result.failed.length}명은 바뀌지 않았습니다</b>
              </div>
              <div className="lwrap" style={{ marginTop: 10 }}>
                {result.failed.map((x) => (
                  <div className="jrow" key={x.name}>
                    <div className="jtop"><b>{x.name}</b><span>{x.why}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="modal-actions">
            <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => location.reload()}>
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{ids.length}명 한 번에 바꾸기</h3>
        <p className="page-sub" style={{ margin: "0 0 4px" }}>{names.join(" · ")}</p>
        <p className="stat-note" style={{ marginTop: 8 }}>
          <b>켠 항목만</b> 바뀝니다. 끈 항목은 사람마다 지금 값 그대로 둡니다.
          직급은 여기서 못 바꿉니다 — 여러 명의 권한이 한 번에 바뀌면 되돌리기 어렵습니다.
        </p>

        <BulkSection label="수업 (트레이너)" on={on.트레이너}
                     onToggle={(v) => setOn({ ...on, 트레이너: v })}>
          <div className="pick-row">
            <button className={`mini-tab${f.트레이너 ? " on" : ""}`}
                    onClick={() => setF({ ...f, 트레이너: true })}>트레이너로 켜기</button>
            <button className={`mini-tab${f.트레이너 ? "" : " on"}`}
                    onClick={() => setF({ ...f, 트레이너: false })}>끄기</button>
          </div>
        </BulkSection>

        <BulkSection label="근무 시각 · 휴게 · 요일" on={on.근무}
                     onToggle={(v) => setOn({ ...on, 근무: v })}>
          <div className="form-grid">
            <L label="출근">
              <input className="input" type="time" value={f.출근기준시각}
                     onChange={(e) => setF({ ...f, 출근기준시각: e.target.value })} />
            </L>
            <L label="퇴근">
              <input className="input" type="time" value={f.퇴근기준시각}
                     onChange={(e) => setF({ ...f, 퇴근기준시각: e.target.value })} />
            </L>
            {!f.휴게변동 && (
              <L label="휴게 (분)">
                <input className="input" inputMode="numeric" placeholder="0" value={f.휴게분}
                       onChange={(e) => setF({ ...f, 휴게분: e.target.value.replace(/[^0-9]/g, "") })} />
              </L>
            )}
            <L label="근무 요일" full>
              <DayPick value={f.근무요일} onChange={(v) => setF({ ...f, 근무요일: v })} />
            </L>
            <L label="휴게 방식" full>
              <label className="chk">
                <input type="checkbox" checked={f.휴게변동}
                       onChange={(e) => setF({ ...f, 휴게변동: e.target.checked })} />
                <span><b>휴게 시간이 날마다 다릅니다</b></span>
              </label>
            </L>
          </div>
        </BulkSection>

        <BulkSection label="지점" on={on.지점} onToggle={(v) => setOn({ ...on, 지점: v })}>
          <div className="form-grid">
            <L label="주 소속" full>
              <select className="select" value={f.주소속지점}
                      onChange={(e) => setF({ ...f, 주소속지점: e.target.value })}>
                <option value="">바꾸지 않음</option>
                {branches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </L>
            <L label="담당 지점" full>
              <BranchPick branches={branches} picked={f.담당지점}
                          onChange={(v) => setF({ ...f, 담당지점: v })} />
            </L>
          </div>
          <p className="stat-note">담당 지점은 <b>고른 것으로 덮어씁니다.</b> 지금 담당하던 지점은 사라집니다.</p>
        </BulkSection>

        <BulkSection label="재직 상태 · 계정" on={on.상태} onToggle={(v) => setOn({ ...on, 상태: v })}>
          <div className="form-grid">
            <L label="재직 상태">
              <select className="select" value={f.재직상태}
                      onChange={(e) => setF({ ...f, 재직상태: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </L>
            <L label="계정 사용">
              <select className="select" value={f.계정사용 ? "Y" : "N"}
                      onChange={(e) => setF({ ...f, 계정사용: e.target.value === "Y" })}>
                <option value="Y">사용</option>
                <option value="N">중지</option>
              </select>
            </L>
          </div>
          <p className="stat-note">본인 계정과 마지막 대표 계정은 서버에서 막습니다.</p>
        </BulkSection>

        {msg && <div className="alert-bad" style={{ marginTop: 12 }}>{msg}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" style={{ marginTop: 0 }} onClick={onClose}>취소</button>
          <button className="btn-primary" style={{ marginTop: 0 }} disabled={busy || nothing}
                  onClick={save}>
            {busy ? "저장 중…" : `${ids.length}명 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 켜야 열리는 묶음 — 끄면 그 항목은 아예 보내지 않는다 */
function BulkSection({ label, on, onToggle, children }: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`bulk-sec${on ? " on" : ""}`}>
      <label className="chk">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        <span><b>{label}</b></span>
      </label>
      {on && <div className="bulk-body">{children}</div>}
    </div>
  );
}

function BranchPick({
  branches, picked, onChange, disabled,
}: {
  branches: Named[];
  picked: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (code: string) => {
    if (disabled) return;
    onChange(picked.includes(code) ? picked.filter((c) => c !== code) : [...picked, code]);
  };

  return (
    <div className="pick-row">
      {branches.map((b) => (
        <button
          key={b.code}
          type="button"
          disabled={disabled}
          className={`mini-tab${picked.includes(b.code) ? " on" : ""}`}
          onClick={() => toggle(b.code)}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}

/**
 * 근무 요일 고르기
 *
 * 주중·주말이 제일 흔해서 단축 버튼을 먼저 놓는다.
 * 그래도 화·목·토만 나오는 사람이 있어서 요일도 하나씩 누를 수 있게 둔다.
 */
function DayPick({ value, disabled, onChange }: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  /** 시트에 적히는 차례를 월요일부터로 맞춘다 — 사람이 읽는 차례다 */
  const ORDER = ["월", "화", "수", "목", "금", "토", "일"];
  const has = (d: string) => value.includes(d);
  const toggle = (d: string) =>
    onChange(ORDER.filter((x) => (x === d ? !has(x) : has(x))).join(""));

  return (
    <>
      <div className="pick-row" style={{ marginBottom: 6 }}>
        {ORDER.map((d) => (
          <button key={d} type="button" disabled={disabled}
                  className={`mini-tab day${has(d) ? " on" : ""}`}
                  onClick={() => toggle(d)}>
            {d}
          </button>
        ))}
      </div>
      <div className="pick-row">
        <button type="button" className="mini-tab" disabled={disabled}
                onClick={() => onChange(WEEKDAYS)}>주중만</button>
        <button type="button" className="mini-tab" disabled={disabled}
                onClick={() => onChange(WEEKEND)}>주말만</button>
        <button type="button" className="mini-tab" disabled={disabled}
                onClick={() => onChange(ORDER.join(""))}>매일</button>
        <button type="button" className="mini-tab" disabled={disabled}
                onClick={() => onChange("")}>안 정함</button>
        <span className="dim" style={{ marginLeft: "auto", fontSize: 11.5, alignSelf: "center" }}>
          {daysText(value)}
        </span>
      </div>
    </>
  );
}

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
