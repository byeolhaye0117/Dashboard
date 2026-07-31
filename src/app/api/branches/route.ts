import { NextResponse } from "next/server";
import { getBranches } from "@/lib/data";

export const dynamic = "force-dynamic";

/** 로그인 화면의 지점 목록 */
export async function GET() {
  try {
    const branches = await getBranches();
    return NextResponse.json(branches.map((b) => ({ code: b.code, name: b.name })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "지점 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
