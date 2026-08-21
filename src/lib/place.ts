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
  /**
   * 네이버에 걸려 있는 진짜 상호
   *
   * 우리는 「쌍용점」이라고 부르지만 손님이 검색으로 보는 이름은
   * 「쌍용동헬스장 MTO피트니스 쌍용점」이다. 답글에 들어갈 이름은 그쪽이어야 한다.
   */
  name: string;
  /** 아직 답글이 안 달린 리뷰 */
  openReviews: OpenReview[];
  /** 답글에 쓸 수 있는 "확인된 사실" — 시설·프로그램 이름 */
  facts: string[];
  /** 지하철역·버스정류장 같은 동네 이름 */
  landmarks: string[];
  /** 사장님이 올린 소식 제목 */
  feeds: string[];
  /**
   * 긁어온 것 통째로
   *
   * 답글 재료를 만드는 일은 플레이스 홈페이지 쪽 함수(replyFacts·promptFacts)가
   * 한다. 그 함수가 이 모양 그대로를 받는다 — 여기서 미리 골라 내면
   * 그때부터 재료가 달라지고, 같은 지시문인데 다른 답글이 나온다.
   */
  raw: { data: any; material: any };
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
    name: String(json?.data?.name ?? json?.name ?? "").trim(),
    openReviews: open,
    /* 답글에 쓸 사실. 이름이 너무 짧은 것은 무슨 말인지 몰라 빼고,
       열 개가 넘어가면 프롬프트만 길어지고 답글은 그대로다. */
    /* 답글에 쓸 사실. 시설 이름만 넘기다 보니 재료가 늘 서너 줄이었다.
       편의시설·결제수단·사장님이 올린 소식까지 같이 넘긴다 —
       「24시간 운영」, 「주차 가능」 같은 것이 손님 질문에 대한 답이 되는 자리가 많다. */
    facts: [
      ...(Array.isArray(m.menuNames) ? m.menuNames : Array.isArray(m.menus) ? m.menus : []),
      ...(Array.isArray(m.conveniences) ? m.conveniences : []),
      ...(Array.isArray(m.payments) ? m.payments.map((x: any) => `${x} 결제 가능`) : []),
    ]
      .map((x: any) => String(x).trim())
      .filter((x: string) => x.length >= 3)
      .filter((x: string, i: number, a: string[]) => a.indexOf(x) === i)
      .slice(0, 18),
    landmarks: (Array.isArray(m.landmarks) ? m.landmarks : [])
      .map((x: any) => String(x).trim())
      .filter(Boolean)
      .slice(0, 4),
    feeds: (Array.isArray(m.feeds) ? m.feeds : [])
      .map((f: any) => String(f?.title ?? "").trim())
      .filter(Boolean)
      .slice(0, 3),
    raw: { data: json?.data ?? {}, material: m },
  };
}


/* ── 답글 만들기를 진단 서버에 맡긴다 ────────────────────────
 *
 * 답글을 어떻게 쓸지(지시문)와 잘 썼는지(점검)는 대표님이 계속 다듬으시는
 * 규칙이다. 대시보드가 그 규칙을 한 벌 더 갖고 있으면, 그쪽을 고쳐도
 * 대시보드는 옛날 답글을 계속 쓴다. 그래서 서버에 물어본다.
 *
 * 다만 서버에 아직 그 창구가 없을 수 있다(배포 전). 그때는 없다고 알려주고,
 * 부르는 쪽이 원래 방식으로 되돌아간다 — 창구가 생기기 전이라고 해서
 * 답글을 못 만들면 안 된다.
 * ────────────────────────────────────────────────────────── */

export type Judged = { t: string; ok: boolean; note?: string };

export type Written = {
  답글: string;
  주제: string[];
  점검: Judged[];
  통과: number;
  전체: number;
};

/**
 * 서버에 「답글」 창구가 없을 때
 *
 * 한때는 이것을 「아직 안 올렸을 뿐」으로 보고 대시보드가 대신 썼다.
 * 지금은 답글의 주인이 서버 하나뿐이라, 이것도 그냥 오류다.
 * 남겨 두는 이유는 무엇이 잘못됐는지 문장에 담기 위해서다.
 */
export class NoReplyApi extends Error {}

export async function writeReply(input: {
  review: string;
  star: number;
  length: string;
  tone: string;
  keywords: string[];
  closing: string;
  facts: string[];
  landmarks: string[];
  name: string;
  area: string;
  tier: string;
  /** 지시문 맨 앞에 붙는 가게 소개 — 화면과 같은 함수로 만든 것 */
  head?: string;
  /** 재료가 비면 서버가 이걸로 직접 긁어온다 */
  placeId?: string;
}): Promise<Written> {
  const key = (process.env.PLACE_API_KEY ?? "").trim();
  if (!key) throw new NoReplyApi("진단 서버 열쇠가 없습니다.");

  let res: Response;
  try {
    res = await fetch(`${base()}/api/reply`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-key": key },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e: any) {
    throw new NoReplyApi(String(e?.message ?? e));
  }

  /* 창구가 아직 없으면 404 가 온다. 이건 고장이 아니라 "아직 안 올렸다"이다 */
  if (res.status === 404) {
    throw new NoReplyApi(
      "진단 서버에 답글 창구(/api/reply)가 없습니다. naver_place 가 최신인지 확인해주세요."
    );
  }

  const json: any = await res.json().catch(() => null);
  if (!json) throw new NoReplyApi("응답을 읽지 못했습니다.");

  if (!res.ok || json.ok === false) {
    /* 여기서부터는 진짜 오류다 — 되돌아가지 않고 이유를 그대로 전한다 */
    throw new Error(String(json?.error ?? `진단 서버가 막았습니다. (${res.status})`));
  }

  return {
    답글: String(json.reply ?? "").trim(),
    주제: Array.isArray(json.topics) ? json.topics.map((x: any) => String(x)) : [],
    점검: Array.isArray(json.audit) ? json.audit : [],
    통과: Number(json.passed) || 0,
    전체: Number(json.total) || 0,
  };
}

/** 이름으로 찾은 가게 후보 */
export type FoundPlace = {
  id: string;
  rank: number;
  name: string;
  category: string;
  address: string;
  reviews: number | null;
};

/**
 * 검색어로 네이버 플레이스 후보를 찾는다
 *
 * 지점마다 플레이스 주소를 손으로 넣어야 했다. 지점이 넷이면 네 번,
 * 새 지점이 생기면 또 한 번이고, 그때마다 네이버에서 주소를 복사해 와야 한다.
 *
 * 고르는 것은 사람이 한다. 「MTO피트니스」처럼 지점이 여럿인 상호는 검색
 * 결과에 쌍용·성정·용곡이 나란히 뜨고 이름만으로는 못 가른다. 잘못 박히면
 * 그 지점 답글마다 남의 가게 시설이 사실인 양 적힌다 — 빈 칸보다 나쁘다.
 */
export async function findPlaces(keyword: string, n = 5): Promise<FoundPlace[]> {
  const key = (process.env.PLACE_API_KEY ?? "").trim();
  if (!key) throw new Error("환경변수 PLACE_API_KEY 가 없습니다. 진단 서버의 접근 키를 넣어주세요.");
  const kw = (keyword ?? "").trim();
  if (!kw) throw new Error("찾을 이름을 적어주세요.");

  /*
   * 진단 서버가 두 갈래로 갈려 있다
   *
   * 렌더에 떠 있는 쪽은 `q` 를 받아 `places: [{id, name}]` 를 준다.
   * 다른 갈래는 `keyword` 를 받아 `items: [{id, name, address, reviews}]` 를 준다.
   * 어느 쪽이 떠 있든 되게, 둘 다 보내고 둘 다 읽는다 — 서버 사정으로
   * 화면이 안 되는 일은 없어야 한다.
   */
  const url = `${base()}/api/find?q=${encodeURIComponent(kw)}`
    + `&keyword=${encodeURIComponent(kw)}&n=${n}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "x-access-key": key }, cache: "no-store",
                             signal: AbortSignal.timeout(90_000) });
  } catch (e: any) {
    if (e?.name === "TimeoutError") {
      throw new Error("진단 서버가 응답하지 않습니다. 무료 서버라 자고 있을 수 있습니다. 1분 뒤 다시 눌러주세요.");
    }
    throw new Error(`진단 서버에 닿지 못했습니다. (${e?.message ?? e})`);
  }

  if (res.status === 401) throw new Error("진단 서버 접근 키가 틀렸습니다. PLACE_API_KEY 를 확인해주세요.");
  if (res.status === 404) {
    throw new Error("진단 서버에 찾기 창구(/api/find)가 없습니다. naver_place 가 최신인지 확인해주세요.");
  }
  if (!res.ok) throw new Error(`진단 서버가 막았습니다. (${res.status})`);

  const json: any = await res.json().catch(() => null);
  if (!json) throw new Error("응답을 읽지 못했습니다.");
  if (json.ok === false) throw new Error(String(json.error ?? "찾지 못했습니다."));

  const rows = Array.isArray(json.items) ? json.items
    : Array.isArray(json.places) ? json.places
    : [];

  return rows.map((x: any, i: number) => ({
    id: String(x?.id ?? ""),
    rank: Number(x?.rank) || i + 1,
    name: String(x?.name ?? "").trim(),
    /* 떠 있는 쪽은 이름과 아이디만 준다. 없는 칸은 화면에서 감춘다 */
    category: String(x?.category ?? "").trim(),
    address: String(x?.address ?? "").trim(),
    reviews: Number(x?.reviews) || null,
  })).filter((x: FoundPlace) => x.id).slice(0, n);
}

/** 플레이스 도구의 「저장 내역」에 남아 있는 가게 */
export type SavedPlace = {
  id: string;
  /** 플레이스 ID — 도구가 주소에서 뽑아 둔 값 */
  placeId: string;
  name: string;
  /** 마지막으로 저장한 때 */
  at: string;
  /** 그때 잰 진단 점수 */
  score: number | null;
};

/**
 * 플레이스 도구에 저장해 둔 가게 목록
 *
 * ── 왜 검색보다 이쪽이 먼저인가 ────────────────────────────
 * 이름으로 검색하면 「MTO피트니스」에 쌍용·성정·용곡이 나란히 떠서 고르기가
 * 어렵다. 그런데 대표님은 이미 도구에서 지점마다 주소를 넣어 진단을 돌리고
 * 「저장」까지 눌러 두셨다. 그게 확인이 끝난 목록이다 — 검색해서 다시
 * 맞히려 들 이유가 없다.
 *
 * 렌더 무료 플랜은 디스크가 임시라 이 목록이 배포·재시작 때 비워질 수 있다.
 * 비어 있어도 고장이 아니므로, 그럴 때는 이름으로 찾는 쪽으로 안내한다.
 */
export async function listSavedPlaces(): Promise<SavedPlace[]> {
  const key = (process.env.PLACE_API_KEY ?? "").trim();
  if (!key) throw new Error("환경변수 PLACE_API_KEY 가 없습니다. 진단 서버의 접근 키를 넣어주세요.");

  let res: Response;
  try {
    res = await fetch(`${base()}/api/saves`, {
      headers: { "x-access-key": key }, cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    if (e?.name === "TimeoutError") {
      throw new Error("진단 서버가 응답하지 않습니다. 무료 서버라 자고 있을 수 있습니다. 1분 뒤 다시 눌러주세요.");
    }
    throw new Error(`진단 서버에 닿지 못했습니다. (${e?.message ?? e})`);
  }

  if (res.status === 401) throw new Error("진단 서버 접근 키가 틀렸습니다. PLACE_API_KEY 를 확인해주세요.");
  if (!res.ok) throw new Error(`진단 서버가 막았습니다. (${res.status})`);

  const json: any = await res.json().catch(() => null);
  if (!json || json.ok === false) throw new Error(String(json?.error ?? "읽지 못했습니다."));

  const rows: SavedPlace[] = (Array.isArray(json.saves) ? json.saves : []).map((x: any) => ({
    id: String(x?.id ?? ""),
    placeId: String(x?.place ?? "").trim(),
    name: String(x?.name ?? "").trim(),
    at: String(x?.at ?? "").slice(0, 10),
    score: Number.isFinite(Number(x?.score)) ? Number(x.score) : null,
  }));

  /* 주소를 안 넣고 이름만으로 저장한 기록이 섞여 있다 — 그건 플레이스 ID 가
     아니라 가게 이름이라 여기서는 쓸 수 없다 (placeKey 참고) */
  const 숫자만 = rows.filter((x) => /^\d{5,}$/.test(x.placeId));

  /* 같은 가게를 여러 번 저장하셨을 수 있다. 제일 최근 것만 남긴다 */
  const 본것 = new Set<string>();
  return 숫자만.filter((x) => !본것.has(x.placeId) && 본것.add(x.placeId));
}
