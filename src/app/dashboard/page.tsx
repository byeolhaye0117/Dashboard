/**
 * 대시보드 홈
 *
 * 아직 업무 데이터가 없으므로 지어낸 숫자를 보여주지 않는다.
 * 대신 시트에 실제로 들어 있는 기준정보를 그대로 보여준다.
 */
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { visibleMenus } from "@/lib/menu";
import { getBranches, getStaffAll, getProducts } from "@/lib/data";
import Icon from "@/components/Icon";
import Shell from "./Shell";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const session = await readSession();
  if (!session) redirect("/");

  const [menus, branches, staff, products] = await Promise.all([
    visibleMenus(session),
    getBranches(),
    getStaffAll(),
    getProducts(),
  ]);

  const myBranches =
    session.scope === "전체" ? branches : branches.filter((b) => session.branches.includes(b.code));
  const current = branches.find((b) => b.code === session.currentBranch);
  const working = staff.filter((s) => s.active).length;
  const selling = products.filter((p) => p["서비스상품"] !== "Y").length;
  const service = products.length - selling;

  return (
    <Shell session={session} menus={menus} branches={myBranches} active="홈">
      {session.mustChangePassword && (
        <div className="banner">
          <span className="lead"><Icon name="warn" size={18} /></span>
          <div>
            <b>비밀번호를 바꿔주세요</b>
            <p>지금은 최초 임시 비밀번호로 들어오셨습니다. 오른쪽 위 이름 → 비밀번호 변경에서 바꾸시면 됩니다.</p>
          </div>
        </div>
      )}

      <h1 className="h1">{session.name}님, 안녕하세요</h1>
      <p className="sub">
        {session.roleName} · {current?.name ?? session.currentBranch}
        {session.scope === "전체" && " · 전 지점 조회 가능"}
      </p>

      <div className="tiles">
        <div className="tile">
          <div className="lb">지점</div>
          <div className="vl num">{branches.length}</div>
          <div className="dt">{branches.map((b) => b.name).join(" · ")}</div>
        </div>
        <div className="tile">
          <div className="lb">재직 직원</div>
          <div className="vl num">{working}</div>
          <div className="dt">전체 {staff.length}명 중</div>
        </div>
        <div className="tile">
          <div className="lb">판매 상품</div>
          <div className="vl num">{selling}</div>
          <div className="dt">회원권 · PT · 수업 · 기타</div>
        </div>
        <div className="tile">
          <div className="lb">서비스 상품</div>
          <div className="vl num">{service}</div>
          <div className="dt">등록 시 얹어주는 항목</div>
        </div>
      </div>

      <h2 className="h2">메뉴</h2>
      <div className="cards">
        {menus
          .filter((m) => m.key !== "홈")
          .map((m) => (
            <a key={m.key} href={m.href} className="card-link">
              <span className="ic"><Icon name={m.icon} size={22} /></span>
              <span className="nm">{m.label}</span>
              <span className="st">준비 중</span>
            </a>
          ))}
      </div>

      <h2 className="h2">지금 상태</h2>
      <div className="panel">
        <div className="bd">
          <p>
            로그인과 권한 분리가 제대로 도는지 확인하는 단계입니다.
            위에 보이는 숫자는 지어낸 값이 아니라 <strong>구글 시트에서 방금 읽어온 실제 값</strong>입니다.
          </p>
          <p>
            메뉴는 대표님이 정하신 직급별 권한에 따라 사람마다 다르게 보입니다.
            지금 <strong>{menus.length}개</strong>가 보이고 있습니다.
          </p>
          <p>
            각 메뉴의 실제 기능은 하나씩 붙여 나갑니다.
            오른쪽 위 달 모양 단추를 누르면 어두운 화면으로 바뀌고, 다음에 들어오셔도 그대로 유지됩니다.
          </p>
        </div>
      </div>
    </Shell>
  );
}
