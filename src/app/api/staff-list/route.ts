import { NextResponse } from "next/server";
import { getLoginStaffList } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * 로그인 화면의 직원 목록.
 *
 * 사번 · 이름 · 직급만 내보낸다.
 * 비밀번호와 연락처는 절대 여기에 담지 않는다.
 */
export async function GET(req: Request) {
  const branch = new URL(req.url).searchParams.get("branch");
  if (!branch) return NextResponse.json({ error: "지점을 선택해주세요." }, { status: 400 });
  try {
    return NextResponse.json(await getLoginStaffList(branch));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "직원 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
