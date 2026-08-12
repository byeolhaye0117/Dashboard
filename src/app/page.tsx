"use client";

/**
 * 로그인 화면
 *
 * 지점 선택 → 이름 선택 → 비밀번호.
 * 아이디를 외울 필요가 없어 현장에 맞는 방식이다.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

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
    const saved = localStorage.getItem("gym_theme");
    if (saved === "dark" || saved === "light") {
      document.documentElement.setAttribute("data-theme", saved);
    }
    const last = localStorage.getItem("gym_last_branch");
    if (last) setBranch(last);

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
    if (!branch || !staffId) return setError("지점과 이름을 선택해주세요.");
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
      localStorage.setItem("gym_last_branch", branch);
      router.push("/dashboard");
    } catch {
      setError("연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark"><Icon name="dumbbell" size={24} strokeWidth={1.9} /></div>
        <h1>헬스장 업무 대시보드</h1>
        <p className="lead">지점과 이름을 고른 뒤 비밀번호를 입력하세요</p>

        <div className="field">
          <label htmlFor="branch">지점</label>
          <select id="branch" className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">지점을 선택하세요</option>
            {branches.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="staff">이름</label>
          <select
            id="staff"
            className="input"
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
        </div>

        <div className="field">
          <label htmlFor="pw">비밀번호</label>
          <input
            id="pw"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
          />
        </div>

        {error && <div className="alert-bad">{error}</div>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "확인 중…" : "로그인"}
        </button>

        <p className="auth-foot">
          로그인이 안 되면 <a href="/setup">연결 점검</a> 화면을 확인하세요
          <br />
          {/*
            NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA 는 Vercel 설정을 켜야 들어오는 값이라
            비어 있었다. next.config 에서 직접 박아 넣는 값을 쓴다 — 설정과 무관하게
            언제나 채워지고, 대시보드 왼쪽 아래 번호와 같은 값이다.
          */}
          <span className="build-tag">
            화면 버전 {process.env.NEXT_PUBLIC_BUILD || "로컬"}
          </span>
        </p>
      </form>
    </main>
  );
}
