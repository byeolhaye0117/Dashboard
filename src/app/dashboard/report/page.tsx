/**
 * 보고
 *
 * 빠진 것을 모아 알리는 자리다.
 *
 * ── 왜 필요했나 ─────────────────────────────────────────────
 * 방문 경로 · 거주 동네 · 직업은 안 적고 넘어가도 등록이 된다. 그래야 데스크가
 * 회원을 앞에 두고 막히지 않는다. 그런데 그렇게 넘어간 것을 아무도 다시
 * 들여다보지 않아서, 정작 「어느 채널이 회원으로 이어지나」를 물으면 답할
 * 자료가 없었다.
 *
 * 화면이 대신 세어 준다. 누가 빠뜨렸는지 따지려는 것이 아니라, 다음에 그
 * 분과 마주 앉을 때 무엇을 여쭤야 하는지 알려 주려는 것이다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import { listMembers } from "@/lib/members";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  return guard("보고", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("보고")?.view) redirect("/dashboard");

  const [menus, branches] = await Promise.all([visibleMenus(session), getBranches()]);
  const myBranches = await myBranchesOf(session, branches);
  const allowed = new Set(myBranches.map((b) => b.code));

  let rows: any[] = [];
  let problem = "";
  try {
    const { items } = await listMembers();
    rows = items
      .filter((m) => allowed.has(m.지점코드))
      /* 탈퇴하신 분까지 챙길 이유는 없다 */
      .filter((m) => (m.회원상태 || "유효") !== "탈퇴")
      .map((m) => ({
        id: m.id,
        이름: m.이름,
        전화번호: m.전화번호,
        지점코드: m.지점코드,
        가입일: (m.가입일 ?? "").slice(0, 10),
        방문경로: (m.방문경로 ?? "").trim(),
        거주동네: (m.거주동네 ?? "").trim(),
        직업: (m.직업 ?? "").trim(),
        미입력사유: (m.미입력사유 ?? "").trim(),
      }))
      .filter((m) => !m.방문경로 || !m.거주동네 || !m.직업);
  } catch (e: any) {
    problem = String(e?.message ?? e);
  }

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="보고" crumb="보고"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        rows={rows}
        branches={myBranches.map((b) => ({ code: b.code, name: b.name }))}
        currentBranch={session.currentBranch}
        problem={problem}
      />
    </Shell>
  );
}
