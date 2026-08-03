"use client";

/**
 * 직원 목록 · 계정 발급 · 담당 지점 배정
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { showPhone } from "@/lib/phone";

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">직원 관리</h1>
          <p className="page-sub">계정을 발급하고 담당 지점을 정합니다</p>
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
                <tr key={s.id} onClick={() => setDetail(s)}>
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
