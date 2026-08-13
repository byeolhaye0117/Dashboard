/**
 * 리뷰 답글
 *
 * 손님이 남긴 리뷰를 붙여넣으면 AI 가 답글 초안을 써 준다.
 * 지점마다 심을 키워드가 다르므로, 지점을 고르면 그 동네 말이 후보로 뜬다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getStaffAll } from "@/lib/data";
import { listReplies, listSettings } from "@/lib/reviews";
import { placeReady } from "@/lib/place";
import { DAILY_LIMIT_DEFAULT } from "@/lib/reviewMeta";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  return guard("리뷰 답글", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("리뷰");
  if (!mine?.view) redirect("/dashboard");

  const [menus, branches, staff] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getStaffAll(),
  ]);
  /* 지점 범위는 화면을 열 때마다 다시 잰다 — 권한과 같은 규칙이다.
     로그인할 때 굳혀 둔 쿠키만 믿으면, 범위를 좁혀도 다시 로그인할 때까지 넓다 */
  const myBranches = await myBranchesOf(session, branches);

  let replies: any[] = [];
  let settings: any[] = [];
  let problem = "";
  try {
    [replies, settings] = await Promise.all([listReplies(), listSettings()]);
  } catch (e: any) {
    problem = String(e?.message ?? e);
  }
  // 남의 지점 답글까지 보여줄 이유가 없다
  const codes = new Set(myBranches.map((b) => b.code));
  replies = replies.filter((r) => codes.has(r.지점코드));

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const limit = Number(process.env.REVIEW_DAILY_LIMIT) || DAILY_LIMIT_DEFAULT;

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="리뷰" crumb="리뷰 답글"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        me={session.staffId}
        myBranch={session.currentBranch}
        branches={myBranches.map((b) => ({ code: b.code, name: b.name }))}
        people={staff.map((s) => ({ id: s.id, name: s.name }))}
        replies={replies}
        settings={settings.filter((s) => codes.has(s.지점코드))}
        can={{
          create: Boolean(mine.create),
          update: Boolean(mine.update),
          remove: Boolean(mine.remove),
        }}
        hasKey={hasKey}
        hasPlace={placeReady()}
        limit={limit}
        problem={problem}
      />
    </Shell>
  );
}
