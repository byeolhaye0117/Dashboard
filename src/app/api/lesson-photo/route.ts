import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesForStaff } from "@/lib/menu";
import { uploadPhoto, readPhoto } from "@/lib/photos";

export const dynamic = "force-dynamic";

/** 사진 한 장 크기 제한 — 휴대폰 사진 한 장이면 넉넉하다 */
const MAX = 8 * 1024 * 1024;

/**
 * 수업 후 사진 올리기
 *
 * 드라이브에 올리고 파일 번호만 돌려준다. 시트에는 이 번호만 적힌다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesForStaff(session);
  if (!ab.get("PT·수업")?.create) {
    return NextResponse.json({ error: "수업을 보고할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "사진을 고르지 않았습니다." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "사진 파일만 올릴 수 있습니다." }, { status: 400 });
    }
    if (file.size > MAX) {
      return NextResponse.json(
        { error: "사진이 너무 큽니다. 8MB 아래로 줄여주세요." },
        { status: 400 }
      );
    }

    // 파일 이름만 봐도 언제 누가 올린 것인지 알 수 있게 한다
    const stamp = String(form.get("날짜") ?? "").slice(0, 10) || "날짜없음";
    const name = `${stamp}_${session.staffId}_${session.name}.jpg`;
    const id = await uploadPhoto(name, file.type, await file.arrayBuffer());
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "사진을 올리지 못했습니다." }, { status: 500 });
  }
}

/**
 * 사진 보여주기
 *
 * 드라이브를 공개로 열지 않고 대시보드가 대신 받아서 내보낸다.
 * 회원이 찍힌 사진이 주소만 알면 누구나 보이는 상태가 되면 안 된다.
 */
export async function GET(req: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("로그인이 필요합니다.", { status: 401 });

  const ab = await abilitiesForStaff(session);
  if (!ab.get("PT·수업")?.view) return new NextResponse("권한이 없습니다.", { status: 403 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return new NextResponse("사진 주소가 없습니다.", { status: 400 });

  try {
    const { body, mime } = await readPhoto(id);
    return new NextResponse(body, {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
    });
  } catch (e: any) {
    return new NextResponse(e.message ?? "사진을 읽지 못했습니다.", { status: 404 });
  }
}
