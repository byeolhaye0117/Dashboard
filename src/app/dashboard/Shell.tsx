"use client";

/**
 * 공통 뼈대 — 떠 있는 사이드바 + 상단 바 + 본문
 *
 * PC     (1024px~)    사이드바 펼침 (계정 카드 + 그룹별 메뉴)
 * 태블릿 (768~1023)   사이드바가 아이콘만 남음
 * 휴대폰 (~767)       사이드바 숨김, 아래 떠 있는 탭
 *
 * 배치는 globals.css 의 화면 크기 규칙이 담당한다.
 */
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { GROUP_ORDER, type MenuItem } from "@/lib/menuItems";
import type { Session } from "@/lib/session";

type Props = {
  session: Session;
  menus: MenuItem[];
  branches: { code: string; name: string }[];
  active: string;
  crumb?: string;
  /**
   * 본인 비밀번호를 스스로 바꿀 수 있는가
   *
   * 비밀번호는 대표님이 직원 관리 화면에서 발급하는 방식이라, 직원은 스스로 못 바꾼다.
   * 넘겨주지 않으면 안 되는 쪽이 기본이다 — 새 화면을 만들다 깜빡해도 안전한 쪽으로 틀리게.
   */
  canChangePassword?: boolean;
  children: React.ReactNode;
};

export default function Shell({
  session, menus, branches, active, crumb, canChangePassword, children,
}: Props) {
  const [userOpen, setUserOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = (localStorage.getItem("gym_theme") as "light" | "dark") || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);

    // 접힘 상태: 저장된 값이 있으면 그대로, 없으면 태블릿에서만 접어둔다
    const savedFold = localStorage.getItem("gym_rail");
    if (savedFold === "fold" || savedFold === "open") {
      setCollapsed(savedFold === "fold");
    } else {
      setCollapsed(window.matchMedia("(max-width: 1023px)").matches);
    }
  }, []);

  function toggleRail() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("gym_rail", next ? "fold" : "open");
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("gym_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  async function switchBranch(code: string) {
    await fetch("/api/switch-branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch: code }),
    });
    location.reload();
  }

  const current = branches.find((b) => b.code === session.currentBranch);

  // 지금 화면이 어느 배포인지 — 옛 화면을 보고 있는지 구분하려고 표시한다
  const build = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "로컬";

  return (
    <div className="app">
      <aside className={`rail${collapsed ? " is-collapsed" : ""}`}>
        <div className="acct">
          <span className="avatar">{session.name.slice(0, 1)}</span>
          <span className="who">
            <b>{session.name}</b>
            <span>{session.roleName} · {current?.name ?? ""}</span>
          </span>
          <button className="fold" onClick={toggleRail} aria-label="메뉴 접기">
            <Icon name="fold" size={15} strokeWidth={1.8} />
          </button>
        </div>

        <div className="rail-scroll">
          {GROUP_ORDER.map((g) => {
            const items = menus.filter((m) => m.group === g);
            if (items.length === 0) return null;
            return (
              <div className="rail-group" key={g}>
                <h4>{g}</h4>
                {items.map((m) => (
                  <a key={m.key} href={m.href} className={active === m.key ? "on" : ""} title={m.label}>
                    <Icon name={m.icon} size={18} />
                    <span className="label">{m.label}</span>
                  </a>
                ))}
              </div>
            );
          })}
        </div>

        <div className="rail-foot">
          {collapsed && (
            <button className="icon-btn wide" onClick={toggleRail} title="메뉴 펼치기">
              <Icon name="unfold" size={16} />
              <span>펼치기</span>
            </button>
          )}
          <button className="icon-btn wide" onClick={toggleTheme}
                  title={theme === "dark" ? "밝은 화면으로" : "어두운 화면으로"}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
            <span>{theme === "dark" ? "밝게" : "어둡게"}</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setAllOpen(true)} aria-label="메뉴 열기">
            <Icon name="menu" size={16} strokeWidth={2} />
            메뉴
          </button>

          <span className="crumb">{crumb ?? "홈"}</span>

          {branches.length > 1 && (
            <select className="select" value={session.currentBranch}
                    onChange={(e) => switchBranch(e.target.value)} aria-label="지점 선택">
              {branches.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          )}

          <span className="spacer" />

          <button className="icon-btn" onClick={toggleTheme}
                  aria-label={theme === "dark" ? "밝은 화면으로" : "어두운 화면으로"}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
          </button>

          <div style={{ position: "relative" }}>
            <button className="user-btn" onClick={() => setUserOpen((v) => !v)}>
              {session.name}
              <Icon name="chevron" size={13} strokeWidth={2} />
            </button>
            {userOpen && (
              <div className="menu-pop">
                <div className="head">
                  <b>{session.name}</b>
                  <span>{session.roleName} · {session.staffId}</span>
                </div>
                {canChangePassword && (
                  <button onClick={() => { setPwOpen(true); setUserOpen(false); }}>비밀번호 변경</button>
                )}
                <button className="danger" onClick={async () => {
                  await fetch("/api/logout", { method: "POST" });
                  location.href = "/";
                }}>로그아웃</button>
                <div className="build">화면 버전 {build}</div>
              </div>
            )}
          </div>
        </header>

        <main className="sheet">{children}</main>
      </div>

      <nav className="tabbar" aria-label="주 메뉴">
        {menus.slice(0, 4).map((m) => (
          <a key={m.key} href={m.href} className={active === m.key ? "on" : ""}>
            <Icon name={m.icon} size={19} />
            {m.short}
          </a>
        ))}
        <button className="tab-more" onClick={() => setAllOpen(true)}>
          <Icon name="grid" size={19} />
          전체
        </button>
      </nav>

      {allOpen && (
        <div className="sheet-back" onClick={() => setAllOpen(false)}>
          <div className="menu-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grip" />
            {GROUP_ORDER.map((g) => {
              const items = menus.filter((m) => m.group === g);
              if (items.length === 0) return null;
              return (
                <div className="rail-group" key={g}>
                  <h4>{g}</h4>
                  <div className="m-grid">
                    {items.map((m) => (
                      <a key={m.key} href={m.href} className={active === m.key ? "on" : ""}>
                        <Icon name={m.icon} size={20} />
                        {m.label}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pwOpen && <PasswordDialog onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (pw.length < 4) return setMsg("비밀번호는 4자 이상으로 정해주세요.");
    if (pw !== pw2) return setMsg("두 번 입력한 비밀번호가 서로 다릅니다.");
    setBusy(true);
    const res = await fetch("/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: pw }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "비밀번호를 바꾸지 못했습니다.");
    location.reload();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>비밀번호 변경</h3>
        <div className="field">
          <label htmlFor="pw1">새 비밀번호</label>
          <input id="pw1" className="input" type="password" value={pw}
                 onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="pw2">한 번 더 입력</label>
          <input id="pw2" className="input" type="password" value={pw2}
                 onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
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
