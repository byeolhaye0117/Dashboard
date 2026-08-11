import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import {
  createNotice, patchNotice, softDeleteNotice, markRead,
  createTask, createTasks, batchTasks, copyTasks,
  patchTask, softDeleteTask, setTaskDone, clearReads,
} from "@/lib/notices";

export const dynamic = "force-dynamic";

/**
 * 공지 · 업무
 *
 * 읽음 남기기와 업무 체크는 "보기" 권한이면 된다 — 직원이 제 손으로 하는 일이다.
 * 공지를 올리고 업무를 정하는 것은 "등록 · 수정" 권한이 있어야 한다.
 */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = await req.json();
    const action = body.action as string;
    const ab = await abilitiesFor(session.roleCode);
    const mine = ab.get("공지");
    if (!mine?.view) {
      return NextResponse.json({ error: "공지·업무를 쓸 수 없는 계정입니다." }, { status: 403 });
    }

    /** 담당 지점 안인가 — 화면이 보낸 지점을 그대로 믿지 않는다 */
    const inScope = (branch: string) =>
      !branch || session.scope === "전체" || session.branches.includes(branch);

    if (action === "read") {
      if (!body.공지번호) return NextResponse.json({ error: "공지번호가 필요합니다." }, { status: 400 });
      await markRead(String(body.공지번호), session.staffId);
      return NextResponse.json({ ok: true });
    }

    if (action === "check") {
      const { 업무번호, 날짜, done } = body;
      if (!업무번호 || !날짜) {
        return NextResponse.json({ error: "업무와 날짜가 필요합니다." }, { status: 400 });
      }
      await setTaskDone(String(업무번호), String(날짜), Boolean(done), session.staffId);
      return NextResponse.json({ ok: true });
    }

    if (action === "notice-add") {
      if (!mine.create) {
        return NextResponse.json({ error: "공지를 올릴 권한이 없습니다." }, { status: 403 });
      }
      if (!inScope(body.지점코드)) {
        return NextResponse.json({ error: "담당 지점에만 올릴 수 있습니다." }, { status: 403 });
      }
      const id = await createNotice(
        {
          지점코드: String(body.지점코드 ?? ""),
          제목: String(body.제목 ?? ""),
          내용: String(body.내용 ?? ""),
          중요: Boolean(body.중요),
          마감일: String(body.마감일 ?? ""),
        },
        session.staffId
      );
      return NextResponse.json({ ok: true, id });
    }

    if (action === "notice-edit" || action === "notice-del") {
      if (!mine.update) {
        return NextResponse.json({ error: "공지를 고칠 권한이 없습니다." }, { status: 403 });
      }
      if (!body.공지번호) return NextResponse.json({ error: "공지번호가 필요합니다." }, { status: 400 });
      if (action === "notice-del") {
        await softDeleteNotice(String(body.공지번호), session.staffId);
        return NextResponse.json({ ok: true });
      }
      await patchNotice(String(body.공지번호), body.changes ?? {}, session.staffId);
      // 크게 고쳤을 때만 다시 읽게 한다. 오타 하나에 전원을 다시 읽게 할 수는 없다
      if (body.다시읽기) await clearReads(String(body.공지번호));
      return NextResponse.json({ ok: true });
    }

    if (action === "task-add") {
      if (!mine.create) {
        return NextResponse.json({ error: "업무를 정할 권한이 없습니다." }, { status: 403 });
      }
      if (!inScope(body.지점코드)) {
        return NextResponse.json({ error: "담당 지점 업무만 정할 수 있습니다." }, { status: 403 });
      }
      const id = await createTask(
        {
          지점코드: String(body.지점코드 ?? ""),
          업무명: String(body.업무명 ?? ""),
          담당사번: String(body.담당사번 ?? ""),
          우선순위: Number(body.우선순위) || 0,
          순서: Number(body.순서) || 99,
          메모: String(body.메모 ?? ""),
        },
        session.staffId
      );
      return NextResponse.json({ ok: true, id });
    }

    if (action === "task-bulk") {
      if (!mine.create) {
        return NextResponse.json({ error: "업무를 배정할 권한이 없습니다." }, { status: 403 });
      }
      const 지점들: string[] = Array.isArray(body.지점들) ? body.지점들.map(String) : [];
      const bad = 지점들.find((b) => !inScope(b));
      if (bad) {
        return NextResponse.json({ error: "담당 지점에만 배정할 수 있습니다." }, { status: 403 });
      }
      const raw = Array.isArray(body.items) ? body.items : [];
      const n = await createTasks(
        지점들,
        raw.map((x: any) => ({
          업무명: String(x?.업무명 ?? ""),
          담당사번: String(x?.담당사번 ?? ""),
          우선순위: Number(x?.우선순위) || 0,
          메모: String(x?.메모 ?? ""),
          순서: Number(x?.순서) || 0,
        })),
        session.staffId
      );
      return NextResponse.json({ ok: true, count: n });
    }

    /*
      여러 개를 한 번에 — 지우기 · 담당 바꾸기 · 순위 옮기기 · 잠시 끄기.
      화면이 보낸 칸 이름을 그대로 믿지 않는다. 여기서 허용한 것만 시트로 간다.
    */
    if (action === "task-batch") {
      if (!mine.update) {
        return NextResponse.json({ error: "업무를 고칠 권한이 없습니다." }, { status: 403 });
      }
      const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
      const want = body.changes ?? {};
      const changes: Record<string, string> = {};

      if ("담당사번" in want) changes.담당사번 = String(want.담당사번 ?? "");
      if ("우선순위" in want) {
        const v = Number(want.우선순위);
        changes.우선순위 = v >= 1 && v <= 3 ? String(v) : "";
      }
      if ("사용여부" in want) changes.사용여부 = want.사용여부 === "N" ? "N" : "Y";
      if (want.삭제여부 === "Y") changes.삭제여부 = "Y";
      if ("지점코드" in want) {
        const b = String(want.지점코드 ?? "");
        if (!inScope(b)) {
          return NextResponse.json({ error: "담당 지점으로만 옮길 수 있습니다." }, { status: 403 });
        }
        changes.지점코드 = b;
      }

      const n = await batchTasks(ids, changes, session.staffId);
      return NextResponse.json({ ok: true, count: n });
    }

    if (action === "task-copy") {
      if (!mine.create) {
        return NextResponse.json({ error: "업무를 배정할 권한이 없습니다." }, { status: 403 });
      }
      const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
      const 지점들: string[] = Array.isArray(body.지점들) ? body.지점들.map(String) : [];
      if (지점들.some((b) => !inScope(b))) {
        return NextResponse.json({ error: "담당 지점에만 배정할 수 있습니다." }, { status: 403 });
      }
      const n = await copyTasks(ids, 지점들, session.staffId);
      return NextResponse.json({ ok: true, count: n });
    }

    if (action === "task-edit" || action === "task-del") {
      if (!mine.update) {
        return NextResponse.json({ error: "업무를 고칠 권한이 없습니다." }, { status: 403 });
      }
      if (!body.업무번호) return NextResponse.json({ error: "업무번호가 필요합니다." }, { status: 400 });
      if (action === "task-del") await softDeleteTask(String(body.업무번호), session.staffId);
      else await patchTask(String(body.업무번호), body.changes ?? {}, session.staffId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "처리하지 못했습니다." }, { status: 500 });
  }
}
