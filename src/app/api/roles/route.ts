import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { getStaffAll } from "@/lib/data";
import { createRole, renameRole, moveRole, useRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * 직급 만들기 · 이름 바꾸기 · 차례 바꾸기 · 감추기
 *
 * 직급을 바꾸는 것은 곧 누가 무엇을 볼 수 있는지를 바꾸는 일이라,
 * 권한 설정을 고칠 수 있는 사람만 할 수 있다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("권한설정")?.update) {
    return NextResponse.json({ error: "직급을 바꿀 수 없는 계정입니다." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const action = String(b.action ?? "");
    const code = String(b.code ?? "");

    /* 본인 직급은 손대지 못하게 한다. 스스로를 감추면 그 자리에서 갇힌다 —
       되돌릴 화면에 들어갈 자격 자체가 사라진다 */
    if (code && code === session.roleCode && action !== "rename") {
      return NextResponse.json(
        { error: "본인 직급은 여기서 바꿀 수 없습니다. 다른 관리자에게 요청해주세요." },
        { status: 400 }
      );
    }

    if (action === "create") {
      const newCode = await createRole(String(b.name ?? ""), session.staffId);
      return NextResponse.json({ ok: true, code: newCode });
    }

    if (action === "rename") {
      await renameRole(code, String(b.name ?? ""), session.staffId);
      return NextResponse.json({ ok: true });
    }

    if (action === "move") {
      const dir = b.dir === "up" ? "up" : "down";
      await moveRole(code, dir, session.staffId);
      return NextResponse.json({ ok: true });
    }

    if (action === "use") {
      const on = Boolean(b.on);
      /* 대표가 없어지면 권한을 되돌릴 사람이 사라진다 */
      if (!on && code === "R1") {
        return NextResponse.json(
          { error: "대표 직급은 감출 수 없습니다." },
          { status: 400 }
        );
      }
      /* 쓰고 있는 직원이 남은 채로 감추면, 그 직원의 직급이 화면에서 빈칸이
         된다. 어느 직원을 먼저 옮겨야 하는지 이름까지 알려준다 */
      if (!on) {
        const staff = await getStaffAll();
        const 남은 = staff.filter((s) => s.active && s.roleCode === code);
        if (남은.length > 0) {
          return NextResponse.json(
            {
              error:
                `아직 ${남은.length}명이 이 직급입니다 — ${남은.slice(0, 5).map((s) => s.name).join(" · ")}` +
                `${남은.length > 5 ? " 외" : ""}. 직원 관리에서 먼저 다른 직급으로 옮겨주세요.`,
            },
            { status: 400 }
          );
        }
      }
      await useRole(code, on, session.staffId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
