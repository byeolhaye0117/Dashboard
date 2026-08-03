import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getStaffAll, getStaffBranches, getRoles } from "@/lib/data";
import { createSession } from "@/lib/session";
import { setPassword } from "@/lib/staffAdmin";
import { abilitiesFor } from "@/lib/menu";

export const dynamic = "force-dynamic";

/**
 * 이 값이 암호화된 비밀번호인가
 *
 * bcrypt 로 암호화한 값은 항상 $2a$ / $2b$ / $2y$ 로 시작하는 60글자다.
 * 그렇지 않으면 사람이 시트에 글자 그대로 적어 넣은 것이다.
 */
function looksEncrypted(v: string): boolean {
  return /^\$2[aby]\$\d{2}\$.{53}$/.test(v);
}

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

    if (staff.passwordHash && looksEncrypted(staff.passwordHash)) {
      const ok = await bcrypt.compare(password, staff.passwordHash);
      if (!ok) return fail();
      // 관리자가 발급해준 임시 비밀번호면 본인 것으로 바꾸게 한다
      mustChangePassword = staff.temp;
    } else if (staff.passwordHash) {
      // 시트 비밀번호 칸에 사람이 직접 적어 넣은 경우.
      // 맞으면 받아주되, 그 자리에서 암호로 바꿔 저장한다.
      // 시트에 비밀번호가 글자 그대로 남아 있으면 시트를 여는 사람 누구나 볼 수 있다.
      if (password !== staff.passwordHash) return fail();
      await setPassword(staff.id, password, true);
      mustChangePassword = true;
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

    // 스스로 못 바꾸는 사람에게 "바꾸세요" 라고 하면 할 수 있는 일이 없다
    const canChange = Boolean((await abilitiesFor(staff.roleCode)).get("직원관리")?.update);
    if (!canChange) mustChangePassword = false;

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
