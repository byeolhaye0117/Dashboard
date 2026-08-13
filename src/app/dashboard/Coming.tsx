/**
 * 아직 만들지 않은 메뉴
 *
 * 메뉴에는 보이는데 눌러도 아무 화면이 없으면 "없는 주소" 오류가 뜬다.
 * 쓰는 분 눈에는 고장으로 보인다. 그래서 무엇을 만들 예정인지 적어둔다.
 *
 * 화면이 생기면 이 파일을 쓰던 page.tsx 를 진짜 화면으로 바꾸면 된다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import Icon from "@/components/Icon";
import Shell from "./Shell";
import { guard } from "./guard";

export default async function Coming(props: { menu: string; crumb: string; plan: string[] }) {
  return guard(props.crumb, () => render(props));
}

async function render({ menu, crumb, plan }: { menu: string; crumb: string; plan: string[] }) {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get(menu)?.view) redirect("/dashboard");

  const [menus, branches] = await Promise.all([visibleMenus(session), getBranches()]);
  /* 지점 범위는 화면을 열 때마다 다시 잰다 — 권한과 같은 규칙이다.
     로그인할 때 굳혀 둔 쿠키만 믿으면, 범위를 좁혀도 다시 로그인할 때까지 넓다 */
  const myBranches = await myBranchesOf(session, branches);

  return (
    <Shell session={session} menus={menus} branches={myBranches} active={menu} crumb={crumb}
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <h1 className="page-title">{crumb}</h1>
      <p className="page-sub">아직 만드는 중입니다. 메뉴에는 먼저 자리를 잡아두었습니다.</p>

      <div className="panel">
        <div className="bd">
          <p style={{ marginTop: 0 }}>여기에 들어올 것들입니다.</p>
          <ul className="plan">
            {plan.map((line) => (
              <li key={line}>
                <Icon name="check" size={15} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p style={{ marginBottom: 0 }}>
            순서를 바꾸고 싶거나 빠진 것이 있으면 말씀해주세요. 만들기 전에 정하는 편이 훨씬 쌉니다.
          </p>
        </div>
      </div>
    </Shell>
  );
}
