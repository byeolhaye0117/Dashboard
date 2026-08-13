/**
 * 플레이스 수집기 부르기 (서버 전용)
 *
 * 리뷰를 긁어오는 일은 대표님이 따로 만들어 두신 「플레이스 진단」 서버가 한다.
 * 대시보드는 그 서버에 물어보기만 한다. 같은 코드를 두 벌 두지 않는 이유는 —
 * 네이버가 페이지 구조를 바꾸면 고칠 곳이 두 군데가 되기 때문이다.
 * 그쪽을 고치면 대시보드도 같이 좋아진다.
 *
 * 주소와 열쇠는 환경변수로만 읽는다.
 *   PLACE_API_BASE  예) https://gym-place-check.onrender.com
 *   PLACE_API_KEY   그 서버의 ACCESS_KEY
 */

export type OpenReview = { body: string; rating: number | null; date: string };

export type Collected = {
  placeId: string;
  /** 아직 답글이 안 달린 리뷰 */
  openReviews: OpenReview[];
  /** 답글에 쓸 수 있는 "확인된 사실" — 시설·프로그램 이름 */
  facts: string[];
  /** 지하철역·버스정류장 같은 동네 이름 */
  landmarks: string[];
  /** 사장님이 올린 소식 제목 */
  feeds: string[];
};

function base(): string {
  const v = (process.env.PLACE_API_BASE ?? "").trim().replace(/\/+$/, "");
  if (!v) {
    throw new Error(
      "환경변수 PLACE_API_BASE 가 없습니다. 플레이스 진단 서버 주소를 Vercel 에 넣어주세요."
    );
  }
  return v;
}

export function placeReady(): boolean {
  return Boolean((process.env.PLACE_API_BASE ?? "").trim() && (process.env.PLACE_API_KEY ?? "").trim());
}

/**
 * 리뷰를 긁어온다
 *
 * 렌더 무료 서버는 15분 놀면 잠든다. 깨우는 데 30~60초가 걸리므로
 * 기다리는 시간을 넉넉히 준다. 여기서 서둘러 끊으면 "안 된다"고 잘못 알게 된다.
 */
export async function collectPlace(placeId: string): Promise<Collected> {
  const key = (process.env.PLACE_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("환경변수 PLACE_API_KEY 가 없습니다. 진단 서버의 접근 키를 넣어주세요.");
  }
  const target = (placeId ?? "").trim();
  if (!target) throw new Error("플레이스 주소가 아직 등록되지 않았습니다.");

  const url = `${base()}/api/place?url=${encodeURIComponent(target)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-access-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e: any) {
    if (e?.name === "TimeoutError") {
      throw new Error(
        "진단 서버가 응답하지 않습니다. 무료 서버라 자고 있을 수 있습니다. 1분 뒤 다시 눌러주세요."
      );
    }
    throw new Error(`진단 서버에 닿지 못했습니다. (${e?.message ?? e})`);
  }

  if (res.status === 401) {
    throw new Error("진단 서버 접근 키가 틀렸습니다. PLACE_API_KEY 를 확인해주세요.");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`진단 서버가 막았습니다. (${res.status}) ${body.slice(0, 200)}`);
  }

  const json: any = await res.json();
  if (json?.ok === false) {
    throw new Error(String(json?.error ?? "리뷰를 가져오지 못했습니다."));
  }

  /*
   * 이름이 조금 달라져도 읽어낸다
   *
   * 리뷰를 긁는 쪽은 대표님이 계속 고치시는 코드다. 네이버가 페이지를 바꾸면
   * 그쪽도 따라 바뀐다. 그때마다 대시보드가 같이 멈추면 두 군데를 고쳐야 하니,
   * 부르는 쪽에서 후보를 몇 개 걸어 둔다.
   */
  const m = json?.material ?? json ?? {};
  const rawOpen =
    (Array.isArray(m.openReviews) && m.openReviews) ||
    (Array.isArray(json?.openReviews) && json.openReviews) ||
    (Array.isArray(m.noReply) && m.noReply) ||
    null;

  /*
   * "못 읽은 것"과 "정말 없는 것"을 가른다
   *
   * 둘 다 0개로 보이면, 답글을 다 달아둔 것인지 응답 형식이 바뀐 것인지
   * 알 수가 없다. 목록 자체를 못 찾았으면 그렇다고 말한다.
   */
  if (rawOpen === null) {
    throw new Error(
      "진단 서버 응답에서 리뷰 목록을 찾지 못했습니다. " +
        "서버 쪽 응답 형식이 바뀌었을 수 있습니다 (material.openReviews)."
    );
  }

  const open: OpenReview[] = rawOpen
    .map((r: any) => ({
      body: String(r?.body ?? r?.text ?? r?.contents ?? r?.description ?? "")
        .replace(/\s+/g, " ")
        .trim(),
      rating: Number(r?.rating ?? r?.star ?? r?.score) || null,
      date: String(r?.date ?? r?.created ?? r?.visited ?? "").trim(),
    }))
    .filter((r: OpenReview) => r.body.length >= 10);

  return {
    placeId: String(json?.placeId ?? target),
    openReviews: open,
    /* 답글에 쓸 사실. 이름이 너무 짧은 것은 무슨 말인지 몰라 빼고,
       열 개가 넘어가면 프롬프트만 길어지고 답글은 그대로다. */
    facts: (Array.isArray(m.menuNames) ? m.menuNames : Array.isArray(m.menus) ? m.menus : [])
      .map((x: any) => String(x).trim())
      .filter((x: string) => x.length >= 3)
      .slice(0, 12),
    landmarks: (Array.isArray(m.landmarks) ? m.landmarks : [])
      .map((x: any) => String(x).trim())
      .filter(Boolean)
      .slice(0, 4),
    feeds: (Array.isArray(m.feeds) ? m.feeds : [])
      .map((f: any) => String(f?.title ?? "").trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}
