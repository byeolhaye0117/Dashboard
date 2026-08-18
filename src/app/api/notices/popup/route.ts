import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import { loadAll } from "@/lib/notices";
import { today } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * 아직 안 읽은 공지 — 화면을 열 때 팝업으로 띄울 것들
 *
 * ── 왜 따로 부르는가 ────────────────────────────────────────
 * 공지 화면에 들어가야만 보이면, 안 들어가는 사람은 평생 못 본다. 공지는
 * 「가서 보는 것」이 아니라 「와서 알려주는 것」이라야 한다.
 *
 * 화면을 그리고 난 뒤에 따로 부른다. 이 값을 기다리느라 회원 화면이 늦게
 * 뜨면, 공지 하나 때문에 매일 쓰는 화면이 느려진다.
 *
 * 실패하면 조용히 빈 손으로 답한다. 공지를 못 읽어 온 것 때문에 화면에
 * 붉은 글씨가 뜨면, 정작 봐야 할 일을 못 하게 된다.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ items: [] });

  try {
    const ab = await abilitiesFor(session.roleCode);
    if (!ab.get("공지")?.view) return NextResponse.json({ items: [] });

    const reach = await scopeOf(session);
    const { notices, reads } = await loadAll();
    const now = today();

    /* 이 사람이 이미 확인한 공지 */
    const 읽음 = new Set(
      reads.filter((r) => r.사번 === session.staffId).map((r) => r.공지번호)
    );

    const items = notices
      .filter((n) => !읽음.has(n.id))
      /* 지점을 안 적은 공지는 전 지점 공지다 */
      .filter((n) => !n.지점코드 || reach.all || reach.codes.includes(n.지점코드))
      /* 아직 게시일이 안 된 것은 예약해 둔 것이다 */
      .filter((n) => !n.게시일 || n.게시일 <= now)
      /* 마감일이 지난 것은 이미 끝난 얘기다 */
      .filter((n) => !n.마감일 || n.마감일 >= now)
      /* 중요한 것부터, 그 다음은 오래된 것부터 — 밀린 순서대로 읽는다 */
      .sort(
        (a, b) =>
          Number(b.중요) - Number(a.중요) ||
          (a.게시일 + a.id).localeCompare(b.게시일 + b.id)
      )
      .map((n) => ({
        id: n.id,
        제목: n.제목,
        내용: n.내용,
        중요: n.중요,
        게시일: n.게시일,
        마감일: n.마감일,
      }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
