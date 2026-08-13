import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { scopeOf } from "@/lib/scope";
import { abilitiesFor } from "@/lib/menu";
import {
  holdTicket, resumeTicket, transferTicket,
  listTickets, listMembers, createMember,
} from "@/lib/members";

export const dynamic = "force-dynamic";

/**
 * 이용권 정지 · 재개 · 양도
 *
 * 셋 다 이용권 한 줄의 임자나 기간을 바꾸는 일이라 한자리에 둔다.
 * 어느 쪽이든 "그 이용권을 볼 수 있는 사람인가"를 먼저 확인한다 —
 * 화면이 보낸 이용권번호를 그대로 믿으면 남의 지점 것도 넘길 수 있게 된다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const reach = await scopeOf(session);

  const ab = (await abilitiesFor(session.roleCode)).get("회원");
  if (!ab?.update) {
    return NextResponse.json({ error: "이용권을 고칠 권한이 없습니다." }, { status: 403 });
  }

  try {
    const b = await req.json();
    const op = String(b.op ?? "");
    const id = String(b.이용권번호 ?? "");
    if (!id) return NextResponse.json({ error: "대상을 찾지 못했습니다." }, { status: 400 });

    const [tickets, { items }] = await Promise.all([listTickets(), listMembers()]);
    const target = tickets.find((t) => t.id === id);
    if (!target) return NextResponse.json({ error: "해당 이용권이 없습니다." }, { status: 404 });

    const owner = items.find((m) => m.id === target.회원번호);
    const canSee = (branch: string) =>
      reach.all || reach.codes.includes(branch);

    if (!canSee(owner?.지점코드 || target.지점코드)) {
      return NextResponse.json({ error: "이 이용권을 다룰 권한이 없습니다." }, { status: 403 });
    }

    if (op === "hold") {
      await holdTicket(
        id,
        String(b.정지시작일 ?? ""),
        String(b.정지종료예정일 ?? ""),
        session.staffId
      );
      return NextResponse.json({ ok: true });
    }

    if (op === "resume") {
      const r = await resumeTicket(id, session.staffId);
      return NextResponse.json({ ok: true, ...r });
    }

    if (op === "transfer") {
      /*
        받을 사람이 아직 회원이 아니면 그 자리에서 만든다. 가족·지인에게
        넘기는 경우가 대부분이라, 회원 등록부터 하고 오라고 하면 두 화면을
        오가게 된다.
      */
      let 받는회원번호 = String(b.받는회원번호 ?? "");

      if (!받는회원번호) {
        const 이름 = String(b.새회원?.이름 ?? "").trim();
        const 전화번호 = String(b.새회원?.전화번호 ?? "").trim();
        if (!이름) return NextResponse.json({ error: "받을 분 이름을 적어주세요." }, { status: 400 });

        // 새 회원은 지금 이용권이 있는 지점으로 넣는다
        const branch = owner?.지점코드 || target.지점코드;
        if (!canSee(branch)) {
          return NextResponse.json({ error: "담당 지점에만 만들 수 있습니다." }, { status: 403 });
        }
        받는회원번호 = await createMember(
          {
            이름, 전화번호, 지점코드: branch,
            가입일: String(b.양도일 ?? "") || undefined as any,
            메모: "이용권 양도로 등록",
            이용권: [],
            결제수단: "",
            결제금액: "",
          },
          session.staffId
        );
      } else {
        const 받는이 = items.find((m) => m.id === 받는회원번호);
        if (!받는이) return NextResponse.json({ error: "받을 회원이 없습니다." }, { status: 404 });
        if (!canSee(받는이.지점코드)) {
          return NextResponse.json({ error: "담당 지점 회원에게만 넘길 수 있습니다." }, { status: 403 });
        }
      }

      const r = await transferTicket(
        {
          이용권번호: id,
          받는회원번호,
          양도일: String(b.양도일 ?? ""),
          수수료: String(b.수수료 ?? ""),
          결제수단: String(b.결제수단 ?? ""),
          메모: String(b.메모 ?? ""),
        },
        session.staffId
      );
      return NextResponse.json({ ok: true, 받는회원번호, ...r });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "처리하지 못했습니다." }, { status: 500 });
  }
}
