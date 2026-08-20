"use client";

/**
 * 직급 만들기 · 고치기
 *
 * 직급은 지금까지 구글 시트의 「직급」 탭을 직접 열어야 만들 수 있었다.
 * 화면에서는 고를 수만 있어서, 「팀장」 한 자리를 새로 두는 데도 시트를 열
 * 줄 아는 사람을 기다려야 했다.
 *
 * ── 왜 한 덩어리로 뺐나 ─────────────────────────────────────
 * 직급을 고치고 싶어지는 자리는 두 군데다. 권한을 정하다가 「직급을 하나 더
 * 둬야겠다」 할 때와, 직원의 직급을 고르다가 「이 목록에 없네」 할 때다.
 * 처음에는 직원 관리에서 권한 설정으로 보내는 길만 놓았는데, 직원을 고쳐
 * 놓은 채로 화면을 옮기게 되는 것이라 그 자리에서 되게 바꿨다.
 *
 * 줄은 지우지 않는다. 지난 기록이 직급코드를 가리키고 있어서, 지우면 옛
 * 명단의 직급이 빈칸이 된다. 그래서 「감추기」는 사용여부를 N 으로 내린다.
 */
import { useState } from "react";

export type EditableRole = { code: string; name: string; use: boolean };

export default function RoleEdit({ roles, headcount, myRole, onDone }: {
  /** 감춰 둔 것까지 전부 — 다시 꺼내려면 목록에 보여야 한다 */
  roles: EditableRole[];
  /** 직급코드 → 그 직급인 재직자 수. 없으면 사람 수를 안 적는다 */
  headcount?: Record<string, number>;
  myRole: string;
  /** 무언가 바뀐 뒤에 할 일 — 안 주면 화면을 새로 읽는다 */
  onDone?: () => void;
}) {
  /** 지금 이름을 고치고 있는 직급코드 */
  const [ren, setRen] = useState("");
  const [renName, setRenName] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "저장하지 못했습니다.");
      if (onDone) onDone();
      else location.reload();
    } catch (e: any) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="rolebox-b">
      <ul className="rolelist">
        {roles.map((r, i) => (
          <li key={r.code} className={r.use ? "" : "off"}>
            {ren === r.code ? (
              <input className="input" value={renName} autoFocus
                     onChange={(e) => setRenName(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === "Enter" && renName.trim()) {
                         act({ action: "rename", code: r.code, name: renName });
                       }
                       if (e.key === "Escape") setRen("");
                     }} />
            ) : (
              <>
                <span className="nm">{r.name}</span>
                {headcount && <span className="am num">{headcount[r.code] ?? 0}명</span>}
                {!r.use && <span className="tag">감춤</span>}
              </>
            )}

            <span className="ops">
              {ren === r.code ? (
                <>
                  <button className="mini-tab" disabled={busy || !renName.trim()}
                          onClick={() => act({ action: "rename", code: r.code, name: renName })}>
                    저장
                  </button>
                  <button className="mini-tab" onClick={() => setRen("")}>그만</button>
                </>
              ) : (
                <>
                  <button className="mini-tab" aria-label="위로" disabled={busy || i === 0}
                          onClick={() => act({ action: "move", code: r.code, dir: "up" })}>↑</button>
                  <button className="mini-tab" aria-label="아래로"
                          disabled={busy || i === roles.length - 1}
                          onClick={() => act({ action: "move", code: r.code, dir: "down" })}>↓</button>
                  <button className="mini-tab" disabled={busy}
                          onClick={() => { setRen(r.code); setRenName(r.name); setMsg(""); }}>
                    이름
                  </button>
                  <button className="mini-tab" disabled={busy || r.code === "R1" || r.code === myRole}
                          onClick={() => act({ action: "use", code: r.code, on: !r.use })}>
                    {r.use ? "감추기" : "다시 쓰기"}
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="roleadd">
        <input className="input" placeholder="새 직급 이름 (예: 팀장)" value={newName}
               onChange={(e) => setNewName(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === "Enter" && newName.trim()) act({ action: "create", name: newName });
               }} />
        <button className="btn-primary" style={{ marginTop: 0 }}
                disabled={busy || !newName.trim()}
                onClick={() => act({ action: "create", name: newName })}>
          더하기
        </button>
      </div>

      <p className="stat-note">
        새로 만든 직급은 <b>아무 권한도 없습니다.</b> 만든 뒤 <b>권한 설정</b>에서 그 직급을 골라
        무엇을 볼지 체크하고 저장해 주세요. 이름을 바꿔도 그 직급을 쓰는 직원은 그대로 따라옵니다.
      </p>

      {msg && <div className="alert-bad">{msg}</div>}
    </div>
  );
}
