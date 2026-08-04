import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesForStaff } from "@/lib/menu";
import { getStaffAll, getStaffBranches } from "@/lib/data";
import {
  createLesson, setJoinState, patchLesson, softDeleteLesson, listLessons, completeLesson,
} from "@/lib/lessons";

export const dynamic = "force-dynamic";

/**
 * 수업 잡기 · 결과 찍기 · 고치기
 *
 * 결과 찍기(완료·노쇼)는 수업을 한 트레이너 본인이 한다.
 * 그래서 "등록" 권한이 아니라 "보기" 권한으로 열어두되, 남의 수업은 막는다.
 * 남의 수업까지 손대려면 "수정" 권한이 있어야 한다 — 점장·대표 몫이다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = await req.json();
    const action = body.action as string;
    const ab = await abilitiesForStaff(session);
    const mine = ab.get("PT·수업");
    if (!mine?.view) {
      return NextResponse.json({ error: "PT·수업을 쓸 수 없는 계정입니다." }, { status: 403 });
    }

    /** 이 수업에 손댈 수 있는가 — 내 수업이거나, 남의 것도 고칠 권한이 있거나 */
    async function allowed(lessonId: string): Promise<string> {
      const { lessons } = await listLessons();
      const l = lessons.find((x) => x.id === lessonId);
      if (!l) return "해당 수업을 찾지 못했습니다.";
      if (l.트레이너사번 === session.staffId) return "";
      if (!mine.update) return "다른 트레이너의 수업은 고칠 수 없습니다.";
      if (session.scope !== "전체" && !session.branches.includes(l.지점코드)) {
        return "담당 지점 수업만 고칠 수 있습니다.";
      }
      return "";
    }

    if (action === "create") {
      if (!mine.create) {
        return NextResponse.json({ error: "수업을 잡을 권한이 없습니다." }, { status: 403 });
      }
      /*
        남의 수업을 "잡아주는" 것은 막지 않는다 — 데스크에서 대신 잡아주는 일은 정상 업무다.
        막는 것은 남의 수업 "결과를 찍는" 쪽이다 (mark · patch). 그건 기록을 덮어쓰는 일이다.
        대신 담당 지점 밖 사람을 넣는 것은 막는다. 화면이 보내는 값을 그대로 믿지 않는다.
      */
      const trainer = body.트레이너사번 || session.staffId;
      if (trainer !== session.staffId) {
        const [staff, branchMap] = await Promise.all([getStaffAll(), getStaffBranches()]);
        const target = staff.find((s) => s.id === trainer && s.active);
        if (!target) {
          return NextResponse.json({ error: "없는 직원입니다." }, { status: 400 });
        }
        const where = [...(branchMap.get(trainer) ?? []), target.mainBranch].filter(Boolean);
        if (session.scope !== "전체" && !where.some((b) => session.branches.includes(b))) {
          return NextResponse.json({ error: "담당 지점 직원에게만 수업을 잡아줄 수 있습니다." }, { status: 403 });
        }
      }
      const id = await createLesson(
        {
          지점코드: body.지점코드 ?? session.currentBranch,
          수업구분: body.수업구분,
          상품코드: body.상품코드 ?? "",
          트레이너사번: trainer,
          날짜: body.날짜,
          시작시각: body.시작시각 ?? "",
          종료시각: body.종료시각 ?? "",
          정원: Number(body.정원) || 1,
          메모: body.메모 ?? "",
          members: Array.isArray(body.members) ? body.members : [],
        },
        session.staffId
      );
      return NextResponse.json({ ok: true, id });
    }

    if (action === "mark") {
      const { 수업번호, 참석번호, 상태 } = body;
      if (!참석번호 || !상태) {
        return NextResponse.json({ error: "참석과 상태가 필요합니다." }, { status: 400 });
      }
      const no = await allowed(수업번호);
      if (no) return NextResponse.json({ error: no }, { status: 403 });
      await setJoinState(참석번호, 상태, session.staffId);
      return NextResponse.json({ ok: true });
    }

    if (action === "complete") {
      const { 수업번호 } = body;
      if (!수업번호) return NextResponse.json({ error: "수업번호가 필요합니다." }, { status: 400 });
      const no = await allowed(수업번호);
      if (no) return NextResponse.json({ error: no }, { status: 403 });
      const n = await completeLesson(수업번호, session.staffId);
      return NextResponse.json({ ok: true, count: n });
    }

    if (action === "patch") {
      const { 수업번호, changes } = body;
      if (!수업번호) return NextResponse.json({ error: "수업번호가 필요합니다." }, { status: 400 });
      const no = await allowed(수업번호);
      if (no) return NextResponse.json({ error: no }, { status: 403 });
      await patchLesson(수업번호, changes ?? {}, session.staffId);
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      const { 수업번호 } = body;
      if (!수업번호) return NextResponse.json({ error: "수업번호가 필요합니다." }, { status: 400 });
      const no = await allowed(수업번호);
      if (no) return NextResponse.json({ error: no }, { status: 403 });
      if (!mine.remove && !mine.update) {
        return NextResponse.json({ error: "수업을 지울 권한이 없습니다." }, { status: 403 });
      }
      await softDeleteLesson(수업번호, session.staffId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "처리하지 못했습니다." }, { status: 500 });
  }
}
