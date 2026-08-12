import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import {
  createProduct, patchProduct, setBranches, softDeleteProduct, KINDS,
} from "@/lib/products";

export const dynamic = "force-dynamic";

/**
 * 상품 원장 고치기
 *
 * 상품 한 줄을 고치면 그 상품으로 판 이용권 전부의 성격이 바뀐다.
 * 회원 한 명을 고치는 것과 무게가 다르므로 「상품」 권한을 따로 본다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("상품");
  if (!mine?.view) {
    return NextResponse.json({ error: "상품을 다룰 수 없는 계정입니다." }, { status: 403 });
  }

  /** 담당 지점 안인가 — 화면이 보낸 지점을 그대로 믿지 않는다 */
  const inScope = (b: string) =>
    !b || session.scope === "전체" || session.branches.includes(b);

  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    const 지점들: string[] = Array.isArray(body.지점들) ? body.지점들.map(String) : [];
    if (지점들.some((b) => !inScope(b))) {
      return NextResponse.json({ error: "담당 지점에만 걸 수 있습니다." }, { status: 403 });
    }

    if (action === "add") {
      if (!mine.create) {
        return NextResponse.json({ error: "상품을 만들 권한이 없습니다." }, { status: 403 });
      }
      const kind = String(body.상품분류 ?? "");
      if (!KINDS.includes(kind as any)) {
        return NextResponse.json({ error: "쓸 수 없는 갈래입니다." }, { status: 400 });
      }
      const code = await createProduct(
        {
          상품명: String(body.상품명 ?? ""),
          상품분류: kind,
          결제개월: String(body.결제개월 ?? ""),
          서비스개월: String(body.서비스개월 ?? ""),
          결제횟수: String(body.결제횟수 ?? ""),
          서비스횟수: String(body.서비스횟수 ?? ""),
          현금가: String(body.현금가 ?? ""),
          카드가: String(body.카드가 ?? ""),
          서비스상품: Boolean(body.서비스상품),
          옵션상품: Boolean(body.옵션상품),
          판매중: body.판매중 !== false,
          지점들,
        },
        session.staffId
      );
      return NextResponse.json({ ok: true, code });
    }

    const code = String(body.상품코드 ?? "");
    if (!code) return NextResponse.json({ error: "상품을 고르지 않았습니다." }, { status: 400 });

    if (action === "edit") {
      if (!mine.update) {
        return NextResponse.json({ error: "상품을 고칠 권한이 없습니다." }, { status: 403 });
      }
      const c = body.changes ?? {};
      if ("상품분류" in c && !KINDS.includes(String(c.상품분류) as any)) {
        return NextResponse.json({ error: "쓸 수 없는 갈래입니다." }, { status: 400 });
      }
      await patchProduct(code, c, session.staffId);
      if (Array.isArray(body.지점들)) await setBranches(code, 지점들, session.staffId);
      return NextResponse.json({ ok: true });
    }

    if (action === "del") {
      if (!mine.remove) {
        return NextResponse.json({ error: "상품을 지울 권한이 없습니다." }, { status: 403 });
      }
      await softDeleteProduct(code, session.staffId);
      return NextResponse.json({ ok: true });
    }

    /* 회원 화면의 이용권 창에서 갈래만 바꿀 때 */
    if (action === "kind" || body.상품분류) {
      if (!ab.get("회원")?.update) {
        return NextResponse.json({ error: "갈래를 바꿀 권한이 없습니다." }, { status: 403 });
      }
      const kind = String(body.상품분류 ?? "");
      if (!KINDS.includes(kind as any)) {
        return NextResponse.json({ error: "쓸 수 없는 갈래입니다." }, { status: 400 });
      }
      await patchProduct(code, { 상품분류: kind }, session.staffId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
