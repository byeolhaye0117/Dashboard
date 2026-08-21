"use client";

/**
 * 리뷰 답글
 *
 * 오른쪽 위가 「답글 밀린 리뷰」다. 네이버를 한 장씩 넘기며 답글 안 달린 것을
 * 찾는 일은 사람이 할 일이 아니다. 대표님이 만들어 두신 진단 서버가 그것만
 * 골라서 넘겨준다.
 *
 * AI 가 쓴 것은 초안이다. 그대로 올리라고 만들지 않았다 —
 * 복사해서 읽어보고 고쳐 올리는 것을 전제로 한다.
 */
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { today } from "@/lib/time";
import {
  keywordsFor, suggestTone, MODEL_WON, OWN_MAX,
} from "@/lib/reviewMeta";
/* 시설 목록은 답글 코어에 있다 — 플레이스 홈페이지와 같은 목록을 써야
   한쪽에서 체크한 것이 다른 쪽 답글에도 들어간다 */
import { FACILITIES } from "@/lib/replyCore";

type Named = { code: string; name: string };
type Person = { id: string; name: string };
type Reply = {
  id: string; 지점코드: string; 별점: number; 리뷰내용: string;
  주제: string[]; 답글: string; 키워드: string[]; 말투: string; 길이: string;
  모델: string; 등록일시: string; 등록자: string;
};
type Setting = {
  지점코드: string; 플레이스ID: string; 키워드: string[]; 끝인사: string; 하루한도: number;
  시설: string[]; 가격: string; 차별점: string; 우리만아는사실: string[];
};
type OpenReview = { body: string; rating: number | null; date: string };

type Props = {
  me: string;
  myBranch: string;
  branches: Named[];
  people: Person[];
  replies: Reply[];
  settings: Setting[];
  can: { create: boolean; update: boolean; remove: boolean };
  /** AI 열쇠가 꽂혀 있는지 — 없으면 눌러도 안 되니 미리 알려준다 */
  hasKey: boolean;
  /** 플레이스 진단 서버 주소·열쇠가 꽂혀 있는지 */
  hasPlace: boolean;
  limit: number;
  problem: string;
};

/** 별을 글자로 — 숫자보다 눈에 빨리 들어온다 */
function stars(n: number): string {
  if (!n) return "";
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

function when(s: string): string {
  return (s ?? "").slice(0, 16).replace("T", " ");
}

/** 같은 리뷰인지 — 앞부분만 보고 가린다 (진단 서버도 같은 방식으로 겹침을 뺀다) */
function keyOf(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 25);
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 복사 권한이 막힌 브라우저 — 옛날 방식으로 한 번 더
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function Client(p: Props) {
  const first = p.branches.find((b) => b.code === p.myBranch)?.code ?? p.branches[0]?.code ?? "";
  const [branch, setBranch] = useState(first);

  const [review, setReview] = useState("");
  const [star, setStar] = useState(5);
  /*
   * 길이는 380자로 고정이다
   *
   * 짧게·중간·길게를 고르게 했었다. 사장님이 마음에 들어 하신 답글들이
   * 전부 380자쯤이었고, "항상 380자로" 하자고 정하셨다. 그러면 고를 것이
   * 없다 — 아무도 안 누를 단추를 화면에 두면 자리만 차지한다.
   *
   * 다시 고르실 일이 생기면 여기를 상태로 되돌리고 LENGTHS 를 그리면 된다.
   */
  const len = "중간";
  /*
   * 끝인사는 안 쓰는 것이 기본이다
   *
   * 예전에는 "앞으로도 최선을 다하겠습니다. 감사합니다."가 기본으로 박혀 있었다.
   * 그러면 답글의 마지막 자리를 그 문장이 통째로 가져간다 — 그 자리가 답글의
   * 온도를 정하는 자리인데, 어느 리뷰에 붙여도 되는 말로 닫히고 이모지도 못 온다.
   * 실제로 원조 답글은 "저희가 함께 응원하겠습니다 🔥"로 닫았고, 대시보드는
   * "앞으로도 최선을 다하겠습니다. 감사합니다."로 닫았다. 그 차이였다.
   *
   * 플레이스 진단 화면도 이 칸은 비워 둔 채로 쓴다. 같게 맞춘다.
   *
   * 고르는 자리도 없앴다. 「넣지 않기」가 늘 옳은 답이면 고르게 할 일이
   * 아니다 — 답이 하나인 물음을 화면에 두면 자리만 차지하고, 잘못 고를
   * 길만 하나 열린다. 지점 설정에 적어 두신 끝인사도 이제 안 불러온다.
   *
   * 다시 고르실 일이 생기면 여기를 상태로 되돌리고 ENDINGS 를 그리면 된다.
   */
  const ending = "";
  const [picked, setPicked] = useState<string[]>([]);
  /** 화면에서 직접 더 넣은 키워드 */
  const [extra, setExtra] = useState<string[]>([]);
  const [typing, setTyping] = useState("");

  /** 지점별 플레이스 주소 */
  const [place, setPlace] = useState("");
  const [open, setOpen] = useState<OpenReview[] | null>(null);
  const [facts, setFacts] = useState<string[]>([]);
  const [near, setNear] = useState<string[]>([]);
  /* 네이버에 걸린 진짜 상호. 답글 첫 문장이 「안녕하세요 OOO입니다.」라서
     이 이름이 곧 인사말이 된다 — 「쌍용점」으로 인사하면 손님이 모르는 이름이다 */
  const [realName, setRealName] = useState("");
  /* 지시문 맨 앞에 붙는 가게 소개. 「불러오기」가 만들어 주고 화면이 들고 있다가
     답글 만들 때 되돌려준다 — 답글 하나 만들 때마다 다시 긁으면 느리다 */
  const [head, setHead] = useState("");

  /* ── 네이버가 모르는 것 ──────────────────────────────
     시설·가격·리뷰 수는 긁어오면 들어온다. 개업 연차나 트레이너 경력은
     네이버 어디에도 없어서, 이게 있고 없고가 「다른 헬스장에도 붙는 글」과
     「우리 글」을 가른다. 플레이스 진단 화면의 같은 칸과 짝이다. */
  const [fac, setFac] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [edge, setEdge] = useState("");
  const [own, setOwn] = useState("");
  const [ownBox, setOwnBox] = useState(false);
  const [ownSaving, setOwnSaving] = useState(false);
  const [ownNote, setOwnNote] = useState<{ bad: boolean; text: string } | null>(null);
  const [pulling, setPulling] = useState(false);
  /* 저장 결과는 누른 단추 바로 옆에 보여야 한다 — 반대편 기둥에 띄우면 못 본다 */
  const [saving, setSaving] = useState(false);
  /* 주소는 한 번 넣으면 끝이다. 늘 펼쳐 두면 「불러오기」가 그만큼 아래로 밀린다 */
  const [placeBox, setPlaceBox] = useState(false);
  /*
   * 이름으로 찾기
   *
   * 지점마다 플레이스 주소를 손으로 넣어야 했다. 네 지점이면 네 번, 새 지점이
   * 생기면 또 한 번이고, 그때마다 네이버에서 주소를 복사해 와야 한다.
   *
   * 고르는 것은 대표님이 하신다. 「MTO피트니스」처럼 지점이 여럿인 상호는
   * 검색 결과에 쌍용·성정·용곡이 나란히 뜨고 이름만으로는 못 가른다. 잘못
   * 박히면 그 지점 답글마다 남의 가게 시설이 사실인 양 적힌다 — 빈 칸보다 나쁘다.
   */
  /*
   * 플레이스 도구에 저장해 둔 가게
   *
   * 이름으로 검색하면 「MTO피트니스」에 쌍용·성정·용곡이 나란히 떠서 고르기가
   * 어렵다. 그런데 대표님은 이미 도구에서 지점마다 주소를 넣어 진단을 돌리고
   * 「저장」까지 눌러 두셨다. 그게 확인이 끝난 목록이다 —
   * 검색해서 다시 맞히려 들 이유가 없다. 이쪽을 먼저 보여준다.
   */
  const [saved, setSaved] = useState<
    { id: string; placeId: string; name: string; at: string; score: number | null }[] | null
  >(null);
  const [savedErr, setSavedErr] = useState("");
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<
    { id: string; rank: number; name: string; category: string; address: string; reviews: number | null }[] | null
  >(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null);

  /* 하루 한도 — 지점마다 따로. 값은 「리뷰설정」 탭에서 정한다 */
  const [limit, setLimit] = useState(p.limit);

  const [list, setList] = useState<Reply[]>(p.replies);
  const [out, setOut] = useState<{
    주제: string[]; 답글: string;
    점검?: { t: string; ok: boolean; note?: string }[];
    통과?: number; 전체?: number;
    /** 진단 서버가 아니라 대시보드 사본으로 쓴 것인가 */
    사본?: boolean;
    /** 네이버에서 긁어온 재료가 하나도 없이 쓴 것인가 */
    재료없음?: boolean;
    /** 이 지점에 플레이스 주소가 아직 없는가 */
    플레이스없음?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  /* 복사했다는 말은 누른 단추에서 나와야 한다 — 딴 데 띄우면 눌렀는지도 모른다 */
  const [copied, setCopied] = useState<{ key: string; ok: boolean } | null>(null);

  const branchName = useMemo(
    () => p.branches.find((b) => b.code === branch)?.name ?? "",
    [p.branches, branch]
  );

  /** 이 지점에 어울리는 말 + 직접 넣은 말 */
  const candidates = useMemo(() => {
    const base = keywordsFor(branchName);
    const seen = new Set(base);
    return [...base, ...extra.filter((x) => !seen.has(x))];
  }, [branchName, extra]);

  /* 지점을 바꾸면 그 지점에 저장해 둔 설정을 꺼내온다 */
  useEffect(() => {
    if (!branch) return;
    const s = p.settings.find((x) => x.지점코드 === branch);
    setPlace(s?.플레이스ID ?? "");
    const saved = s?.키워드 ?? [];
    const base = keywordsFor(branchName);
    setExtra(saved.filter((w) => !base.includes(w)));
    setPicked(saved.length ? saved : base.slice(0, 1));
    setOpen(null);
    setFacts([]);
    setRealName("");
    setHead("");
    setNear([]);
    setOut(null);
    setMsg("");
    setNote(null);
    setPlaceBox(false);
    setLimit(s?.하루한도 || p.limit);
    setFac(s?.시설 ?? []);
    setPrice(s?.가격 ?? "");
    setEdge(s?.차별점 ?? "");
    setOwn((s?.우리만아는사실 ?? []).join("\n"));
    setOwnBox(false);
    setOwnNote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  /**
   * 지점 설정을 시트에 남긴다
   *
   * 키워드를 누를 때마다 부르지 않는다 — 다섯 번 누르면 시트 쓰기가 다섯 번 나가고,
   * 겹쳐 들어가면 서로 덮어쓴다. 키워드·끝인사는 답글을 만드는 순간 서버가 함께
   * 저장한다(그때가 "실제로 쓴 값"이 정해지는 순간이다). 여기서는 플레이스 주소처럼
   * 사람이 「저장」을 눌렀을 때만 쓴다.
   */
  async function keep(patch: any): Promise<{ ok: boolean; error: string }> {
    if (!p.can.update && !p.can.create) {
      return { ok: false, error: "설정을 바꿀 권한이 없는 계정입니다." };
    }
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", 지점코드: branch, ...patch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error ?? "저장하지 못했습니다." };
      return { ok: true, error: "" };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  const toggleKw = (w: string) => {
    const has = picked.includes(w);
    if (!has && picked.length >= 5) {
      setMsg("키워드는 다섯 개까지만 넣을 수 있습니다. 많이 넣으면 광고처럼 읽힙니다.");
      return;
    }
    setPicked(has ? picked.filter((x) => x !== w) : [...picked, w]);
    setMsg("");
  };

  const addKw = () => {
    const w = typing.trim();
    if (!w) return;
    setTyping("");
    if (candidates.includes(w)) {
      if (!picked.includes(w)) toggleKw(w);
      return;
    }
    setExtra([...extra, w]);
    if (picked.length < 5) setPicked([...picked, w]);
  };

  /*
   * 말투는 별점이 정한다
   *
   * 예전에는 「정중·친근·담백·사과」를 손으로 골랐다. 그런데 답글 지시문을
   * 플레이스 홈페이지 원본과 하나로 합치면서, 그쪽에는 말투 고르는 칸이
   * 없다는 것을 알았다. 별 둘 이하면 사과문으로 통째로 갈아입고, 그 위는
   * 사장님 말투 견본을 그대로 따라간다 — 그래서 고를 것이 없다.
   *
   * 아무 일도 안 하는 단추를 화면에 두는 것이 제일 나쁘다. 눌러 놓고
   * 「바꿨는데 왜 그대로지」 하게 된다. 그래서 칸을 없애고, 기록에는
   * 이 별점에 어떤 결로 썼는지만 남긴다.
   */
  const tone = suggestTone(star);
  const pickStar = (n: number) => setStar(n);

  /* 줄 단위로 적는 칸이라 줄로 센다. 저장할 때 서버가 같은 규칙으로 자른다 */
  const ownLines = useMemo(
    () => own.split(/\n+/).map((x) => x.replace(/^\s*[-·*+]\s*/, "").trim()).filter((x) => x.length >= 2),
    [own]
  );

  const mine = useMemo(() => list.filter((r) => r.지점코드 === branch), [list, branch]);
  const madeKeys = useMemo(() => new Set(mine.map((r) => keyOf(r.리뷰내용))), [mine]);

  /*
   * 오늘 몇 번 — 서버와 같은 날짜로 세야 한다
   *
   * 여기서 세계표준시로 오늘을 잡고 있었다. 한국 시각 자정부터 아침 아홉 시
   * 사이에는 세계표준시가 아직 어제라, 화면은 「오늘 2회」인데 서버는 3회로
   * 세어 막는 일이 생긴다. 시각은 한 군데서만 정한다.
   */
  const todays = useMemo(() => {
    const day = today();
    return mine.filter((r) => (r.등록일시 ?? "").startsWith(day));
  }, [mine]);
  /* 한 번에 얼마쯤 드는지 — 어림값이다 */
  const wonToday = todays.length * MODEL_WON;

  const nameOf = useMemo(() => new Map(p.people.map((x) => [x.id, x.name])), [p.people]);
  const left = Math.max(0, limit - todays.length);

  async function pull() {
    if (pulling) return;
    setPulling(true);
    setMsg("");
    setOk("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collect", 지점코드: branch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "리뷰를 가져오지 못했습니다.");
      setOpen(json.openReviews ?? []);
      setFacts(json.facts ?? []);
      setRealName(String(json.상호 ?? ""));
      setHead(String(json.머리글 ?? ""));
      setNear(json.landmarks ?? []);
      setNote({
        bad: false,
        text: (json.openReviews ?? []).length
          ? `답글이 안 달린 리뷰 ${json.openReviews.length}개를 찾았습니다.`
          : "답글이 안 달린 리뷰가 없습니다. 다 달아두셨네요.",
      });
    } catch (e: any) {
      setNote({ bad: true, text: String(e.message ?? e) });
    } finally {
      setPulling(false);
    }
  }

  function take(r: OpenReview) {
    setReview(r.body);
    pickStar(r.rating ?? 5);
    setOut(null);
    setMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* 주소 칸이 비어 있을 때만 불러온다 — 이미 넣어 두셨으면 볼 일이 없다 */
  useEffect(() => {
    if (!branch || !p.hasPlace) return;
    if (place.trim() && !placeBox) return;
    if (saved !== null) return;
    let 살아있음 = true;
    (async () => {
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "saved", 지점코드: branch }),
        });
        const j = await res.json();
        if (!살아있음) return;
        if (!res.ok) throw new Error(j.error ?? "읽지 못했습니다.");
        setSaved(j.items ?? []);
      } catch (e: any) {
        if (!살아있음) return;
        setSaved([]);
        setSavedErr(String(e.message ?? e));
      }
    })();
    return () => { 살아있음 = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, place, placeBox, p.hasPlace]);

  async function findPlace() {
    if (finding) return;
    const kw = (q.trim() || branchName).trim();
    if (!kw) return;
    setFinding(true);
    setFound(null);
    setNote(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "find", 지점코드: branch, 검색어: kw }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "찾지 못했습니다.");
      setFound(j.items ?? []);
      if (!(j.items ?? []).length) {
        setNote({ bad: true, text: "그 이름으로는 못 찾았습니다. 상호에 동네 이름을 붙여 다시 찾아보세요." });
      }
    } catch (e: any) {
      setNote({ bad: true, text: String(e.message ?? e) });
    } finally {
      setFinding(false);
    }
  }

  async function make() {
    if (busy) return;
    if (!review.trim()) {
      setMsg("리뷰 내용을 붙여넣어 주세요.");
      return;
    }
    setBusy(true);
    setMsg("");
    setOk("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write",
          지점코드: branch,
          리뷰내용: review,
          별점: star,
          길이: len,
          말투: tone,
          키워드: picked,
          끝인사: ending,
          상호: realName,
          머리글: head,
          사실: facts,
          근처: near,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "답글을 만들지 못했습니다.");

      setOut({
        주제: json.주제 ?? [], 답글: json.답글,
        점검: json.점검 ?? [], 통과: json.통과 ?? 0, 전체: json.전체 ?? 0,
        사본: Boolean(json.사본),
        재료없음: Boolean(json.재료없음),
        플레이스없음: Boolean(json.플레이스없음),
      });
      setList((cur) => [
        {
          id: json.id, 지점코드: branch, 별점: star, 리뷰내용: review,
          주제: json.주제 ?? [], 답글: json.답글, 키워드: picked,
          말투: tone, 길이: len, 모델: "기본",
          등록일시: json.등록일시 ?? new Date().toISOString(), 등록자: p.me,
        },
        ...cur,
      ]);
    } catch (e: any) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "del", id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "지우지 못했습니다.");
      setList((cur) => cur.filter((r) => r.id !== id));
    } catch (e: any) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function doCopy(text: string, key: string) {
    const done = await copy(text);
    setCopied({ key, ok: done });
    setTimeout(() => setCopied(null), 2400);
  }

  /** 그 단추에 지금 무슨 글자가 적혀 있어야 하는가 */
  function copyLabel(key: string): string {
    if (copied?.key !== key) return "복사";
    return copied.ok ? "복사됨 ✓" : "복사 안 됨";
  }

  const copyFailed = copied && !copied.ok;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">리뷰 답글</h1>
          <p className="page-sub">AI가 쓴 초안입니다. 읽어보고 고쳐서 올려주세요.</p>
        </div>
      </div>

      {p.problem && <div className="alert-bad" style={{ marginBottom: 12 }}>{p.problem}</div>}

      {!p.hasKey && (
        <div className="warnbox" style={{ marginBottom: 12 }}>
          <b>AI 열쇠가 아직 없습니다</b>
          <p>
            Vercel → 이 프로젝트 → Settings → Environment Variables 에
            <b> ANTHROPIC_API_KEY </b>를 넣고 다시 배포하면 바로 됩니다.
            열쇠는 저에게 보내지 마시고 직접 넣어주세요.
          </p>
        </div>
      )}

      {p.branches.length > 1 && (
        <div className="bchips">
          {p.branches.map((b) => (
            <button key={b.code} type="button"
                    className={`bchip${branch === b.code ? " on" : ""}`}
                    onClick={() => setBranch(b.code)}>
              <span className="nm">{b.name}</span>
              <span className="am">{list.filter((r) => r.지점코드 === b.code).length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mcols phone-order" style={{ marginTop: 14 }}>
        {/* ── 만들기 ─────────────────────────── */}
        <div className="mcol">
          <div className="mcard ph-2">
            <div className="mcard-head">
              <b>답글 만들기</b>
              <span className="sub">
                오늘 {todays.length}/{limit}회 · 약 {wonToday.toLocaleString("ko-KR")}원
              </span>
            </div>

            <div className="field" style={{ marginBottom: 12 }}>
              <label>리뷰 — 오른쪽에서 고르시거나 새로 달린 리뷰를 붙여넣어 주세요</label>
              <textarea className="input area" rows={5} value={review}
                        placeholder="예) 처음 등록했는데 선생님이 자세 하나하나 봐주셔서 좋았어요. 다만 저녁시간엔 사람이 좀 많네요."
                        onChange={(e) => setReview(e.target.value)} />
            </div>

            <p className="csec">별점</p>
            <div className="pick-row" style={{ flexWrap: "wrap" }}>
              {[5, 4, 3, 2, 1].map((n) => (
                <button key={n} type="button"
                        className={`pickone${star === n ? " on" : ""}`}
                        onClick={() => pickStar(n)}>
                  <span className="nm">{stars(n)}</span>
                </button>
              ))}
            </div>

            <p className="csec">
              답글에 심을 키워드<span>고른 것 {picked.length}/5개</span>
            </p>
            <div className="pickbox">
              {candidates.map((w) => (
                <button key={w} type="button"
                        className={`pickone${picked.includes(w) ? " on" : ""}`}
                        onClick={() => toggleKw(w)}>
                  <span className="nm">{w}</span>
                </button>
              ))}
            </div>
            <div className="inline-form" style={{ marginTop: 8 }}>
              <input className="input" value={typing} placeholder="쓰고 싶은 말을 직접 넣기"
                     onChange={(e) => setTyping(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === "Enter") { e.preventDefault(); addKw(); }
                     }} />
              <button type="button" className="btn-ghost" onClick={addKw}>넣기</button>
            </div>

            {msg && <div className="alert-bad" style={{ marginTop: 12 }}>{msg}</div>}
            {ok && <div className="alert-soft" style={{ marginTop: 12 }}>{ok}</div>}

            {/* 몇 개 남았는지는 누르기 직전에 보여야 한다.
                카드 맨 위에만 두면 휴대폰에서는 스크롤에 묻혀 안 보인다 */}
            <p className={`left-line${left === 0 ? " out" : ""}`}>
              {left > 0 ? (
                <>
                  오늘 <b>{todays.length}/{limit}회</b> 썼습니다 · <b>{left}개</b> 더 만들 수 있어요
                  {wonToday > 0 && ` · 약 ${wonToday.toLocaleString("ko-KR")}원`}
                </>
              ) : (
                <>오늘 몫 <b>{limit}개</b>를 다 썼습니다 · 내일 다시 쓸 수 있어요</>
              )}
            </p>

            {/*
              재료가 없으면 누르기 전에 말한다

              눌러 놓고 나서 알려주면 하루 몫만 하나 깎인다. 그리고 재료 없이
              쓴 답글은 견본을 베껴서, 우리 지점에 없는 시설이 적힌다.
            */}
            {facts.length === 0 && (
              <p className="left-line out">
                {place.trim()
                  ? <>아직 <b>「불러오기」</b>를 안 누르셨습니다 — 네이버에서 시설을 긁어와야 그 지점 답글이 됩니다</>
                  : <>이 지점의 <b>플레이스 주소가 없습니다</b> — 아래 칸에 넣고 저장해주세요. 없으면 시설 없이 씁니다</>}
              </p>
            )}

            <button type="button" className="btn-dark" style={{ width: "100%", marginTop: 8 }}
                    disabled={busy || !p.can.create || !p.hasKey || !branch || left === 0}
                    onClick={make}>
              {busy
                ? "쓰는 중입니다…"
                : left === 0
                ? `오늘 한도(${limit}개)를 다 썼습니다`
                : "이 리뷰에 맞춘 답글 만들기"}
            </button>
            {!p.can.create && <p className="stat-note">답글을 만들 권한이 없는 계정입니다.</p>}
          </div>

          {out && (
            <div className="mcard ph-3">
              <div className="mcard-head">
                <b>방금 만든 답글</b>
                <span className="sub">{stars(star)}</span>
              </div>
              {out.주제.length > 0 && (
                <div className="chips" style={{ marginBottom: 10 }}>
                  {out.주제.map((t) => (
                    <span key={t} className="pill point">{t}</span>
                  ))}
                </div>
              )}
              {/* 답글은 문단으로 나뉘어 온다. 한 덩어리로 붙여 보여주면
                  올렸을 때 어떻게 보일지 알 수가 없다 */}
              {review.trim() && (
                <p className="rv-quote" style={{ marginTop: 0 }}>
                  <i>리뷰</i>
                  {review.trim()}
                </p>
              )}
              <div className="quote" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{out.답글}</div>

              {/* 380자로 뽑아달라고 시켜 두었다. 시켰으면 잰 것도 보여야 한다 —
                  안 그러면 어긋나도 아무도 모른다 */}
              {(() => {
                const n = [...out.답글].length;
                const ok = n >= 340 && n <= 430;
                return (
                  <p className="stat-note" style={{ margin: "8px 0 0" }}>
                    <span className={ok ? "pill good" : "pill warn"}>{n}자</span>{" "}
                    {ok ? "길이 알맞습니다 (380자 언저리)" : "380자 언저리가 목표입니다"}
                  </p>
                );
              })()}

              {/* 만들어만 주고 「잘 됐나 보세요」 하는 것과, 무엇이 빠졌는지
                  짚어 주는 것은 다르다. 진단 서버가 잰 결과를 그대로 보여준다 */}
              {out.전체 ? (
                <div className="csec" style={{ marginTop: 12 }}>
                  답글 점검
                  <span className={out.통과 === out.전체 ? "pill good" : "pill warn"}>
                    {out.통과} / {out.전체}
                  </span>
                </div>
              ) : null}
              {out.점검?.filter((r) => !r.ok).map((r) => (
                <p key={r.t} className="stat-note" style={{ margin: "2px 0 0" }}>
                  ○ {r.t}
                  {r.note ? ` — ${r.note}` : ""}
                </p>
              ))}

              <div className="who-acts" style={{ marginTop: 12 }}>
                <button type="button" className="btn-dark" onClick={() => doCopy(out.답글, "out")}>
                  <Icon name="clipboard" size={15} /> {copyLabel("out")}
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={make}>
                  다시 만들기
                </button>
              </div>
              {/*
                재료 없이 쓴 답글은 견본을 베낀다

                실제로 용곡점 답글에 쌍용점 견본의 「웨이트실과 프리웨이트실을
                아예 공간부터 분리해두었고」가 문장째 들어갔다. 우리 지점 시설이
                아닌데 그대로 올라가면 손님이 그걸 보고 찾아오신다.
                조용히 넘어갈 일이 아니라 답글 바로 위에서 말해야 한다.
              */}
              {out.재료없음 && (
                <div className="alert-bad" style={{ marginTop: 10 }}>
                  <b>네이버에서 가져온 시설 정보 없이 썼습니다.</b>{" "}
                  {out.플레이스없음
                    ? "이 지점의 플레이스 주소가 아직 없습니다. 아래 「답글 밀린 리뷰」 칸에 주소를 넣고 저장해주세요."
                    : "「불러오기」를 먼저 누르시면 네이버에서 시설을 긁어와 그 지점 것으로 씁니다."}
                  {" "}이대로 두면 답글에 <b>우리 지점에 없는 시설</b>이 적힐 수 있습니다 —
                  꼭 읽어보고 고쳐서 올려주세요.
                </div>
              )}
              <p className="stat-note">
                한 번 읽어보고 어색한 곳은 고쳐서 올려주세요.
                {out.사본 && (
                  <>
                    {" "}<b>진단 서버에 닿지 못해 대시보드에 둔 사본으로 썼습니다.</b>{" "}
                    견본은 같지만, 그쪽을 고치셨다면 반영이 안 됐을 수 있습니다.
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        {/* ── 밀린 리뷰 · 쌓인 답글 ───────────── */}
        <div className="mcol">
          <div className="mcard ph-1">
            <div className="mcard-head">
              <b>답글 밀린 리뷰</b>
              {open && <span className="sub">{open.length}개</span>}
              <button className="more" type="button" disabled={pulling || !p.hasPlace || !place}
                      onClick={pull}>
                {pulling ? "가져오는 중…" : "불러오기"}
              </button>
            </div>

            {place && !placeBox && (
              <p className="stat-note" style={{ margin: "0 0 4px" }}>
                플레이스 주소 등록됨
                <button type="button" className="linkish" onClick={() => setPlaceBox(true)}>
                  주소 고치기
                </button>
              </p>
            )}

            {(!place || placeBox) && (
              <>
                {saved && saved.length > 0 && (
                  <>
                    <p className="stat-note" style={{ margin: "0 0 4px" }}>
                      플레이스 도구에 저장해 두신 가게입니다. 이 지점 것을 눌러주세요.
                    </p>
                    <ul className="findlist">
                      {saved.map((x) => (
                        <li key={x.id}>
                          <button type="button" onClick={() => { setPlace(x.placeId); setFound(null); }}>
                            <b className="nm">{x.name}</b>
                            <span className="mt">
                              {x.at ? `${x.at} 저장` : "저장 기록"}
                              {x.score !== null ? ` · 진단 ${x.score}점` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {saved !== null && saved.length === 0 && (
                  <p className="stat-note" style={{ margin: "0 0 4px" }}>
                    {savedErr
                      ? savedErr
                      : "플레이스 도구에 저장해 둔 가게가 없습니다. 도구에서 지점을 진단하고 「저장」을 눌러두시면 여기에 뜹니다. 그동안은 아래에서 이름으로 찾으세요."}
                  </p>
                )}

                <div className="inline-form" style={{ marginBottom: 4 }}>
                  <input className="input" value={q}
                         placeholder={`이름으로 찾기 (예: ${branchName})`}
                         onChange={(e) => setQ(e.target.value)}
                         onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); findPlace(); } }} />
                  <button type="button" className="btn-ghost"
                          disabled={finding || !p.hasPlace || (!p.can.update && !p.can.create)}
                          onClick={findPlace}>
                    {finding ? "찾는 중…" : "찾기"}
                  </button>
                </div>

                {found && found.length > 0 && (
                  <ul className="findlist">
                    {found.map((x) => (
                      <li key={x.id}>
                        <button type="button" onClick={() => { setPlace(x.id); setFound(null); }}>
                          <b className="nm">{x.name}</b>
                          <span className="ad">{x.address || "주소 없음"}</span>
                          <span className="mt">
                            {x.category || "분류 없음"}
                            {x.reviews ? ` · 리뷰 ${x.reviews.toLocaleString("ko-KR")}개` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <div className="inline-form" style={{ marginBottom: 4,
                                                  display: place && !placeBox ? "none" : "flex" }}>
              <input className="input" value={place}
                     placeholder="네이버 플레이스 주소나 ID (예: 11716617)"
                     onChange={(e) => setPlace(e.target.value)} />
              <button type="button" className="btn-ghost"
                      disabled={saving || (!p.can.update && !p.can.create)}
                      onClick={async () => {
                        if (saving) return;
                        setSaving(true);
                        setNote(null);
                        const r = await keep({ 플레이스ID: place });
                        setNote(
                          r.ok
                            ? { bad: false, text: "저장했습니다. 이제 「불러오기」를 눌러보세요." }
                            : { bad: true, text: r.error }
                        );
                        if (r.ok) setPlaceBox(false);
                        setSaving(false);
                      }}>
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>

            {note && (
              <div className={note.bad ? "alert-bad" : "alert-soft"} style={{ margin: "8px 0 4px" }}>
                {note.text}
              </div>
            )}

            {!p.hasPlace ? (
              <p className="stat-note">
                진단 서버 주소가 아직 없습니다. Vercel 환경변수에 <b>PLACE_API_BASE</b> 와{" "}
                <b>PLACE_API_KEY</b> 를 넣으면 이 칸이 살아납니다.
              </p>
            ) : !place ? (
              <p className="stat-note">
                {branchName}의 플레이스 주소를 위 칸에 넣고 저장해주세요. 지점마다 따로 저장됩니다.
              </p>
            ) : open === null ? (
              <p className="stat-note">
                「불러오기」를 누르면 네이버에서 <b>답글이 안 달린 리뷰</b>만 골라 옵니다.
                무료 서버라 자고 있으면 처음 한 번은 30~60초 걸립니다.
              </p>
            ) : open.length === 0 ? (
              <p className="empty">답글이 안 달린 리뷰가 없습니다.</p>
            ) : (
              open.map((r, i) => {
                const done = madeKeys.has(keyOf(r.body));
                return (
                  <div key={i} className="mrow">
                    <div className="t">
                      <b>{stars(r.rating ?? 0) || "별점 없음"}</b>
                      <span className="dim">{r.date}</span>
                    </div>
                    <p className="ntext" style={{ margin: "6px 0 0" }}>{r.body}</p>
                    <div className="who-acts" style={{ margin: "8px 0 0" }}>
                      <button type="button" className={done ? "btn-ghost" : "btn-dark"}
                              style={{ flex: "0 0 auto" }} onClick={() => take(r)}>
                        {done ? "다시 만들기" : "이 리뷰에 답글"}
                      </button>
                      {done && <span className="pill good">만듦</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/*
            우리 지점만 아는 것

            답글이 밋밋한 이유는 대개 재료가 없어서다. 네이버에서 긁어오면
            시설 이름과 리뷰 수까지는 들어오는데, 그건 옆 헬스장도 똑같이 있다.
            여기 적는 것이 「다른 헬스장에도 붙는 글」과 「우리 글」을 가른다.

            한 번 적어 두면 그 지점 답글은 계속 이걸 쓴다. 접어 두는 이유는
            자주 고칠 칸이 아니어서다 — 늘 펼쳐 두면 「불러오기」가 그만큼 밀린다.
          */}
          <div className="mcard ph-5">
            <div className="mcard-head">
              <b>우리 {branchName}만 아는 것</b>
              <span className="sub">
                {[fac.length && `시설 ${fac.length}`, price && "가격", edge && "다른 점",
                  ownLines.length && `사실 ${ownLines.length}`].filter(Boolean).join(" · ") || "아직 없음"}
              </span>
              <button className="more" type="button" onClick={() => setOwnBox(!ownBox)}>
                {ownBox ? "접기" : "펴기"}
              </button>
            </div>

            {!ownBox ? (
              <p className="stat-note" style={{ margin: 0 }}>
                {ownLines.length || fac.length
                  ? "적어 두신 것이 답글 재료로 들어갑니다."
                  : "네이버가 모르는 것을 적어 두면 답글이 눈에 띄게 달라집니다. 「펴기」를 눌러주세요."}
              </p>
            ) : (
              <>
                <p className="csec">보유 시설<span>체크한 것만 답글에 쓸 수 있습니다</span></p>
                <div className="pickbox">
                  {FACILITIES.map((f) => (
                    <button key={f} type="button"
                            className={`pickone${fac.includes(f) ? " on" : ""}`}
                            onClick={() => setFac(fac.includes(f)
                              ? fac.filter((x) => x !== f) : [...fac, f])}>
                      <span className="nm">{f}</span>
                    </button>
                  ))}
                </div>

                <p className="csec">1개월 이용권 가격<span>비워두셔도 됩니다</span></p>
                <input className="input" value={price} placeholder="예) 89,000원"
                       onChange={(e) => setPrice(e.target.value)} />

                <p className="csec">다른 헬스장과 다른 점 한 줄</p>
                <input className="input" value={edge}
                       placeholder="예) 순천향병원 3교대 근무자가 야간에 편하게 오는 곳"
                       onChange={(e) => setEdge(e.target.value)} />

                <p className="csec">
                  우리만 아는 사실<span>한 줄에 하나씩 · {ownLines.length}/{OWN_MAX}줄</span>
                </p>
                <textarea className="input area" rows={5} value={own}
                          placeholder={"한 줄에 하나씩 적으세요\n예) 2026년으로 28년째 운영 중입니다\n예) 트레이너 4명 모두 생활스포츠지도사 2급 이상\n예) 순천향병원 3교대 근무자 회원이 많습니다"}
                          onChange={(e) => setOwn(e.target.value)} />
                <p className="stat-note" style={{ margin: "6px 0 0" }}>
                  <b>네이버가 모르는 것만 적으세요.</b> 시설·가격·리뷰 수는 「불러오기」로 이미 들어옵니다.
                  개업 연차, 트레이너 수와 자격, 회원 구성, 주변 직장 — 이런 것이 답글을 다른 헬스장이
                  흉내 못 내는 글로 만듭니다. <b>여기 적은 것은 그대로 답글에 실리니 사실만 적어주세요.</b>
                </p>

                <div className="who-acts" style={{ marginTop: 10 }}>
                  <button type="button" className="btn-dark" style={{ flex: "0 0 auto" }}
                          disabled={ownSaving || (!p.can.update && !p.can.create)}
                          onClick={async () => {
                            if (ownSaving) return;
                            setOwnSaving(true);
                            setOwnNote(null);
                            const r = await keep({
                              시설: fac, 가격: price, 차별점: edge, 우리만아는사실: own,
                            });
                            setOwnNote(r.ok
                              ? { bad: false, text: "저장했습니다. 다음 답글부터 이걸 재료로 씁니다." }
                              : { bad: true, text: r.error });
                            setOwnSaving(false);
                          }}>
                    {ownSaving ? "저장 중…" : "저장"}
                  </button>
                  {ownNote && (
                    <span className={ownNote.bad ? "pill bad" : "pill good"}>{ownNote.text}</span>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="mcard ph-4">
            <div className="mcard-head">
              <b>만든 답글</b>
              <span className="sub">{mine.length}개</span>
            </div>

            {copyFailed && (
              <div className="alert-bad" style={{ marginBottom: 10 }}>
                이 브라우저가 복사를 막았습니다. 「전체 보기」를 누른 뒤 글을 끌어서 복사해주세요.
              </div>
            )}

            {mine.length === 0 ? (
              <p className="empty">아직 만든 답글이 없습니다.</p>
            ) : (
              mine.map((r) => {
                const isOpen = shown === r.id;
                return (
                  <div key={r.id} className="mrow">
                    <div className="t">
                      <b>{stars(r.별점) || "별점 없음"}</b>
                      <span className="dim">{when(r.등록일시)}</span>
                    </div>
                    {r.주제.length > 0 && (
                      <span className="sub">읽어낸 주제 · {r.주제.join(" · ")}</span>
                    )}

                    {/* 답글만 보이면 어느 리뷰에 단 것인지 알 수 없다.
                        붙여넣은 리뷰를 답글 바로 위에 둔다 */}
                    {r.리뷰내용 && (
                      <p className="rv-quote">
                        <i>리뷰</i>
                        {isOpen || r.리뷰내용.length <= 70
                          ? r.리뷰내용
                          : r.리뷰내용.slice(0, 70) + "…"}
                      </p>
                    )}

                    <p className="ntext" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                      <i className="rv-tag">답글</i>
                      {isOpen || r.답글.length <= 90 ? r.답글 : r.답글.slice(0, 90) + "…"}
                    </p>
                    <div className="who-acts" style={{ margin: "8px 0 0" }}>
                      <button type="button"
                              className={`btn-ghost${copied?.key === r.id && copied.ok ? " ok" : ""}`}
                              onClick={() => doCopy(r.답글, r.id)}>
                        {copyLabel(r.id)}
                      </button>
                      {(r.답글.length > 90 || r.리뷰내용.length > 70) && (
                        <button type="button" className="btn-ghost"
                                onClick={() => setShown(isOpen ? null : r.id)}>
                          {isOpen ? "접기" : "전체 보기"}
                        </button>
                      )}
                      {p.can.remove && (
                        <button type="button" className="btn-ghost danger" disabled={busy}
                                onClick={() => remove(r.id)}>
                          지우기
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <p className="stat-note" style={{ margin: "8px 0 0" }}>
                        {nameOf.get(r.등록자) ?? r.등록자} 님이 만듦
                        {r.말투 && ` · ${r.말투}`}
                        {r.키워드.length > 0 && ` · 키워드 ${r.키워드.join(", ")}`}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
