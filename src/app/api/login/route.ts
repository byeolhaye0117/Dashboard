import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getStaffAll, getStaffBranches, getRoles } from "@/lib/data";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * 로그인.
 *
 * 비밀번호 확인은 전부 이 서버 안에서 일어난다.
 * 브라우저는 맞았는지 틀렸는지만 알 뿐, 저장된 비밀번호를 볼 수 없다.
 */
export async function POST(req: Request) {
  try {
    const { staffId, branch, password } = await req.json();
    if (!staffId || !branch || !password) {
      return NextResponse.json({ error: "지점 · 직원 · 비밀번호를 모두 입력해주세요." }, { status: 400 });
    }

    const [staffList, branchMap, roles] = await Promise.all([
      getStaffAll(),
      getStaffBranches(),
      getRoles(),
    ]);

    const staff = staffList.find((s) => s.id === staffId);
    // 어떤 경우든 같은 메시지를 준다. "그 직원은 없다"는 정보도 흘리지 않기 위해서다.
    const fail = () =>
      NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });

    if (!staff || !staff.active) return fail();

    const myBranches = branchMap.get(staff.id) ?? [];
    if (staff.mainBranch && !myBranches.includes(staff.mainBranch)) myBranches.push(staff.mainBranch);
    if (!myBranches.includes(branch)) return fail();

    let mustChangePassword = false;

    if (staff.passwordHash) {
      const ok = await bcrypt.compare(password, staff.passwordHash);
      if (!ok) return fail();
      // 관리자가 발급해준 임시 비밀번호면 본인 것으로 바꾸게 한다
      mustChangePassword = staff.temp;
    } else {
      // 비밀번호가 아직 없는 계정
      const init = process.env.ADMIN_INIT_PASSWORD;
      const isOwner = staff.roleCode === "R1";
      if (!isOwner || !init || password !== init) {
        return NextResponse.json(
          { error: "비밀번호가 설정되지 않은 계정입니다. 대표님께 요청해주세요." },
          { status: 401 }
        );
      }
      mustChangePassword = true;
    }

    const role = roles.find((r) => r.code === staff.roleCode);
    const scope = role?.scope ?? "담당지점";

    await createSession({
      staffId: staff.id,
      name: staff.name,
      roleCode: staff.roleCode,
      roleName: role?.name ?? "",
      scope,
      branches: scope === "전체" ? [] : myBranches,
      currentBranch: branch,
      mustChangePassword,
    });

    return NextResponse.json({ ok: true, mustChangePassword });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "로그인 처리 중 문제가 생겼습니다." }, { status: 500 });
  }
}
