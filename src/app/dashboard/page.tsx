/**
 * 대시보드 홈 (뼈대)
 *
 * 로그인한 사람의 직급에 따라 보이는 메뉴가 달라진다.
 * 권한이 없는 메뉴는 아예 목록에 나타나지 않는다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import Shell from "./Shell";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const session = await readSession();
  if (!session) redirect("/");

  const [menus, branches] = await Promise.all([visibleMenus(session), getBranches()]);
  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));
  const current = branches.find((b) => b.code === session.currentBranch);

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="홈">
      {session.mustChangePassword && (
        <div style={warn}>
          <strong>비밀번호를 바꿔주세요.</strong>
          <div style={{ fontSize: 13, marginTop: 6, color: "#92400e" }}>
            지금은 최초 임시 비밀번호로 들어오셨습니다. 오른쪽 위 이름 → 비밀번호 변경에서 바꿔주세요.
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>
        {session.name}님, 안녕하세요
      </h2>
      <p style={{ color: "#6b7280", fontSize: 14, marginTop: 0 }}>
        {session.roleName} · {current?.name ?? session.currentBranch}
        {session.scope === "전체" && " · 전 지점 조회 가능"}
      </p>

      <div style={grid}>
        {menus
          .filter((m) => m.key !== "홈")
          .map((m) => (
            <a key={m.key} href={m.href} style={tile}>
              <div style={{ fontSize: 26 }}>{m.icon}</div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>{m.label}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>준비 중</div>
            </a>
          ))}
      </div>

      <div style={note}>
        <strong style={{ fontSize: 14 }}>지금은 뼈대만 만들어진 상태입니다</strong>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0 0", lineHeight: 1.7 }}>
          로그인과 권한 분리가 제대로 도는지 먼저 확인하는 단계입니다.
          <br />
          위 메뉴는 대표님이 정하신 직급별 권한에 따라 사람마다 다르게 보입니다.
          <br />
          각 메뉴의 실제 기능은 하나씩 붙여 나갑니다.
        </p>
      </div>
    </Shell>
  );
}

const warn: React.CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 10,
  padding: 14,
  marginBottom: 20,
  color: "#92400e",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 12,
  marginTop: 20,
};

const tile: React.CSSProperties = {
  display: "block",
  background: "#fff",
  borderRadius: 14,
  padding: "18px 16px",
  textDecoration: "none",
  color: "#1a1a1a",
  border: "1px solid #ececf0",
};

const note: React.CSSProperties = {
  marginTop: 28,
  background: "#fff",
  border: "1px solid #ececf0",
  borderRadius: 14,
  padding: 18,
};
