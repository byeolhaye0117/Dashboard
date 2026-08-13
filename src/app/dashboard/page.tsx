/**
 * 대시보드 홈
 *
 * 아직 업무 데이터가 없으므로 지어낸 숫자를 보여주지 않는다.
 * 시트에 실제로 들어 있는 값만 보여준다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus, abilitiesFor } from "@/lib/menu";
import { getBranches, getStaffAll, getProducts, getRoles } from "@/lib/data";
import { listLessons } from "@/lib/lessons";
import { loadAll as loadNotices } from "@/lib/notices";
import { today, hourNow } from "@/lib/time";
import Icon from "@/components/Icon";
import Shell from "./Shell";
import { guard } from "./guard";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  return guard("홈", body);
}

async function body() {
  const session = await readSession();
  if (!session) redirect("/");

  const [menus, branches, staff, products, roles, ab] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getStaffAll(),
    getProducts(),
    getRoles(),
    abilitiesFor(session.roleCode),
  ]);
  const canChangePassword = Boolean(ab.get("직원관리")?.update);

  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));
  const current = branches.find((b) => b.code === session.currentBranch);
  const working = staff.filter((s) => s.active).length;
  const selling = products.filter((p) => p["서비스상품"] !== "Y").length;
  const service = products.length - selling;

  /*
   * 밀린 수업이 있으면 홈에서 먼저 알린다
   *
   * PT·수업 화면에만 띄우면, 그 화면에 안 들어가는 날은 계속 밀린다.
   * 수업 탭이 아직 없을 수도 있으므로 실패해도 홈은 그대로 열려야 한다.
   */
  let lateCount = 0;
  if (ab.get("PT·수업")?.view) {
    try {
      const { lessons, joins } = await listLessons();
      const day = today();
      const waiting = new Set(joins.filter((j) => j.진행상태 === "예정").map((j) => j.수업번호));
      lateCount = lessons.filter(
        (l) => l.날짜 < day && l.진행상태 !== "취소" && waiting.has(l.id)
      ).length;
    } catch {
      lateCount = 0;
    }
  }

  /*
   * 안 읽은 공지와 오늘 안 끝난 일도 홈에서 알린다
   *
   * 공지는 읽으라고 올리는 것이고, 체크리스트는 오늘 안에 끝나야 하는 것이다.
   * 해당 화면에 들어가야만 보이면 둘 다 그냥 지나간다.
   */
  let unread = 0;
  let todo = 0;
  if (ab.get("공지")?.view) {
    try {
      const { notices, reads, tasks, logs } = await loadNotices();
      const mineBranch = new Set(myBranches.map((b) => b.code));
      const seen = new Set(
        reads.filter((r) => r.사번 === session.staffId).map((r) => r.공지번호)
      );
      unread = notices
        .filter((n) => !n.지점코드 || mineBranch.has(n.지점코드))
        .filter((n) => !seen.has(n.id)).length;

      const day = today();
      const done = new Set(logs.filter((l) => l.날짜 === day).map((l) => l.업무번호));
      todo = tasks.filter((t) => t.지점코드 === session.currentBranch && !done.has(t.id)).length;
    } catch {
      unread = 0;
      todo = 0;
    }
  }

  // 서버는 세계표준시로 돈다. 그냥 물으면 아침 여덟 시에 "수고 많으셨습니다"가 나온다
  const hour = hourNow();
  const greet = hour < 11 ? "좋은 아침입니다" : hour < 18 ? "안녕하세요" : "수고 많으셨습니다";

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="홈" crumb="홈"
           canChangePassword={canChangePassword}>
      {session.mustChangePassword && (
        <div className="banner">
          <span className="lead"><Icon name="warn" size={18} /></span>
          <div>
            <b>비밀번호를 바꿔주세요</b>
            <p>지금은 최초 임시 비밀번호로 들어오셨습니다. 왼쪽 아래 또는 오른쪽 위 이름 → 비밀번호 변경에서 바꾸시면 됩니다.</p>
          </div>
        </div>
      )}

      {lateCount > 0 && (
        <div className="banner">
          <span className="lead"><Icon name="warn" size={18} /></span>
          <div>
            <b>지난 수업 {lateCount}건이 아직 처리되지 않았습니다</b>
            <p>
              완료로 찍지 않으면 회차가 빠지지 않아, 회원의 남은 횟수가 실제보다 많아 보입니다.
            </p>
          </div>
          <a className="btn-dark" href="/dashboard/lessons" style={{ whiteSpace: "nowrap" }}>
            처리하러 가기
          </a>
        </div>
      )}

      {(unread > 0 || todo > 0) && (
        <div className="banner">
          <span className="lead"><Icon name="clipboard" size={18} /></span>
          <div>
            <b>
              {[unread > 0 && `안 읽은 공지 ${unread}건`, todo > 0 && `오늘 안 끝난 일 ${todo}개`]
                .filter(Boolean)
                .join(" · ")}
            </b>
            <p>공지·업무 화면에서 확인하실 수 있습니다.</p>
          </div>
          <a className="btn-dark" href="/dashboard/notices" style={{ whiteSpace: "nowrap" }}>
            보러 가기
          </a>
        </div>
      )}

      <h1 className="page-title">{session.name}님, {greet}</h1>
      <p className="page-sub">
        {session.roleName} · {current?.name ?? session.currentBranch}
        {session.scope === "전체" && " · 전 지점 조회 가능"}
        {" · "}볼 수 있는 메뉴 {menus.length}개
      </p>

      <div className="stats">
        <div className="stat">
          <div className="lb">지점</div>
          <div className="vl num">{branches.length}</div>
          <div className="dt">{branches.map((b) => b.name).join(" · ")}</div>
        </div>
        <div className="stat">
          <div className="lb">재직 직원</div>
          <div className="vl num">{working}</div>
          <div className="dt">직급 {roles.length}종</div>
        </div>
        <div className="stat">
          <div className="lb">판매 상품</div>
          <div className="vl num">{selling}</div>
          <div className="dt">회원권 · PT · 수업 · 기타</div>
        </div>
        <div className="stat">
          <div className="lb">서비스 상품</div>
          <div className="vl num">{service}</div>
          <div className="dt">등록 시 얹어주는 항목</div>
        </div>
      </div>

      <h2 className="sec-title">메뉴</h2>
      <div className="cards">
        {menus
          .filter((m) => m.key !== "홈")
          .map((m) => (
            <a key={m.key} href={m.href} className="card-link">
              <span className="badge-ic"><Icon name={m.icon} size={17} strokeWidth={1.8} /></span>
              <span className="nm">{m.label}</span>
              {NOT_READY.has(m.key) && (
                <span className="pill" style={{ marginTop: 10 }}>준비 중</span>
              )}
            </a>
          ))}
      </div>

    </Shell>
  );
}

/*
 * 아직 안 만든 메뉴
 *
 * 예전에는 「다 된 메뉴」를 적어 두었는데, 새 화면을 만들 때마다 여기 적는 것을
 * 잊어서 다 되는 화면이 「준비 중」으로 표시됐다. 상품 관리와 리뷰 답글이
 * 그랬다. 안 된 것만 적는 편이 잊어도 덜 틀린다.
 */
const NOT_READY = new Set(["시설·재고"]);
