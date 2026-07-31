"use client";

/**
 * 공통 뼈대 — 상단 바 + 메뉴
 *
 * PC        : 왼쪽 세로 메뉴
 * 태블릿·폰 : 아래쪽 가로 탭
 */
import { useState } from "react";
import type { MenuItem } from "@/lib/menu";
import type { Session } from "@/lib/session";

type Props = {
  session: Session;
  menus: MenuItem[];
  branches: { code: string; name: string }[];
  active: string;
  children: React.ReactNode;
};

export default function Shell({ session, menus, branches, active, children }: Props) {
  const [openMenu, setOpenMenu] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <div style={{ minHeight: "100dvh" }}>
      <header style={S.header}>
        <div style={S.brand}>헬스장 대시보드</div>

        {branches.length > 1 && (
          <select style={S.branchSelect} defaultValue={session.currentBranch}>
            {branches.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
        )}

        <div style={{ position: "relative", marginLeft: "auto" }}>
          <button style={S.userBtn} onClick={() => setOpenMenu((v) => !v)}>
            {session.name} <span style={{ color: "#9ca3af", fontSize: 12 }}>▾</span>
          </button>
          {openMenu && (
            <div style={S.dropdown}>
              <div style={S.dropInfo}>
                {session.roleName}
                <br />
                <span style={{ color: "#9ca3af", fontSize: 11 }}>{session.staffId}</span>
              </div>
              <button style={S.dropItem} onClick={() => { setPwOpen(true); setOpenMenu(false); }}>
                비밀번호 변경
              </button>
              <button
                style={{ ...S.dropItem, color: "#dc2626" }}
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST" });
                  location.href = "/";
                }}
              >
                로그아웃
              </button>
            </div>
          )}
        </div>
      </header>

      <div style={S.body}>
        <nav className="gym-side" style={S.side}>
          {menus.map((m) => (
            <a
              key={m.key}
              href={m.href}
              style={{
                ...S.sideItem,
                background: active === m.key ? "#eef2ff" : "transparent",
                color: active === m.key ? "#4f46e5" : "#374151",
                fontWeight: active === m.key ? 700 : 500,
              }}
            >
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span>{m.label}</span>
            </a>
          ))}
        </nav>

        <main className="gym-content" style={S.content}>{children}</main>
      </div>

      <nav className="gym-bottom" style={S.bottom}>
        {menus.slice(0, 5).map((m) => (
          <a
            key={m.key}
            href={m.href}
            style={{ ...S.bottomItem, color: active === m.key ? "#4f46e5" : "#6b7280" }}
          >
            <div style={{ fontSize: 18 }}>{m.icon}</div>
            <div style={{ fontSize: 10, marginTop: 2 }}>{m.label}</div>
          </a>
        ))}
      </nav>

      {pwOpen && <PasswordDialog onClose={() => setPwOpen(false)} />}

      <style>{`
        @media (max-width: 900px) {
          .gym-side { display: none !important; }
          .gym-bottom { display: flex !important; }
          .gym-content { padding-bottom: 78px !important; }
        }
      `}</style>
    </div>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (pw.length < 4) return setMsg("4자 이상으로 정해주세요.");
    if (pw !== pw2) return setMsg("두 번 입력한 비밀번호가 다릅니다.");
    setBusy(true);
    const res = await fetch("/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: pw }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "바꾸지 못했습니다.");
    location.reload();
  }

  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 17 }}>비밀번호 변경</h3>
        <input
          style={S.modalInput}
          type="password"
          placeholder="새 비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <input
          style={{ ...S.modalInput, marginTop: 10 }}
          type="password"
          placeholder="새 비밀번호 확인"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
        />
        {msg && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 10 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button style={{ ...S.modalBtn, background: "#f3f4f6", color: "#374151" }} onClick={onClose}>
            취소
          </button>
          <button style={S.modalBtn} onClick={save} disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    height: 56,
    padding: "0 16px",
    background: "#fff",
    borderBottom: "1px solid #ececf0",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  brand: { fontWeight: 800, fontSize: 15 },
  branchSelect: {
    padding: "6px 10px",
    border: "1px solid #e3e5e9",
    borderRadius: 8,
    fontSize: 13,
    background: "#fff",
  },
  userBtn: {
    padding: "7px 12px",
    border: "1px solid #e3e5e9",
    borderRadius: 8,
    background: "#fff",
    fontSize: 13,
    cursor: "pointer",
  },
  dropdown: {
    position: "absolute",
    right: 0,
    top: 40,
    width: 170,
    background: "#fff",
    border: "1px solid #ececf0",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
    overflow: "hidden",
  },
  dropInfo: { padding: "10px 14px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #f3f4f6" },
  dropItem: {
    display: "block",
    width: "100%",
    padding: "11px 14px",
    border: "none",
    background: "#fff",
    textAlign: "left",
    fontSize: 13,
    cursor: "pointer",
  },
  body: { display: "flex", alignItems: "flex-start" },
  side: { width: 190, padding: 12, position: "sticky", top: 56, flexShrink: 0 },
  sideItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 12px",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: 14,
    marginBottom: 2,
  },
  content: { flex: 1, padding: "24px 20px", minWidth: 0, maxWidth: 1100 },
  bottom: {
    display: "none",
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: "#fff",
    borderTop: "1px solid #ececf0",
    zIndex: 20,
  },
  bottomItem: {
    flex: 1,
    padding: "9px 0 11px",
    textAlign: "center",
    textDecoration: "none",
  },
  modalWrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: 20,
  },
  modal: { width: "100%", maxWidth: 340, background: "#fff", borderRadius: 14, padding: 22 },
  modalInput: {
    width: "100%",
    padding: "12px 13px",
    border: "1.5px solid #e3e5e9",
    borderRadius: 9,
    fontSize: 14,
    boxSizing: "border-box",
  },
  modalBtn: {
    flex: 1,
    padding: "12px",
    border: "none",
    borderRadius: 9,
    background: "#4f46e5",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
};
