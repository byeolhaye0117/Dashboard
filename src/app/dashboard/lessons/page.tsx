/**
 * PT · 수업
 *
 * 수업을 미리 잡아두고, 끝나면 트레이너 본인이 결과를 찍는다.
 * 회차는 "완료"로 찍을 때만 빠진다. 노쇼는 기록만 남는다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { myBranchesOf } from "@/lib/scope";
import { visibleMenus, abilitiesForStaff } from "@/lib/menu";
import { getBranches, getStaffAll, getStaffBranches, getProducts } from "@/lib/data";
import { listMembers, listTickets } from "@/lib/members";
import { readProduct } from "@/lib/productMeta";
import { listLessons, SHEET_L } from "@/lib/lessons";
import { listSheetNames } from "@/lib/sheets";
import { KIND_PT, KIND_GROUP, parseSlots } from "@/lib/lessonMeta";
import { photoStoreReady } from "@/lib/photos";
import Shell from "../Shell";
import Client from "./Client";
import { guard } from "../guard";

export const dynamic = "force-dynamic";

export default async function LessonsPage() {
  return guard("PT · 수업", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  // 직급 권한만이 아니라 「트레이너」 체크도 같이 본다
  const ab = await abilitiesForStaff(session);
  const mine = ab.get("PT·수업");
  if (!mine?.view) redirect("/dashboard");

  const [menus, branches, staff, branchMap, products] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getStaffAll(),
    getStaffBranches(),
    getProducts(),
  ]);

  /* 지점 범위는 화면을 열 때마다 다시 잰다 — 권한과 같은 규칙이다.
     로그인할 때 굳혀 둔 쿠키만 믿으면, 범위를 좁혀도 다시 로그인할 때까지 넓다 */
  const myBranches = await myBranchesOf(session, branches);
  const allowed = new Set(myBranches.map((b) => b.code));

  /** 수업을 맡는 사람 — 직원 관리에서 「트레이너」로 체크된 담당 지점 재직자 */
  const trainers = staff
    .filter((s) => s.active && s.trainer)
    .filter((s) => {
      if (s.id === session.staffId) return true;
      const where = [...(branchMap.get(s.id) ?? []), s.mainBranch].filter(Boolean);
      return where.some((b) => allowed.has(b));
    })
    .map((s) => ({
      id: s.id,
      name: s.name,
      branch: (branchMap.get(s.id) ?? [])[0] || s.mainBranch || "",
    }));

  /** 사번 → 맡은 그룹수업 시간대. 화면에서는 이걸 단추로 고른다 */
  const groupSlots: Record<string, string[]> = {};
  staff.filter((s) => s.active && s.trainer).forEach((s) => {
    groupSlots[s.id] = parseSlots(s.groupSlots);
  });

  /**
   * 지금 보는 사람이 수업을 하는 사람인가
   *
   * 대표님처럼 수업을 안 하는 분에게 「보고하기」를 보여주면, 평생 안 쓸 화면이
   * 자리만 차지한다. 보고는 수업한 사람이 하는 것이고, 대표님은 확인만 하신다.
   */
  const iAmTrainer = staff.some((s) => s.id === session.staffId && s.trainer);

  /*
   * 사진 폴더가 준비 안 됐으면 무엇을 해야 하는지 화면에서 알려준다
   *
   * 보고하는 사람뿐 아니라 준비하는 사람(대표님)에게도 보여야 한다.
   * 폴더를 만들고 공유하는 것은 대표님 일인데, 정작 그분 화면에 안내가 없으면
   * 무엇을 어디에 만들어야 하는지 알 길이 없다.
   */
  const canSetup = Boolean(ab.get("직원관리")?.update);
  const photoProblem = iAmTrainer || canSetup ? photoStoreReady() : "";

  /** 수업으로 팔 수 있는 상품만 — 회원권·락커는 여기 안 온다 */
  const lessonProducts = products
    .map(readProduct)
    .filter((p) => p.kind === KIND_PT || p.kind === KIND_GROUP)
    .map((p) => ({ code: p.code, name: p.name, kind: p.kind, count: p.count }));

  // 수업 탭이 아직 없을 수 있다. 없으면 화면에서 만들 수 있게 알려준다
  let lessons: any[] = [];
  let joins: any[] = [];
  let members: any[] = [];
  let tickets: any[] = [];
  let ready = true;
  let problem = "";
  try {
    const names = await listSheetNames();
    ready = names.includes(SHEET_L);
    if (ready) {
      const [got, m, t] = await Promise.all([listLessons(), listMembers(), listTickets()]);
      const seen = new Set(got.lessons.filter((l) => allowed.has(l.지점코드)).map((l) => l.id));
      lessons = got.lessons.filter((l) => seen.has(l.id));
      joins = got.joins.filter((j) => seen.has(j.수업번호));

      members = m.items
        .filter((x) => allowed.has(x.지점코드))
        .map((x) => ({ id: x.id, name: x.이름, branch: x.지점코드 }));

      // 수업에 쓸 수 있는 이용권만 — 횟수가 있는 것
      const lessonCodes = new Set(lessonProducts.map((p) => p.code));
      tickets = t
        .filter((x) => lessonCodes.has(x.상품코드))
        .filter((x) => (x.상태 || "진행중") === "진행중")
        .map((x) => ({
          id: x.id,
          회원번호: x.회원번호,
          상품코드: x.상품코드,
          잔여횟수: x.잔여횟수,
          총횟수: x.총횟수,
          종료일: (x.종료일 ?? "").slice(0, 10),
          담당트레이너사번: x.담당트레이너사번,
        }));
    }
  } catch (e: any) {
    problem = String(e?.message ?? e);
  }

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="PT·수업" crumb="PT · 수업"
           canChangePassword={Boolean(ab.get("직원관리")?.update)}>
      <Client
        me={session.staffId}
        myBranch={session.currentBranch}
        lessons={lessons}
        joins={joins}
        trainers={trainers}
        members={members}
        tickets={tickets}
        products={lessonProducts}
        can={{ create: Boolean(mine.create), update: Boolean(mine.update), remove: Boolean(mine.remove) }}
        iAmTrainer={iAmTrainer}
        groupSlots={groupSlots}
        photoProblem={photoProblem}
        canSetup={canSetup}
        ready={ready}
        problem={problem}
      />
    </Shell>
  );
}
