import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import {
  patchTicketService, listTicketServices, listTickets, listMembers,
} from "@/lib/members";

export const dynamic = "force-dynamic";

/**
 * 이용권에 얹은 서비스 한 줄 고치기
 *
 * 회원권과 같이 결제한 무료 서비스는 제 이용권 줄이 없다. 회원권에 매달린
 * 한 줄로만 남아서, 지금까지는 고칠 길도 지울 길도 시트를 여는 것뿐이었다.
 *
 * 권한은 이용권과 같은 규칙을 본다 — 얹은 서비스는 그 이용권의 일부다.
 * 줄 번호는 화면이 보내오지만 그것만 믿지 않는다. 그 줄이 어느 이용권에
 * 붙어 있고 그 회원이 어느 지점인지 서버가 다시 확인한다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.update) {
    return NextResponse.json({ error: "얹은 서비스를 고칠 권한이 없습니다." }, { status: 403 });
  }

  try {
    const { 줄, 추가금액, remove } = await req.json();
    const line = Number(줄);
    if (!line) return NextResponse.json({ error: "대상을 찾지 못했습니다." }, { status: 400 });

    const [extras, tickets, { items }] = await Promise.all([
      listTicketServices(),
      listTickets(),
      listMembers(),
    ]);

    const target = extras.find((x) => x.줄 === line);
    if (!target) {
      return NextResponse.json({ error: "해당 서비스를 찾지 못했습니다." }, { status: 404 });
    }

    const host = tickets.find((t) => t.id === target.이용권번호);
    if (!host) {
      return NextResponse.json(
        { error: "이 서비스가 얹힌 이용권을 찾지 못했습니다." },
        { status: 404 }
      );
    }

    const owner = items.find((m) => m.id === host.회원번호);
    const branch = owner?.지점코드 || host.지점코드;
    if (!reach.all && !reach.codes.includes(branch)) {
      return NextResponse.json({ error: "이 서비스를 고칠 권한이 없습니다." }, { status: 403 });
    }

    if (remove) {
      /* 지우는 것은 고치기보다 무겁다 — 권한을 따로 본다 */
      if (!ab.remove) {
        return NextResponse.json({ error: "얹은 서비스를 지울 권한이 없습니다." }, { status: 403 });
      }
      await patchTicketService(line, { 지움: true }, session.staffId);
      return NextResponse.json({ ok: true, 회원번호: host.회원번호 });
    }

    await patchTicketService(
      line,
      { 추가금액: String(추가금액 ?? "") },
      session.staffId
    );
    return NextResponse.json({ ok: true, 회원번호: host.회원번호 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
