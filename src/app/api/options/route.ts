import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { addOption, patchOption, listOptions } from "@/lib/options";

export const dynamic = "force-dynamic";

/**
 * 고르는 목록 고치기
 *
 * 여기 값을 바꾸면 회원 · 상담 화면에서 고를 수 있는 것이 바뀐다.
 * 권한을 정하는 사람과 같은 무게라, 같은 자격을 본다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("권한설정")?.update) {
    return NextResponse.json({ error: "목록을 고칠 수 없는 계정입니다." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const action = String(b.action ?? "");

    if (action === "add") {
      await addOption(String(b.구분 ?? ""), String(b.값 ?? ""), session.staffId);
      return NextResponse.json({ ok: true });
    }

    if (action === "patch") {
      const 줄 = Math.floor(Number(b.줄));
      if (!Number.isFinite(줄) || 줄 <= 0) {
        return NextResponse.json({ error: "고칠 줄을 찾지 못했습니다." }, { status: 400 });
      }
      await patchOption(
        줄,
        {
          값: b.값 !== undefined ? String(b.값) : undefined,
          씀: b.씀 !== undefined ? Boolean(b.씀) : undefined,
          지움: b.지움 ? true : undefined,
          정렬순서: b.정렬순서 !== undefined ? Math.floor(Number(b.정렬순서)) : undefined,
        },
        session.staffId
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}

/**
 * 한 목록의 값들 — 화면에 겹쳐 여는 창에서 읽는다
 *
 * 회원을 등록하다가 「목록 고치기」를 누르면 그 자리에서 창이 뜬다. 창은
 * 값만이 아니라 시트의 몇 번째 줄인지도 알아야 고칠 수 있어서, 화면이
 * 처음 받은 값 목록으로는 모자란다.
 */
export async function GET(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  if (!ab.get("권한설정")?.update) {
    return NextResponse.json({ error: "목록을 고칠 수 없는 계정입니다." }, { status: 403 });
  }

  const kind = new URL(req.url).searchParams.get("kind") ?? "";
  if (!kind) return NextResponse.json({ error: "어느 목록인지 알 수 없습니다." }, { status: 400 });

  try {
    const rows = await listOptions();
    return NextResponse.json({
      items: rows
        .filter((r) => r.구분 === kind)
        .map((r) => ({ 줄: r.줄, 값: r.값, 씀: r.씀 })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "읽지 못했습니다." }, { status: 500 });
  }
}
