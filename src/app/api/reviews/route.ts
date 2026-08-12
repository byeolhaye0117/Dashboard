import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { abilitiesFor } from "@/lib/menu";
import { getBranches } from "@/lib/data";
import { ask, parseJson } from "@/lib/ai";
import { saveReply, softDeleteReply, countToday } from "@/lib/reviews";
import { LENGTHS, TONES, modelId, DAILY_LIMIT_DEFAULT } from "@/lib/reviewMeta";

export const dynamic = "force-dynamic";
/* AI 가 답을 쓰는 데 시간이 걸린다 — 기본 제한(10초)이면 중간에 끊긴다 */
export const maxDuration = 60;

/**
 * 답글을 어떻게 쓰라고 시킬지
 *
 * 리뷰 답글은 광고가 아니라 응대다. 그래서 지켜야 할 선을 프롬프트에 못 박는다.
 *  - 리뷰에 없는 사실을 지어내지 않는다 (없는 시설, 없는 이벤트)
 *  - 손님 이름·나이·성별을 추측하지 않는다
 *  - 키워드는 자연스럽게 한두 번만 — 억지로 밀어 넣으면 읽는 사람이 먼저 안다
 *  - 별점이 낮으면 반박하지 않는다
 */
function buildPrompt(p: {
  branchName: string;
  review: string;
  stars: number;
  length: string;
  tone: string;
  keywords: string[];
  ending: string;
}) {
  const len = LENGTHS.find((x) => x.v === p.length) ?? LENGTHS[1];
  const tone = TONES.find((x) => x.v === p.tone) ?? TONES[0];

  const system = [
    `너는 천안에 있는 헬스장 「${p.branchName}」의 사장님을 대신해 손님 리뷰에 답글을 쓰는 사람이다.`,
    "네이버 플레이스 리뷰에 그대로 올릴 수 있는 답글을 쓴다.",
    "",
    "[반드시 지킬 것]",
    "1. 리뷰에 실제로 적힌 내용을 하나 이상 구체적으로 짚어서 답한다. 두루뭉술한 감사 인사만 쓰지 않는다.",
    "2. 리뷰에 없는 사실을 지어내지 않는다. 없는 시설·행사·할인·직원 이름을 만들어내지 않는다.",
    "3. 손님의 이름·나이·성별·직업을 추측해서 부르지 않는다.",
    "4. 존댓말로 쓴다. 이모지는 아예 쓰지 않거나 많아도 한 개까지.",
    "5. 과장하거나 단정하지 않는다. \"최고\", \"1등\", \"무조건\" 같은 말을 쓰지 않는다.",
    "6. 다른 손님의 개인정보를 언급하지 않는다.",
    "",
    `[길이] ${len.rule}로 쓴다.`,
    `[말투] ${tone.rule}`,
    p.keywords.length
      ? `[키워드] 다음 말을 답글 안에 자연스럽게 넣는다: ${p.keywords.join(", ")}. ` +
        "문장 흐름을 해치면서까지 넣지 않는다. 한 키워드를 두 번 이상 반복하지 않는다."
      : "[키워드] 따로 넣을 말은 없다.",
    p.ending ? `[끝인사] 마지막 문장은 다음 문장을 그대로 쓴다: ${p.ending}` : "",
    "",
    "[답하는 방식]",
    "설명 없이 JSON 하나만 답한다. 형태는 이렇다.",
    '{"주제": ["리뷰에서 읽어낸 주제 2~4개"], "답글": "답글 본문"}',
    "주제는 \"친절\", \"시설 청결\", \"수업 만족\", \"주차 불편\" 처럼 짧은 말로 적는다.",
    "답글 본문에는 줄바꿈을 넣지 않는다.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    p.stars ? `손님이 준 별점: 별 ${p.stars}개` : "손님이 준 별점: 알 수 없음",
    "",
    "손님이 남긴 리뷰:",
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

    if (action !== "write") {
      return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
    }

    if (!mine.create) {
      return NextResponse.json({ error: "답글을 만들 권한이 없습니다." }, { status: 403 });
    }

    /* 화면이 보낸 지점을 그대로 믿지 않는다 */
    const branch = String(body.지점코드 ?? "");
    if (!branch) return NextResponse.json({ error: "지점을 고르지 않았습니다." }, { status: 400 });
    if (session.scope !== "전체" && !session.branches.includes(branch)) {
      return NextResponse.json({ error: "담당 지점에만 쓸 수 있습니다." }, { status: 403 });
    }

    const review = String(body.리뷰내용 ?? "").trim();
    if (!review) return NextResponse.json({ error: "리뷰 내용을 붙여넣어 주세요." }, { status: 400 });
    if (review.length > 3000) {
      return NextResponse.json({ error: "리뷰가 너무 깁니다. 3000자 아래로 줄여주세요." }, { status: 400 });
    }

    /* 하루 한도 — 실수로 눌러대도 요금이 튀지 않게 */
    const limit = Number(process.env.REVIEW_DAILY_LIMIT) || DAILY_LIMIT_DEFAULT;
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
    const modelPick = String(body.모델 ?? "빠름");

    const { system, user } = buildPrompt({
      branchName, review, stars, length, tone, keywords, ending,
    });

    const out = await ask({
      model: modelId(modelPick),
      system,
      user,
      maxTokens: 1200,
      prefill: "{",
    });

    const parsed = parseJson(out.text);
    const 답글 = String(parsed?.답글 ?? "").trim();
    if (!답글) return NextResponse.json({ error: "AI 가 답글을 만들지 못했습니다. 다시 눌러주세요." }, { status: 502 });
    const 주제: string[] = Array.isArray(parsed?.주제)
      ? parsed.주제.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 6)
      : [];

    const id = await saveReply(
      {
        지점코드: branch, 별점: stars, 리뷰내용: review, 주제, 답글,
        키워드: keywords, 말투: tone, 길이: length, 끝인사: ending, 모델: modelPick,
      },
      session.staffId
    );

    return NextResponse.json({
      ok: true,
      id,
      주제,
      답글,
      used: used + 1,
      limit,
      등록일시: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "답글을 만들지 못했습니다." }, { status: 500 });
  }
}
