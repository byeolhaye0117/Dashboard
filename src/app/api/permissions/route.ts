import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { saveRolePermissions, saveRoleScope } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * 권한 저장
 *
 * 권한을 바꾸는 것은 곧 누가 무엇을 볼 수 있는지를 바꾸는 일이라,
 * 권한설정 수정 권한이 있는 사람만 할 수 있다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("권한설정")?.update) {
    return NextResponse.json({ error: "권한을 바꿀 수 없는 계정입니다." }, { status: 403 });
  }

  try {
    const { roleCode, rows, scope } = await req.json();

    // 자기 직급의 권한을 스스로 낮추면 그 자리에서 갇힌다
    if (roleCode === session.roleCode) {
      return NextResponse.json(
        { error: "본인 직급의 권한은 바꿀 수 없습니다. 다른 관리자에게 요청해주세요." },
        { status: 400 }
      );
    }

    /* 지점 범위는 「이 사람이 어느 지점 숫자를 보는가」다. 권한과 같은 질문이라
       같은 자리에서 같이 저장한다. 안 보낸 경우에는 손대지 않는다 */
    if (scope !== undefined) {
      await saveRoleScope(String(roleCode), String(scope), session.staffId);
    }
    await saveRolePermissions(String(roleCode), Array.isArray(rows) ? rows : [], session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
