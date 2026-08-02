import { NextResponse } from "next/server";
import { patchStaff } from "@/lib/staffAdmin";
import { guard, blockOwnerEscalation, blockOwnerCreation, keepOneOwner } from "@/lib/staffGuard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard("update");
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const b = await req.json();
    const id = String(b.id ?? "");
    const target = g.staff.find((s) => s.id === id);
    if (!target) return NextResponse.json({ error: "해당 직원이 없습니다." }, { status: 404 });

    const bad = blockOwnerEscalation(g.session, target);
    if (bad) return NextResponse.json({ error: bad }, { status: 403 });

    const c = b.changes ?? {};
    const roleCode = c.직급코드 === undefined ? undefined : String(c.직급코드);
    const accountOn = c.계정사용 === undefined ? undefined : Boolean(c.계정사용);
    const status = c.재직상태 === undefined ? undefined : String(c.재직상태);

    if (roleCode !== undefined) {
      const up = blockOwnerCreation(g.session, roleCode);
      if (up) return NextResponse.json({ error: up }, { status: 403 });
    }

    // 자기 계정을 잠그거나 자기 직급을 낮추면 스스로 갇힌다
    if (id === g.session.staffId) {
      if (accountOn === false || (status !== undefined && status !== "재직중")) {
        return NextResponse.json(
          { error: "본인 계정은 끌 수 없습니다. 다른 관리자에게 요청해주세요." },
          { status: 400 }
        );
      }
      if (roleCode !== undefined && roleCode !== target.roleCode) {
        return NextResponse.json(
          { error: "본인 직급은 바꿀 수 없습니다. 다른 관리자에게 요청해주세요." },
          { status: 400 }
        );
      }
    }

    // 마지막 대표를 끄거나 직급을 내리는 것도 막는다
    const losingOwner =
      target.roleCode === "R1" &&
      (accountOn === false ||
        (status !== undefined && status !== "재직중") ||
        (roleCode !== undefined && roleCode !== "R1"));
    if (losingOwner) {
      const last = keepOneOwner(g.staff, id);
      if (last) return NextResponse.json({ error: last }, { status: 400 });
    }

    await patchStaff(
      id,
      {
        이름: c.이름 === undefined ? undefined : String(c.이름),
        휴대폰: c.휴대폰 === undefined ? undefined : String(c.휴대폰),
        직급코드: roleCode,
        주소속지점: c.주소속지점 === undefined ? undefined : String(c.주소속지점),
        재직상태: status,
        계정사용: accountOn,
        담당지점: Array.isArray(c.담당지점) ? c.담당지점.map(String) : undefined,
      },
      g.session.staffId
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
