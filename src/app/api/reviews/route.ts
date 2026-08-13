import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import { saveReply, softDeleteReply, countToday, listSettings, saveSetting } from "@/lib/reviews";
import { collectPlace, writeReply } from "@/lib/place";
import {
  modelWon, DAILY_LIMIT_DEFAULT, LIMIT_MIN, LIMIT_MAX,
} from "@/lib/reviewMeta";

export const dynamic = "force-dynamic";
/* AI 가 답을 쓰는 데도, 네이버에서 리뷰를 긁어오는 데도 시간이 걸린다 */
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ab = await abilitiesFor(session.roleCode);
  const mine = ab.get("리뷰");
  if (!mine?.view) {
    return NextResponse.json({ error: "리뷰 답글을 쓸 수 없는 계정입니다." }, { status: 403 });
  }

  /* 화면이 보낸 지점을 그대로 믿지 않는다 */
  const inScope = (b: string) => session.scope === "전체" || session.branches.includes(b);

  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "del") {
      if (!mine.remove) {
        return NextResponse.json({ error: "답글을 지울 권한이 없습니다." }, { status: 403 });
      }
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "지울 답글을 고르지 않았습니다." }, { status: 400 });
      await softDeleteReply(id, session.staffId);
      return NextResponse.json({ ok: true });
    }

    const branch = String(body.지점코드 ?? "");

    /* ── 지점 설정 저장 — 플레이스 주소 · 키워드 · 끝인사 ── */
    if (action === "settings") {
      if (!mine.update && !mine.create) {
        return NextResponse.json({ error: "설정을 바꿀 권한이 없습니다." }, { status: 403 });
      }
      if (!branch || !inScope(branch)) {
        return NextResponse.json({ error: "담당 지점만 고칠 수 있습니다." }, { status: 403 });
      }
      const patch: any = {};
      if (body.플레이스ID !== undefined) patch.플레이스ID = String(body.플레이스ID ?? "");
      if (Array.isArray(body.키워드)) {
        patch.키워드 = body.키워드.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 5);
      }
      if (body.끝인사 !== undefined) patch.끝인사 = String(body.끝인사 ?? "");
      if (body.하루한도 !== undefined) {
        const n = Math.floor(Number(body.하루한도));
        if (!Number.isFinite(n) || n < LIMIT_MIN || n > LIMIT_MAX) {
          return NextResponse.json(
            { error: `하루 한도는 ${LIMIT_MIN}에서 ${LIMIT_MAX} 사이로 넣어주세요.` },
            { status: 400 }
          );
        }
        patch.하루한도 = n;
      }
      await saveSetting(branch, patch, session.staffId);
      return NextResponse.json({ ok: true });
    }

    /* ── 밀린 리뷰 불러오기 ── */
    if (action === "collect") {
      if (!branch || !inScope(branch)) {
        return NextResponse.json({ error: "담당 지점만 볼 수 있습니다." }, { status: 403 });
      }
      const setting = (await listSettings()).find((s) => s.지점코드 === branch);
      const placeId = (setting?.플레이스ID ?? "").trim();
      if (!placeId) {
        return NextResponse.json(
          { error: "이 지점의 플레이스 주소가 아직 없습니다. 위 칸에 넣고 저장해주세요." },
          { status: 400 }
        );
      }
      const got = await collectPlace(placeId);
      return NextResponse.json({
        ok: true,
        placeId: got.placeId,
        openReviews: got.openReviews,
        facts: got.facts,
        landmarks: got.landmarks,
        feeds: got.feeds,
      });
    }

    if (action !== "write") {
      return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
    }

    /* ── 답글 만들기 ── */
    if (!mine.create) {
      return NextResponse.json({ error: "답글을 만들 권한이 없습니다." }, { status: 403 });
    }
    if (!branch) return NextResponse.json({ error: "지점을 고르지 않았습니다." }, { status: 400 });
    if (!inScope(branch)) {
      return NextResponse.json({ error: "담당 지점에만 쓸 수 있습니다." }, { status: 403 });
    }

    const review = String(body.리뷰내용 ?? "").trim();
    if (!review) return NextResponse.json({ error: "리뷰 내용을 붙여넣어 주세요." }, { status: 400 });
    if (review.length > 3000) {
      return NextResponse.json({ error: "리뷰가 너무 깁니다. 3000자 아래로 줄여주세요." }, { status: 400 });
    }

    /* 하루 한도 — 실수로 눌러대도 요금이 튀지 않게.
       지점에서 직접 정한 값이 먼저고, 안 정했으면 환경변수, 그것도 없으면 기본값이다. */
    const setting = (await listSettings()).find((s) => s.지점코드 === branch);
    const limit =
      setting?.하루한도 || Number(process.env.REVIEW_DAILY_LIMIT) || DAILY_LIMIT_DEFAULT;
    const used = await countToday(branch);
    if (used >= limit) {
      return NextResponse.json(
        { error: `오늘 만들 수 있는 답글(${limit}개)을 다 썼습니다. 내일 다시 눌러주세요.` },
        { status: 429 }
      );
    }

    const branches = await getBranches();
    const branchName = branches.find((b) => b.code === branch)?.name ?? branch;

    const stars = Number(body.별점) || 0;
    const length = String(body.길이 ?? "중간");
    const tone = String(body.말투 ?? "정중");
    const ending = String(body.끝인사 ?? "").trim();
    const keywords: string[] = Array.isArray(body.키워드)
      ? body.키워드.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 5)
      : [];
    /* 수집한 사실은 화면이 들고 있다가 같이 보낸다 — 답글 하나 만들 때마다
       네이버를 다시 긁으면 느리고, 긁는 쪽이 막힐 이유만 늘어난다 */
    const facts: string[] = Array.isArray(body.사실)
      ? body.사실.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 12)
      : [];
    const landmarks: string[] = Array.isArray(body.근처)
      ? body.근처.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 4)
      : [];

    /*
     * 재료 없이 쓰면 지어낸다
     *
     * 화면에서 「불러오기」를 안 누르고 리뷰만 붙여넣으면 사실이 하나도 안 온다.
     * 그러면 AI 가 빈손으로 쓰려다 「6개월 회원권」 같은 없는 말을 만들어낸다.
     * 실제로 그렇게 나왔다. 비어 있으면 여기서 한 번 긁어와 채운다.
     */
    if (facts.length === 0 && (setting?.플레이스ID ?? "").trim()) {
      try {
        const got = await collectPlace(setting!.플레이스ID);
        facts.push(...got.facts);
        landmarks.push(...got.landmarks);
      } catch {
        /* 못 가져와도 답글은 만든다. 대신 지시문이 「사실이 없다」 쪽으로 간다 */
      }
    }

    /*
     * 답글은 진단 서버가 쓴다 — 여기서는 쓰지 않는다
     *
     * 한때 대시보드에도 지시문을 한 벌 두고, 서버가 자고 있으면 그것으로
     * 대신 쓰게 했다. 그러다 두 벌이 어긋났다. 서버 쪽에는 사장님이 다신
     * 실제 답글 견본이 있는데 여기엔 내가 쓴 규칙만 있었고, 그래서 여기서
     * 나온 답글이 눈에 띄게 못했다.
     *
     * 답글의 결을 정하는 자리는 하나여야 한다. 서버가 안 되면 안 된다고
     * 말하고 멈춘다 — 못한 답글을 조용히 내놓는 것보다 낫다.
     */
    const w = await writeReply({
      review, star: stars, length, tone, keywords, closing: ending,
      facts, landmarks, name: branchName, area: "천안",
      /* 늘 싼 쪽으로 쓴다 — 고르는 칸을 없앴다 */
      tier: "fast",
      placeId: (setting?.플레이스ID ?? "").trim(),
    });
    const 답글 = w.답글;
    const 주제 = w.주제.slice(0, 6);
    const 점검 = w.점검;
    const 통과 = w.통과;
    const 전체 = w.전체;

    if (!답글) {
      return NextResponse.json({ error: "AI 가 답글을 만들지 못했습니다. 다시 눌러주세요." }, { status: 502 });
    }

    const id = await saveReply(
      {
        지점코드: branch, 별점: stars, 리뷰내용: review, 주제, 답글,
        키워드: keywords, 말투: tone, 길이: length, 끝인사: ending, 모델: "기본",
      },
      session.staffId
    );

    /* 이번에 실제로 쓴 키워드·끝인사를 그 지점의 기본값으로 남긴다.
       화면에서 누를 때마다 저장하면 쓰기가 겹쳐 서로 덮어쓴다 — 정해진 순간은 지금이다.
       실패해도 답글은 이미 만들어졌으므로 그것 때문에 오류를 내지 않는다. */
    try {
      await saveSetting(branch, { 키워드: keywords, 끝인사: ending }, session.staffId);
    } catch {
      /* 설정 저장은 곁다리다 */
    }

    return NextResponse.json({
      ok: true,
      id,
      주제,
      답글,
      used: used + 1,
      limit,
      /* 얼마짜리 단추를 눌렀는지 — 어림값이다 */
      원: modelWon(),
      점검,
      통과,
      전체,
      등록일시: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "답글을 만들지 못했습니다." }, { status: 500 });
  }
}
