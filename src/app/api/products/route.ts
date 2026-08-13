import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import {
  createProduct, patchProduct, setBranches, softDeleteProduct,
  batchProducts, setBranchesMany, reorderProducts, KINDS,
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

  /* 지점 범위도 권한처럼 그때그때 다시 잰다 (lib/scope.ts) */
  const reach = await scopeOf(session);
  const mine = ab.get("상품");
  if (!mine?.view) {
    return NextResponse.json({ error: "상품을 다룰 수 없는 계정입니다." }, { status: 403 });
  }

  /** 담당 지점 안인가 — 화면이 보낸 지점을 그대로 믿지 않는다 */
  const inScope = (b: string) =>
    !b || reach.all || reach.codes.includes(b);

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
        return NextResponse.json({ error: "쓸 수 없는 카테고리입니다." }, { status: 400 });
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

    /* 끌어 옮긴 차례 저장 */
    if (action === "order") {
      if (!mine.update) {
        return NextResponse.json({ error: "상품을 고칠 권한이 없습니다." }, { status: 403 });
      }
      const codes: string[] = Array.isArray(body.codes) ? body.codes.map(String) : [];
      const n = await reorderProducts(codes, session.staffId);
      return NextResponse.json({ ok: true, count: n });
    }

    /* 여러 개 한 번에 — 카테고리 · 판매 상태 · 파는 지점 */
    if (action === "batch") {
      if (!mine.update) {
        return NextResponse.json({ error: "상품을 고칠 권한이 없습니다." }, { status: 403 });
      }
      const codes: string[] = Array.isArray(body.codes) ? body.codes.map(String) : [];
      const want = body.changes ?? {};
      const changes: Record<string, string> = {};

      if ("상품분류" in want) {
        const k = String(want.상품분류 ?? "");
        if (!KINDS.includes(k as any)) {
          return NextResponse.json({ error: "쓸 수 없는 카테고리입니다." }, { status: 400 });
        }
        changes.상품분류 = k;
      }
      if ("판매상태" in want) {
        changes.판매상태 = want.판매상태 === "판매중지" ? "판매중지" : "판매중";
      }
      if ("서비스상품" in want) changes.서비스상품 = want.서비스상품 ? "Y" : "";
      if ("옵션상품" in want) changes.옵션상품 = want.옵션상품 ? "Y" : "";
      if (want.삭제여부 === "Y") {
        if (!mine.remove) {
          return NextResponse.json({ error: "상품을 지울 권한이 없습니다." }, { status: 403 });
        }
        changes.삭제여부 = "Y";
      }

      let n = 0;
      if (Object.keys(changes).length > 0) {
        n = await batchProducts(codes, changes, session.staffId);
      }
      if (Array.isArray(body.지점들)) {
        n = await setBranchesMany(codes, 지점들, session.staffId);
      }
      if (n === 0) return NextResponse.json({ error: "바꿀 내용이 없습니다." }, { status: 400 });
      return NextResponse.json({ ok: true, count: n });
    }

    const code = String(body.상품코드 ?? "");
    if (!code) return NextResponse.json({ error: "상품을 고르지 않았습니다." }, { status: 400 });

    if (action === "edit") {
      if (!mine.update) {
        return NextResponse.json({ error: "상품을 고칠 권한이 없습니다." }, { status: 403 });
      }
      const c = body.changes ?? {};
      if ("상품분류" in c && !KINDS.includes(String(c.상품분류) as any)) {
        return NextResponse.json({ error: "쓸 수 없는 카테고리입니다." }, { status: 400 });
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
        return NextResponse.json({ error: "카테고리를 바꿀 권한이 없습니다." }, { status: 403 });
      }
      const kind = String(body.상품분류 ?? "");
      if (!KINDS.includes(kind as any)) {
        return NextResponse.json({ error: "쓸 수 없는 카테고리입니다." }, { status: 400 });
      }
      await patchProduct(code, { 상품분류: kind }, session.staffId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
