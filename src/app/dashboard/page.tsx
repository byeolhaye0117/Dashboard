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
import { today } from "@/lib/time";
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

  const hour = new Date().getHours();
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
              <span className="st">{MENU_NOTE[m.key] ?? ""}</span>
              <span className={`pill${READY.has(m.key) ? " good" : ""}`} style={{ marginTop: 10 }}>
                {READY.has(m.key) ? "사용 가능" : "준비 중"}
              </span>
            </a>
          ))}
      </div>

      <h2 className="sec-title">지금 상태</h2>
      <div className="panel">
        <div className="bd">
          <p>
            로그인과 권한 분리가 제대로 도는지 확인하는 단계입니다.
            위 숫자는 지어낸 값이 아니라 <strong>구글 시트에서 방금 읽어온 실제 값</strong>입니다.
          </p>
          <p>
            메뉴는 대표님이 정하신 직급별 권한에 따라 사람마다 다르게 보입니다.
            지금 이 계정에는 <strong>{menus.length}개</strong>가 보이고 있습니다.
          </p>
          <p>
            왼쪽 아래 <strong>밝게 / 어둡게</strong> 단추로 화면 색을 바꿀 수 있고,
            다음에 들어오셔도 그대로 유지됩니다.
          </p>
          {canChangePassword && (
            <p>
              자료가 아직 적어 화면이 비어 보인다면{" "}
              <a href="/dashboard/sample" style={{ color: "var(--point)", fontWeight: 700 }}>
                샘플 자료 넣기
              </a>
              로 13개월치를 넣어보실 수 있습니다. 확인 후 한 번에 지울 수 있습니다.
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** 지금 실제로 쓸 수 있는 메뉴 */
const READY = new Set(["상담", "직원관리", "회원", "매출", "근태", "권한설정", "PT·수업"]);

/** 카드에 붙는 한 줄 설명 */
const MENU_NOTE: Record<string, string> = {
  "회원": "회원 명단과 이용권, 만료일 관리",
  "매출": "결제 등록과 일별·월별 매출",
  "상담": "문의 접수부터 등록 전환까지",
  "PT·수업": "트레이너 일정과 그룹수업",
  "근태": "위치 기반 출퇴근과 휴무",
  "공지": "공지 발행과 업무 체크리스트",
  "시설·재고": "기구 점검과 비품 관리",
  "직원관리": "계정 발급과 담당 지점 배정",
  "권한설정": "직급별로 보이는 메뉴 조정",
};
