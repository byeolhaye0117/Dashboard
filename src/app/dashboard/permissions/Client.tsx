"use client";

/**
 * 권한 설정
 *
 * 왼쪽에서 직급을 고르고 오른쪽에서 체크한다.
 * 한 번에 한 직급만 다룬다 — 7직급 × 10메뉴 × 4권한을 한 화면에 펼치면 280칸이라,
 * 어디를 바꿨는지 본인도 모르게 된다.
 *
 * 보기를 끄면 그 메뉴는 메뉴판에서 사라진다. 그래서 보기를 끄면 나머지도 같이 꺼진다.
 * 볼 수 없는 것을 고칠 수는 없기 때문이다.
 */
import { Fragment, useMemo, useState } from "react";
import { ACTION_HINTS, VIEW_MEANS } from "@/lib/menuItems";

/** 이 메뉴에서 등록·수정·삭제가 각각 무엇을 여는지 */
function hint(key: string): string[] {
  const h = ACTION_HINTS[key];
  if (!h) return [];
  if (h.note) return [h.note];
  const out: string[] = [];
  if (h.create) out.push(`등록 = ${h.create}`);
  if (h.update) out.push(`수정 = ${h.update}`);
  if (h.remove) out.push(`삭제 = ${h.remove}`);
  return out;
}

type Role = { code: string; name: string; scope: string };
type Menu = { key: string; label: string; group: string };
type Perm = {
  roleCode: string; menu: string;
  view: boolean; create: boolean; update: boolean; remove: boolean;
};

type Props = {
  myRole: string;
  roles: Role[];
  menus: Menu[];
  perms: Perm[];
  headcount: Record<string, number>;
  canEdit: boolean;
};

type Cell = { view: boolean; create: boolean; update: boolean; remove: boolean };
const NONE: Cell = { view: false, create: false, update: false, remove: false };
const ALL: Cell = { view: true, create: true, update: true, remove: true };

const ACTIONS: { key: keyof Cell; label: string }[] = [
  { key: "view", label: "보기" },
  { key: "create", label: "등록" },
  { key: "update", label: "수정" },
  { key: "remove", label: "삭제" },
];

export default function Client(p: Props) {
  const first = p.roles.find((r) => r.code !== p.myRole) ?? p.roles[0];
  const [role, setRole] = useState(first?.code ?? "");
  const [draft, setDraft] = useState<Record<string, Cell>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  /** 시트에 적힌 값 — 줄이 없으면 아무것도 못 한다는 뜻 */
  const saved = useMemo(() => {
    const m: Record<string, Cell> = {};
    p.perms
      .filter((x) => x.roleCode === role)
      .forEach((x) => {
        m[x.menu] = { view: x.view, create: x.create, update: x.update, remove: x.remove };
      });
    return m;
  }, [p.perms, role]);

  const cellOf = (menu: string): Cell => draft[menu] ?? saved[menu] ?? NONE;
  const isSelf = role === p.myRole;
  const editable = p.canEdit && !isSelf;

  const changed = Object.keys(draft).some((k) => {
    const a = draft[k];
    const b = saved[k] ?? NONE;
    return ACTIONS.some((x) => a[x.key] !== b[x.key]);
  });

  function set(menu: string, key: keyof Cell, on: boolean) {
    const cur = cellOf(menu);
    const next: Cell = { ...cur, [key]: on };
    // 볼 수 없는 것을 고칠 수는 없다
    if (key === "view" && !on) {
      next.create = false;
      next.update = false;
      next.remove = false;
    }
    // 무언가를 할 수 있으면 볼 수는 있어야 한다
    if (key !== "view" && on) next.view = true;
    setDraft((d) => ({ ...d, [menu]: next }));
    setDone(false);
  }

  function preset(kind: "all" | "read" | "none") {
    const next: Record<string, Cell> = {};
    p.menus.forEach((m) => {
      next[m.key] =
        kind === "all" ? { ...ALL } : kind === "read" ? { ...NONE, view: true } : { ...NONE };
    });
    setDraft(next);
    setDone(false);
  }

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const rows = p.menus.map((m) => ({ menu: m.key, ...cellOf(m.key) }));
      const res = await fetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleCode: role, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      setDone(true);
      setTimeout(() => location.reload(), 700);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const groups = ["기본", "운영", "관리"].filter((g) => p.menus.some((m) => m.group === g));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">권한 설정</h1>
          <p className="page-sub">직급마다 어떤 메뉴를 쓸 수 있는지 정합니다</p>
        </div>
      </div>

      {/* 직급 고르기 */}
      <div className="bchips">
        {p.roles.map((r) => (
          <button key={r.code} className={`bchip${role === r.code ? " on" : ""}`}
                  onClick={() => { setRole(r.code); setDraft({}); setMsg(""); setDone(false); }}>
            <span className="nm">{r.name}</span>
            <span className="am num">{p.headcount[r.code] ?? 0}명</span>
          </button>
        ))}
      </div>

      {isSelf && (
        <div className="setup" style={{ marginTop: 12 }}>
          <div>
            <b>본인 직급입니다</b>
            <p>
              스스로 권한을 낮추면 이 화면에 다시 들어올 수 없습니다.
              본인 직급은 다른 관리자만 바꿀 수 있습니다.
            </p>
          </div>
        </div>
      )}

      <div className="perm-head">
        <span className="who">
          <b>{p.roles.find((r) => r.code === role)?.name}</b>
          <em>{p.headcount[role] ?? 0}명이 쓰고 있습니다</em>
        </span>
        {editable && (
          <span className="presets">
            <button className="mini-tab" onClick={() => preset("all")}>모두 켜기</button>
            <button className="mini-tab" onClick={() => preset("read")}>보기만</button>
            <button className="mini-tab" onClick={() => preset("none")}>모두 끄기</button>
          </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="grid perm-table" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th>메뉴</th>
              {ACTIONS.map((a) => (
                <th key={a.key} className="r" style={{ width: 66 }}>{a.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="sum-row">
                  <td colSpan={5}><span className="nm">{g}</span></td>
                </tr>
                {p.menus.filter((m) => m.group === g).map((m) => {
                  const c = cellOf(m.key);
                  return (
                    <tr key={m.key} className={c.view ? "" : "off"}>
                      <td>
                        <span className="nm">{m.label}</span>
                        {/* 같은 「수정」이라도 화면마다 뜻이 다르다. 적어두지 않으면
                            정하는 사람이 무엇을 여는지 모르고 체크하게 된다 */}
                        <span className="what">
                          {hint(m.key).map((x) => (
                            <i key={x}>{x}</i>
                          ))}
                        </span>
                      </td>
                      {ACTIONS.map((a) => (
                        <td key={a.key} className="r">
                          <label className="sw-box">
                            <input type="checkbox" checked={c[a.key]} disabled={!editable}
                                   onChange={(e) => set(m.key, a.key, e.target.checked)} />
                          </label>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="sec-sub" style={{ marginTop: 10 }}>
        보기를 끄면 그 메뉴가 메뉴판에서 사라지고 나머지도 같이 꺼집니다.
        볼 수 없는 것을 고칠 수는 없기 때문입니다.
        <br />
        홈은 누구나 볼 수 있고, 대표에게서 <b>직원 관리 · 권한 설정</b>은 뺄 수 없습니다.
      </p>

      {msg && <div className="alert-bad">{msg}</div>}
      {done && <div className="setup done"><div>저장했습니다. 화면을 새로 불러옵니다.</div></div>}

      {editable && (
        <div className="save-bar">
          <span className="dim">
            {changed ? "바뀐 내용이 있습니다" : "바뀐 내용이 없습니다"}
          </span>
          <button className="btn-dark" onClick={save} disabled={busy || !changed}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      )}
    </>
  );
}
