"use client";

/**
 * 로그인 화면
 *
 * 지점 선택 → 직원 선택 → 비밀번호.
 * 아이디를 외울 필요가 없어 헬스장 현장에 맞는 방식이다.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Branch = { code: string; name: string };
type Staff = { id: string; name: string; roleName: string };

export default function LoginPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branch, setBranch] = useState("");
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setBranches(d) : setError(d.error ?? "지점을 불러오지 못했습니다.")))
      .catch(() => setError("지점을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."));
  }, []);

  useEffect(() => {
    setStaffId("");
    setStaff([]);
    if (!branch) return;
    setLoadingStaff(true);
    fetch(`/api/staff-list?branch=${encodeURIComponent(branch)}`)
      .then((r) => r.json())
      .then((d) => setStaff(Array.isArray(d) ? d : []))
      .catch(() => setStaff([]))
      .finally(() => setLoadingStaff(false));
  }, [branch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!branch || !staffId) return setError("지점과 직원을 선택해주세요.");
    if (!password) return setError("비밀번호를 입력해주세요.");

    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, staffId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "로그인하지 못했습니다.");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={S.wrap}>
      <form onSubmit={submit} style={S.card}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={S.title}>헬스장 업무 대시보드</h1>
          <p style={S.sub}>지점과 이름을 고르고 비밀번호를 입력하세요</p>
        </div>

        <label style={S.label}>지점</label>
        <select style={S.input} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">지점을 선택하세요</option>
          {branches.map((b) => (
            <option key={b.code} value={b.code}>{b.name}</option>
          ))}
        </select>

        <label style={S.label}>이름</label>
        <select
          style={{ ...S.input, background: branch ? "#fff" : "#f2f3f5" }}
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          disabled={!branch || loadingStaff}
        >
          <option value="">
            {!branch ? "지점을 먼저 선택하세요" : loadingStaff ? "불러오는 중…" : "이름을 선택하세요"}
          </option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.roleName})</option>
          ))}
        </select>

        <label style={S.label}>비밀번호</label>
        <input
          style={S.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          autoComplete="current-password"
        />

        {error && <div style={S.error}>{error}</div>}

        <button type="submit" style={{ ...S.button, opacity: loading ? 0.6 : 1 }} disabled={loading}>
          {loading ? "확인 중…" : "로그인"}
        </button>

        <p style={S.foot}>
          로그인이 안 되면 <a href="/setup" style={{ color: "#4f46e5" }}>연결 점검</a> 화면을 확인하세요
        </p>
      </form>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    background: "#fff",
    borderRadius: 18,
    padding: 32,
    boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
  },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  sub: { margin: "8px 0 0", fontSize: 13, color: "#8a8f98" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#4b5563", margin: "16px 0 6px" },
  input: {
    width: "100%",
    padding: "13px 14px",
    fontSize: 15,
    border: "1.5px solid #e3e5e9",
    borderRadius: 10,
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  },
  error: {
    marginTop: 14,
    padding: "10px 12px",
    background: "#fef2f2",
    color: "#b91c1c",
    fontSize: 13,
    borderRadius: 8,
  },
  button: {
    width: "100%",
    marginTop: 22,
    padding: "15px",
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
    background: "#4f46e5",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },
  foot: { marginTop: 18, marginBottom: 0, textAlign: "center", fontSize: 12, color: "#9aa0a6" },
};
