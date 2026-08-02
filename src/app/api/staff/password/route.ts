import { NextResponse } from "next/server";
import { setPassword, makeTempPassword } from "@/lib/staffAdmin";
import { guard, blockOwnerEscalation } from "@/lib/staffGuard";

export const dynamic = "force-dynamic";

/**
 * 임시 비밀번호 발급
 *
 * 만들어진 비밀번호는 이 응답에 딱 한 번만 실려 나간다.
 * 시트에는 암호화된 형태로만 저장되므로, 나중에 다시 꺼내볼 수 없다.
 * 잊어버리면 새로 발급하면 된다.
 */
export async function POST(req: Request) {
  const g = await guard("update");
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const { id } = await req.json();
    const target = g.staff.find((s) => s.id === String(id ?? ""));
    if (!target) return NextResponse.json({ error: "해당 직원이 없습니다." }, { status: 404 });

    const bad = blockOwnerEscalation(g.session, target);
    if (bad) return NextResponse.json({ error: bad }, { status: 403 });

    if (!target.accountOn || target.status !== "재직중") {
      return NextResponse.json(
        { error: "계정이 꺼져 있거나 재직 중이 아닙니다. 상태를 먼저 바꿔주세요." },
        { status: 400 }
      );
    }

    const password = makeTempPassword();
    await setPassword(target.id, password, true);

    return NextResponse.json({ ok: true, name: target.name, password });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "발급하지 못했습니다." }, { status: 500 });
  }
}
