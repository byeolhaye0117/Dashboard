/**
 * 상품 관리
 *
 * 회원에게 파는 것들의 정의. 여기서 정한 갈래·기간·가격이 회원 화면의
 * 이용권 줄과 매출 계산에 그대로 쓰인다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import { listProductsAdmin } from "@/lib/products";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  return guard("상품 관리", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("상품");
  if (!mine?.view) redirect("/dashboard");

  const [menus, branches] = await Promise.all([visibleMenus(session), getBranches()]);
  /* 지점 범위는 화면을 열 때마다 다시 잰다 — 권한과 같은 규칙이다.
     로그인할 때 굳혀 둔 쿠키만 믿으면, 범위를 좁혀도 다시 로그인할 때까지 넓다 */
  const myBranches = await myBranchesOf(session, branches);

  let items: any[] = [];
  let problem = "";
  try {
    items = await listProductsAdmin();
  } catch (e: any) {
    problem = String(e?.message ?? e);
  }

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="상품" crumb="상품 관리"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        items={items}
        branches={myBranches.map((b) => ({ code: b.code, name: b.name }))}
        can={{ create: Boolean(mine.create), update: Boolean(mine.update), remove: Boolean(mine.remove) }}
        problem={problem}
      />
    </Shell>
  );
}
