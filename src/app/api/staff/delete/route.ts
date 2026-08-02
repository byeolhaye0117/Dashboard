import { NextResponse } from "next/server";
import { softDeleteStaff } from "@/lib/staffAdmin";
import { guard, blockOwnerEscalation, keepOneOwner } from "@/lib/staffGuard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard("remove");
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const { id } = await req.json();
    const target = g.staff.find((s) => s.id === String(id ?? ""));
    if (!target) return NextResponse.json({ error: "해당 직원이 없습니다." }, { status: 404 });

    const bad = blockOwnerEscalation(g.session, target);
    if (bad) return NextResponse.json({ error: bad }, { status: 403 });

    if (target.id === g.session.staffId) {
      return NextResponse.json({ error: "본인 계정은 지울 수 없습니다." }, { status: 400 });
    }
    if (target.roleCode === "R1") {
      const last = keepOneOwner(g.staff, target.id);
      if (last) return NextResponse.json({ error: last }, { status: 400 });
    }

    await softDeleteStaff(target.id, g.session.staffId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "지우지 못했습니다." }, { status: 500 });
  }
}
