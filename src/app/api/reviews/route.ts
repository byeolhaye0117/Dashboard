import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import {
  saveReply, softDeleteReply, countToday, listSettings, saveSetting,
  type ReviewSetting,
} from "@/lib/reviews";
import { collectPlace, writeReply, NoReplyApi, type Collected } from "@/lib/place";
import { ask } from "@/lib/ai";
import {
  buildReplyPrompt, parseReply, auditReply, replySafe, replyFacts, promptFacts,
} from "@/lib/replyCore";
import {
  modelId, modelWon, DAILY_LIMIT_DEFAULT, LIMIT_MIN, LIMIT_MAX, OWN_MAX,
} from "@/lib/reviewMeta";

export const dynamic = "force-dynamic";
/* AI 가 답을 쓰는 데도, 네이버에서 리뷰를 긁어오는 데도 시간이 걸린다 */
export const maxDuration = 120;


/**
 * 답글 재료를 플레이스 홈페이지와 똑같이 만든다
 *
 * 지시문을 한 파일로 합치고 나서도 답글이 원조와 달랐다. 이유는 재료였다 —
 * 같은 지시문에 다른 재료를 넣으면 다른 답글이 나온다. 대시보드는 메뉴 이름
 * 몇 줄만 넣고 있었고, 원조는 지하철·버스·블로그 후기·손님이 자주 쓰는 말·
 * 소식·운영 연차까지 넣고 있었다.
 *
 * 그래서 고르는 일을 여기서 하지 않는다. 긁어온 것을 그대로 저쪽 함수에 넘긴다.
 *
 * 다만 브라우저에만 있는 값 몇 개는 여기서 채울 수 없다 — 진단 화면에서
 * 손으로 체크하신 보유 시설, 1개월 이용권 가격, 「우리만 아는 사실」 칸,
 * 현재 소개글이 그것이다. 그 칸들은 그 화면의 브라우저에 저장되어 있어서
 * 대시보드가 볼 수 없다. 비워서 넘기면 저쪽 함수가 알아서 빼고 만든다.
 */
function 재료만들기(
  got: Collected,
  지점이름: string,
  keywords: string[],
  설정?: ReviewSetting
) {
  const 상호 = got.name || 지점이름;
  const o = {
    name: 상호, area: "천안", type: "헬스장", keywords, repkw: [], intro: "",
    /* 네이버가 모르는 것들. 리뷰 화면의 「우리 지점만 아는 것」에서 온다 */
    fac: 설정?.시설 ?? [],
    price: 설정?.가격 ?? "",
    edge: 설정?.차별점 ?? "",
  };
  const own = 설정?.우리만아는사실 ?? [];
  return {
    상호,
    사실: replyFacts(o, got.raw, own) as string[],
    머리글: promptFacts("reply", o, got.raw, { own }) as string,
  };
}

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
      if (Array.isArray(body.시설)) {
        patch.시설 = body.시설.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 20);
      }
      if (body.가격 !== undefined) patch.가격 = String(body.가격 ?? "").slice(0, 40);
      if (body.차별점 !== undefined) patch.차별점 = String(body.차별점 ?? "").slice(0, 200);
      if (body.우리만아는사실 !== undefined) {
        /* 줄 단위로 적는 칸이다. 두 글자 아래는 무슨 말인지 몰라 뺀다 —
           원본(ownFacts)이 그렇게 자른다 */
        patch.우리만아는사실 = String(body.우리만아는사실 ?? "")
          .split(/\n+/)
          .map((x: string) => x.replace(/^\s*[-·*+]\s*/, "").trim())
          .filter((x: string) => x.length >= 2)
          .slice(0, OWN_MAX);
      }
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
      const bs = await getBranches();
      const 재료 = 재료만들기(
        got, bs.find((b) => b.code === branch)?.name ?? branch, setting?.키워드 ?? [], setting
      );
      return NextResponse.json({
        ok: true,
        placeId: got.placeId,
        /* 답글 첫 문장이 「안녕하세요 OOO입니다.」다. 그 OOO 는 우리끼리 부르는
           「쌍용점」이 아니라 네이버에 걸린 상호여야 한다. 여기서 같이 넘겨
           화면이 들고 있다가 답글 만들 때 되돌려준다 — 그때 또 긁으면 느리다. */
        상호: 재료.상호,
        openReviews: got.openReviews,
        facts: 재료.사실,
        /* 지시문 맨 앞에 붙는 가게 소개. 화면이 들고 있다가 되돌려준다 */
        머리글: 재료.머리글,
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
    /* 인사말에 들어갈 이름이다. 「쌍용점」보다 네이버에 걸린 진짜 상호가 낫고,
       그건 재료를 긁어올 때 같이 온다 — 아래에서 오면 그걸로 바꾼다. */
    let branchName = branches.find((b) => b.code === branch)?.name ?? branch;
    /* 「불러오기」를 눌렀다면 화면이 진짜 상호를 들고 있다. 그게 인사말이 된다 */
    const 상호 = String(body.상호 ?? "").trim();
    if (상호) branchName = 상호;

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
      /* 스물여덟 개까지다 — 원본이 그렇게 자른다. 여기서 열두 개로 줄여 놨더니
         지하철·버스·연차가 잘려 나가 같은 지시문인데 답글이 얇아졌다 */
      ? body.사실.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 28)
      : [];
    const landmarks: string[] = Array.isArray(body.근처)
      ? body.근처.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 4)
      : [];
    let head = String(body.머리글 ?? "").trim();

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
        const 재료 = 재료만들기(got, branchName, keywords, setting);
        facts.push(...재료.사실);
        landmarks.push(...got.landmarks);
        head = 재료.머리글;
        branchName = 재료.상호;
      } catch {
        /* 못 가져와도 답글은 만든다. 대신 지시문이 「사실이 없다」 쪽으로 간다 */
      }
    }

    /*
     * 답글은 진단 서버가 쓴다. 닿지 못하면 같은 견본으로 여기서 쓴다
     *
     * 답글의 결을 정하는 자리는 진단 서버 하나다 — 거기 reply-core.js 가
     * 사장님 말투와 답글 견본을 갖고 있다. 다만 그 서버가 자고 있거나 아직
     * 새 코드를 못 받았다고 해서 답글을 아예 못 만들면 안 된다. 실제로
     * 그것 때문에 하루를 못 쓰셨다.
     *
     * 그래서 같은 견본의 사본을 여기에도 두고, 닿지 못할 때만 쓴다.
     * 사본으로 쓴 것은 그 사실을 화면에 알린다 — 어긋났을 때 조용히
     * 넘어가지 않으려는 것이다.
     */
    let 답글 = "";
    let 주제: string[] = [];
    let 점검: any[] = [];
    let 통과 = 0;
    let 전체 = 0;
    let 사본 = false;

    try {
      const w = await writeReply({
        review, star: stars, length, tone, keywords, closing: ending,
        facts, landmarks, name: branchName, area: "천안", head,
        /* 늘 싼 쪽으로 쓴다 — 고르는 칸을 없앴다 */
        tier: "fast",
        placeId: (setting?.플레이스ID ?? "").trim(),
      });
      답글 = w.답글;
      주제 = w.주제.slice(0, 6);
      점검 = w.점검;
      통과 = w.통과;
      전체 = w.전체;
    } catch (e: any) {
      /* 열쇠가 틀렸거나 AI 가 거절한 것은 진짜 오류다 — 조용히 다른 길로 새지 않는다 */
      if (!(e instanceof NoReplyApi)) throw e;

      사본 = true;
      const prompt = buildReplyPrompt({
        name: branchName, area: "천안", review, star: stars,
        length, keywords, facts, landmarks, closing: ending, head,
      });
      /* 지시문이 「답글 하나만, 머리말 없이」라고 시킨다 — JSON 을 강요하면
         문단 나눔과 이모지 자리가 흐트러진다. 그래서 앞글자를 박지 않는다. */
      const out = await ask({ model: modelId(), system: "", user: prompt, maxTokens: 2000 });
      const parsed = parseReply(out.text);
      답글 = replySafe(String(parsed?.답글 ?? "").trim());
      주제 = Array.isArray(parsed?.주제)
        ? parsed.주제.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 6)
        : [];
      if (답글) {
        점검 = auditReply(답글, review, { name: branchName, keywords }, stars);
        통과 = 점검.filter((r: any) => r.ok).length;
        전체 = 점검.length;
      }
    }

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
      사본,
      등록일시: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "답글을 만들지 못했습니다." }, { status: 500 });
  }
}
