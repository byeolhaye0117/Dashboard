import { NextResponse } from "next/server";
import { patchStaff } from "@/lib/staffAdmin";
import { guard, blockOwnerEscalation, keepOneOwner } from "@/lib/staffGuard";

export const dynamic = "force-dynamic";

/**
 * 여러 명을 한 번에 바꾸기
 *
 * 한 명씩 여는 것과 똑같은 안전장치를 사람마다 다시 건다.
 * "여럿을 한 번에"는 편하자고 만든 것이지 규칙을 건너뛰자고 만든 것이 아니다.
 *
 * 직급은 일부러 뺐다. 여러 명의 직급을 한 번에 올리는 것은 되돌리기 어렵고,
 * 실수 한 번에 권한이 통째로 바뀐다. 직급은 한 명씩 연다.
 *
 * 한 명이 막혀도 나머지는 그대로 진행하고, 누가 왜 안 됐는지 돌려준다.
 * 전부 되돌리면 어디까지 됐는지 알 수 없고, 조용히 넘어가면 안 바뀐 줄 모른다.
 */
export async function POST(req: Request) {
  const g = await guard("update");
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const b = await req.json();
    const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String) : [];
    const c = b.changes ?? {};
    if (ids.length === 0) {
      return NextResponse.json({ error: "바꿀 직원을 고르지 않았습니다." }, { status: 400 });
    }

    const accountOn = c.계정사용 === undefined ? undefined : Boolean(c.계정사용);
    const status = c.재직상태 === undefined ? undefined : String(c.재직상태);
    const turningOff = accountOn === false || (status !== undefined && status !== "재직중");

    const done: string[] = [];
    const failed: { name: string; why: string }[] = [];

    for (const id of ids) {
      const target = g.staff.find((s) => s.id === id);
      if (!target) {
        failed.push({ name: id, why: "없는 직원입니다." });
        continue;
      }

      const why =
        blockOwnerEscalation(g.session, target) ??
        // 자기 계정을 스스로 끄면 갇힌다
        (id === g.session.staffId && turningOff
          ? "본인 계정은 끌 수 없습니다."
          : null) ??
        // 들어올 수 있는 대표가 한 명도 없게 되는 변경
        (target.roleCode === "R1" && turningOff ? keepOneOwner(g.staff, id) : null);

      if (why) {
        failed.push({ name: target.name, why });
        continue;
      }

      try {
        await patchStaff(
          id,
          {
            재직상태: status,
            계정사용: accountOn,
            주소속지점: c.주소속지점 === undefined ? undefined : String(c.주소속지점),
            담당지점: Array.isArray(c.담당지점) ? c.담당지점.map(String) : undefined,
            출근기준시각: c.출근기준시각 === undefined ? undefined : String(c.출근기준시각),
            퇴근기준시각: c.퇴근기준시각 === undefined ? undefined : String(c.퇴근기준시각),
            휴게분: c.휴게분 === undefined ? undefined : String(c.휴게분),
            휴게변동: c.휴게변동 === undefined ? undefined : Boolean(c.휴게변동),
            근무요일: c.근무요일 === undefined ? undefined : String(c.근무요일),
            트레이너: c.트레이너 === undefined ? undefined : Boolean(c.트레이너),
            그룹수업시간: c.그룹수업시간 === undefined ? undefined : String(c.그룹수업시간),
          },
          g.session.staffId
        );
        done.push(target.name);
      } catch (e: any) {
        failed.push({ name: target.name, why: e.message ?? "저장하지 못했습니다." });
      }
    }

    return NextResponse.json({ ok: true, done, failed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "저장하지 못했습니다." }, { status: 500 });
  }
}
