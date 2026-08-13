import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import { ask, parseJson } from "@/lib/ai";
import { saveReply, softDeleteReply, countToday, listSettings, saveSetting } from "@/lib/reviews";
import { collectPlace, writeReply, NoReplyApi } from "@/lib/place";
import {
  LENGTHS, TONES, modelId, modelWon, DAILY_LIMIT_DEFAULT, LIMIT_MIN, LIMIT_MAX,
} from "@/lib/reviewMeta";

export const dynamic = "force-dynamic";
/* AI 가 답을 쓰는 데도, 네이버에서 리뷰를 긁어오는 데도 시간이 걸린다 */
export const maxDuration = 120;

/**
 * 답글을 어떻게 쓰라고 시킬지
 *
 * 리뷰 답글은 광고가 아니라 응대다. 그래서 지켜야 할 선을 프롬프트에 못 박는다.
 *  - 리뷰에 없는 사실을 지어내지 않는다 (없는 시설, 없는 이벤트)
 *  - 손님 이름·나이·성별을 추측하지 않는다
 *  - 키워드는 자연스럽게 한두 번만 — 억지로 밀어 넣으면 읽는 사람이 먼저 안다
 *  - 별점이 낮으면 반박하지 않는다
 *  - 지금 지킬 수 없게 될 약속을 하지 않는다 — 답글은 몇 년씩 남는다
 */
function buildPrompt(p: {
  branchName: string;
  review: string;
  stars: number;
  length: string;
  tone: string;
  keywords: string[];
  ending: string;
  /** 플레이스에서 실제로 확인된 우리 가게 사실 */
  facts: string[];
  landmarks: string[];
}) {
  const len = LENGTHS.find((x) => x.v === p.length) ?? LENGTHS[1];
  const tone = TONES.find((x) => x.v === p.tone) ?? TONES[0];
  const bad = p.stars > 0 && p.stars <= 2;

  const system = [
    `너는 천안에 있는 헬스장 「${p.branchName}」의 사장님을 대신해 손님 리뷰에 답글을 쓰는 사람이다.`,
    "네이버 플레이스 리뷰에 그대로 올릴 수 있는 답글을 쓴다.",
    "",
    /* 잘 쓴 답글은 순서가 있다. 순서를 안 정해 주면 「감사합니다 + 좋은 말」 로만
       채워진, 어느 리뷰에 붙여도 되는 글이 나온다. 실제로 그렇게 나왔다. */
    bad
      ? [
          "[이 순서로 쓴다]",
          "1. 사과 — 무엇이 불편하셨는지 손님이 쓴 말을 그대로 짚어서.",
          "2. 원인이나 지금 상태를 짧게. 변명하지 않는다.",
          "3. 무엇을 어떻게 하겠다 — 구체적으로. \"확인해 보겠습니다\"로 끝내지 않는다.",
          "4. 직접 연락할 길을 연다 (데스크·전화·남겨 주시면).",
        ].join("\n")
      : [
          "[이 순서로 쓴다]",
          `1. 인사 — 「${p.branchName}」 이름을 넣어 인사한다.`,
          "2. 되받기 — 리뷰에서 손님이 쓴 문장 하나를 그대로 짚어서 받는다.",
          '   예) 리뷰에 "한동안 쉬다가 다시 시작"이라 적혀 있으면 → "한동안 쉬셨다가 다시 시작하셨군요".',
          "   이 문장이 없으면 어떤 리뷰에 붙여도 되는 답글이 된다. 반드시 넣는다.",
          "3. 대응 — 손님이 말한 그 대목에 딱 맞는 [확인된 사실] \"하나만\" 골라 든다.",
          "   고른 사실이 왜 이 손님에게 좋은지까지 이어서 쓴다. 사실만 적으면 자랑이 된다.",
          "   ※ 시설을 두 개 이상 늘어놓지 않는다. \"A도 있고 B도 있고\" 는 광고문이 된다.",
          "4. 다음 — 다음에 오시면 해보시라고 권할 것을 한 가지. [확인된 사실]에 있는 것만.",
          "5. 마무리 — 리뷰에 적힌 그분의 목표나 상황을 받아 응원하는 한마디로 닫는다.",
        ].join("\n"),
    "",
    "[반드시 지킬 것]",
    "1. 리뷰에 적혀 있지 않은 사실을 절대 만들지 않는다. 특히 아래를 조심한다.",
    '   - 다니신 기간·등록한 상품 (리뷰에 "6개월 회원권"이라고 없으면 쓰지 않는다)',
    '   - 방문 빈도·오래된 관계 ("항상 이용해주셔서", "꾸준히 방문해주시는" 은 리뷰에 근거가 있을 때만)',
    "   - 손님의 이름·나이·성별·직업",
    "   리뷰를 다시 읽고, 거기 적힌 것만 가지고 쓴다.",
    "2. 아래 [확인된 사실]에 없는 시설·행사·할인·직원 이름을 만들지 않는다.",
    "3. 앞날을 약속하지 않는다. 특히 가격은 \"앞으로도 올리지 않겠다\" 같은 말을 절대 쓰지 않는다.",
    "4. 진행 중인 이벤트·할인·특가를 인용하지 않는다. 답글은 오래 남는데 혜택은 곧 끝난다.",
    "5. 존댓말로 쓴다. 이모지는 없거나 많아도 한 개. 느낌표도 한 개까지.",
    '6. "최고", "1등", "무조건" 같은 단정하는 말을 쓰지 않는다.',
    "7. 마크다운(**, #, 목록표시)을 쓰지 않는다. 네이버는 그것을 글자 그대로 보여준다.",
    "",
    "[누구를 위한 글인가] 답글은 리뷰를 쓴 손님보다, 그 답글을 읽을 다음 손님을 위한 것이다.",
    "",
    p.facts.length
      ? `[확인된 사실] 실제로 확인된 것이다. 여기 있는 것만 쓴다.\n- ${p.facts.join("\n- ")}`
      : "[확인된 사실] 아직 하나도 없다. 그러니 시설·프로그램·혜택을 한 마디도 말하지 말고, " +
        "손님이 쓴 말에만 답한다. 없는 것을 지어내느니 짧게 쓰는 편이 낫다.",
    p.landmarks.length ? `[근처] ${p.landmarks.join(", ")}` : "",
    "",
    `[길이] ${len.rule}로 쓴다.`,
    `[말투] ${tone.rule}`,
    p.keywords.length && !bad
      ? `[키워드] 다음 말을 답글 안에 자연스럽게 넣는다: ${p.keywords.join(", ")}. ` +
        "인사말에 업체 이름과 함께 넣으면 자연스럽다. 한 키워드를 두 번 이상 반복하지 않는다."
      : "[키워드] 따로 넣을 말은 없다.",
    p.ending && !bad ? `[끝인사] 마지막 문장은 다음 문장을 그대로 쓴다: ${p.ending}` : "",
    "",
    "[답하는 방식]",
    "설명 없이 JSON 하나만 답한다. 형태는 이렇다.",
    '{"주제": ["리뷰에서 읽어낸 주제 2~4개"], "답글": "답글 본문"}',
    '주제는 "친절", "시설 청결", "조용한 분위기", "주차 불편" 처럼 짧은 말로 적는다.',
    p.length === "짧게"
      ? "답글은 한 문단으로 쓴다."
      : "답글은 문단 세 개로 나눈다. 문단 사이는 빈 줄 하나로 띄운다.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    p.stars ? `손님이 준 별점: 별 ${p.stars}개` : "손님이 준 별점: 알 수 없음",
    "",
    "손님이 남긴 리뷰 — 여기 적힌 것만 사실이다:",
    p.review.trim(),
  ].join("\n");

  return { system, user };
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
    const modelPick = String(body.모델 ?? "빠름");

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
     * 답글은 진단 서버에 맡긴다
     *
     * 지시문과 점검 규칙은 대표님이 계속 다듬으시는 것이다. 대시보드가 한 벌
     * 더 갖고 있으면 그쪽을 고쳐도 여기는 옛날 답글을 계속 쓴다.
     * 다만 그 창구가 아직 없는 동안에도 답글은 나와야 하므로,
     * 없으면 여기서 직접 만든다.
     */
    let 답글 = "";
    let 주제: string[] = [];
    let 점검: any[] = [];
    let 통과 = 0;
    let 전체 = 0;
    let 만든곳 = "진단서버";

    try {
      const w = await writeReply({
        review, star: stars, length, tone, keywords, closing: ending,
        facts, landmarks, name: branchName, area: "천안",
        tier: modelPick === "꼼꼼" ? "good" : "fast",
        placeId: (setting?.플레이스ID ?? "").trim(),
      });
      답글 = w.답글;
      주제 = w.주제.slice(0, 6);
      점검 = w.점검;
      통과 = w.통과;
      전체 = w.전체;
    } catch (e: any) {
      if (!(e instanceof NoReplyApi)) throw e;

      만든곳 = "대시보드";
      const { system, user } = buildPrompt({
        branchName, review, stars, length, tone, keywords, ending, facts, landmarks,
      });
      const out = await ask({
        model: modelId(modelPick),
        system,
        user,
        maxTokens: 1200,
        prefill: "{",
      });
      const parsed = parseJson(out.text);
      답글 = String(parsed?.답글 ?? "").trim();
      주제 = Array.isArray(parsed?.주제)
        ? parsed.주제.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 6)
        : [];
    }

    if (!답글) {
      return NextResponse.json({ error: "AI 가 답글을 만들지 못했습니다. 다시 눌러주세요." }, { status: 502 });
    }

    const id = await saveReply(
      {
        지점코드: branch, 별점: stars, 리뷰내용: review, 주제, 답글,
        키워드: keywords, 말투: tone, 길이: length, 끝인사: ending, 모델: modelPick,
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
      원: modelWon(modelPick),
      점검,
      통과,
      전체,
      만든곳,
      등록일시: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "답글을 만들지 못했습니다." }, { status: 500 });
  }
}
