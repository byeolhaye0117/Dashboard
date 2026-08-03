/**
 * 화면 확인용 샘플 자료 화면
 *
 * 자료가 한두 건일 때는 매출·회원 화면이 어떤 모습인지 알 수 없다.
 * 지난 13개월치를 한 번에 넣어보고, 확인이 끝나면 한 번에 지운다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import Shell from "../Shell";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function SamplePage() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("직원관리")?.update) redirect("/dashboard");

  const [menus, branches] = await Promise.all([visibleMenus(session), getBranches()]);
  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="홈" crumb="샘플 자료"
           canChangePassword>
      <Client />
    </Shell>
  );
}
