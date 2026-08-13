import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 지금 서버에 올라와 있는 판 번호
 *
 * 휴대폰 브라우저는 화면을 오래 물고 있는다. 새로 배포해도 며칠 전 화면을
 * 그대로 쓰고 있으면서, 쓰는 분은 「고쳐준다더니 안 바뀌었다」고 여기게 된다.
 * 화면이 스스로 물어보고 다르면 알려줄 수 있게, 판 번호만 내준다.
 */
export async function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD ?? "" },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
