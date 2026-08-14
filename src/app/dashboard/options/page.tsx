/**
 * 목록 관리
 *
 * 화면에서 고르게 되어 있는 값들(성별 · 나이대 · 거주 동네 …)을 여기서 고친다.
 * 지금까지는 구글 시트를 직접 열어야 했다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import { listOptions, OPTION_USED } from "@/lib/options";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function OptionsPage() {
  return guard("목록 관리", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("권한설정")?.view) redirect("/dashboard");

  const [menus, branches, rows] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    listOptions(),
  ]);
  const myBranches = await myBranchesOf(session, branches);

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="권한설정" crumb="목록 관리"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        rows={rows}
        used={OPTION_USED}
        canEdit={Boolean(ab.get("권한설정")?.update)}
      />
    </Shell>
  );
}
