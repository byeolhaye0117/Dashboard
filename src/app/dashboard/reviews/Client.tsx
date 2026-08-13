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
import {
  LENGTHS, TONES, MODELS, ENDINGS, keywordsFor, suggestTone, modelWon,
  LIMIT_MIN, LIMIT_MAX,
} from "@/lib/reviewMeta";

type Named = { code: string; name: string };
type Person = { id: string; name: string };
type Reply = {
  id: string; 지점코드: string; 별점: number; 리뷰내용: string;
  주제: string[]; 답글: string; 키워드: string[]; 말투: string; 길이: string;
  모델: string; 등록일시: string; 등록자: string;
};
type Setting = {
  지점코드: string; 플레이스ID: string; 키워드: string[]; 끝인사: string; 하루한도: number;
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
  const [len, setLen] = useState("중간");
  const [tone, setTone] = useState("정중");
  const [model, setModel] = useState("빠름");
  const [ending, setEnding] = useState(ENDINGS[0]);
  const [picked, setPicked] = useState<string[]>([]);
  /** 화면에서 직접 더 넣은 키워드 */
  const [extra, setExtra] = useState<string[]>([]);
  const [typing, setTyping] = useState("");

  /** 지점별 플레이스 주소 */
  const [place, setPlace] = useState("");
  const [open, setOpen] = useState<OpenReview[] | null>(null);
  const [facts, setFacts] = useState<string[]>([]);
  const [near, setNear] = useState<string[]>([]);
  const [pulling, setPulling] = useState(false);
  /* 저장 결과는 누른 단추 바로 옆에 보여야 한다 — 반대편 기둥에 띄우면 못 본다 */
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null);

  /* 하루 한도 — 지점마다 따로. 화면에서 바로 고친다 */
  const [limit, setLimit] = useState(p.limit);
  const [limitBox, setLimitBox] = useState(false);
  const [limitVal, setLimitVal] = useState(String(p.limit));
  const [limitNote, setLimitNote] = useState<{ bad: boolean; text: string } | null>(null);

  const [list, setList] = useState<Reply[]>(p.replies);
  const [out, setOut] = useState<{ 주제: string[]; 답글: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [shown, setShown] = useState<string | null>(null);

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
    setEnding(s?.끝인사 ?? ENDINGS[0]);
    const saved = s?.키워드 ?? [];
    const base = keywordsFor(branchName);
    setExtra(saved.filter((w) => !base.includes(w)));
    setPicked(saved.length ? saved : base.slice(0, 1));
    setOpen(null);
    setFacts([]);
    setNear([]);
    setOut(null);
    setMsg("");
    setNote(null);
    const l = s?.하루한도 || p.limit;
    setLimit(l);
    setLimitVal(String(l));
    setLimitBox(false);
    setLimitNote(null);
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

  /* 별점이 낮으면 말투를 먼저 「사과 중심」으로 돌려둔다 — 그대로 두면 불난 데 부채질이다.
     같이 「좋은 것」 AI 로도 넘긴다. 말의 결을 읽어야 하는 자리라 값 차이가 값어치를 한다. */
  const pickStar = (n: number) => {
    setStar(n);
    setTone(suggestTone(n));
    if (n <= 2) setModel("꼼꼼");
  };

  const mine = useMemo(() => list.filter((r) => r.지점코드 === branch), [list, branch]);
  const madeKeys = useMemo(() => new Set(mine.map((r) => keyOf(r.리뷰내용))), [mine]);

  /* 오늘 몇 번, 얼마쯤 — 얼마짜리 단추인지 모르고 누르는 것보다 낫다 */
  const todays = useMemo(() => {
    const day = new Date().toISOString().slice(0, 10);
    return mine.filter((r) => (r.등록일시 ?? "").startsWith(day));
  }, [mine]);
  const wonToday = useMemo(
    () => todays.reduce((s, r) => s + modelWon(r.모델 || "빠름"), 0),
    [todays]
  );

  const nameOf = useMemo(() => new Map(p.people.map((x) => [x.id, x.name])), [p.people]);
  const left = Math.max(0, limit - todays.length);

  async function saveLimit() {
    if (saving) return;
    const n = Math.floor(Number(limitVal));
    if (!Number.isFinite(n) || n < LIMIT_MIN || n > LIMIT_MAX) {
      setLimitNote({ bad: true, text: `${LIMIT_MIN}에서 ${LIMIT_MAX} 사이로 넣어주세요.` });
      return;
    }
    setSaving(true);
    setLimitNote(null);
    const r = await keep({ 하루한도: n });
    if (r.ok) {
      setLimit(n);
      setLimitNote({ bad: false, text: `하루 ${n}개로 정했습니다.` });
    } else {
      setLimitNote({ bad: true, text: r.error });
    }
    setSaving(false);
  }

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
          모델: model,
          사실: facts,
          근처: near,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "답글을 만들지 못했습니다.");

      setOut({ 주제: json.주제 ?? [], 답글: json.답글 });
      setList((cur) => [
        {
          id: json.id, 지점코드: branch, 별점: star, 리뷰내용: review,
          주제: json.주제 ?? [], 답글: json.답글, 키워드: picked,
          말투: tone, 길이: len, 모델: model,
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

  async function doCopy(text: string) {
    const done = await copy(text);
    setOk(done ? "복사했습니다. 플레이스에 붙여넣어 주세요." : "복사가 막혔습니다. 글을 직접 끌어서 복사해주세요.");
    setMsg("");
    setTimeout(() => setOk(""), 3000);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">리뷰 답글</h1>
          <p className="page-sub">
            답글이 안 달린 리뷰를 찾아와 답글 초안을 만들어 드립니다.
            그대로 올리지 마시고 한 번 읽어보고 고쳐서 올려주세요.
          </p>
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

      <div className="mcols" style={{ marginTop: 14 }}>
        {/* ── 만들기 ─────────────────────────── */}
        <div className="mcol">
          <div className="mcard">
            <div className="mcard-head">
              <b>답글 만들기</b>
              <span className="sub">
                오늘 {todays.length}/{limit}회 · 약 {wonToday.toLocaleString("ko-KR")}원
              </span>
            </div>

            {/* 몇 개 남았는지가 먼저다 — 쓴 개수보다 남은 개수가 궁금한 자리다 */}
            <p className="stat-note" style={{ marginTop: -4 }}>
              {left > 0 ? (
                <>
                  오늘 <b>{left}개</b> 더 만들 수 있습니다. 하루 한도는 <b>{limit}개</b>입니다.
                </>
              ) : (
                <b>오늘 한도({limit}개)를 다 썼습니다. 내일 다시 쓸 수 있습니다.</b>
              )}
              {(p.can.update || p.can.create) && (
                <button type="button" className="linkish"
                        onClick={() => { setLimitBox(!limitBox); setLimitNote(null); }}>
                  {limitBox ? "닫기" : "한도 고치기"}
                </button>
              )}
            </p>

            {limitBox && (
              <div style={{ marginBottom: 12 }}>
                <div className="inline-form">
                  <input className="input" type="number" min={LIMIT_MIN} max={LIMIT_MAX}
                         value={limitVal} onChange={(e) => setLimitVal(e.target.value)} />
                  <button type="button" className="btn-ghost" disabled={saving}
                          onClick={saveLimit}>
                    {saving ? "저장 중…" : "한도 저장"}
                  </button>
                </div>
                {limitNote && (
                  <div className={limitNote.bad ? "alert-bad" : "alert-soft"}
                       style={{ marginTop: 8 }}>
                    {limitNote.text}
                  </div>
                )}
                <p className="stat-note">
                  {LIMIT_MIN}~{LIMIT_MAX} 사이로 넣어주세요. <b>지점마다 따로</b> 걸립니다 —
                  여기서 정한 값은 {branchName}에만 적용됩니다.
                  「기본」으로 {limit}개면 하루 약 {(limit * 10).toLocaleString("ko-KR")}원,
                  「좋은 것」으로만 쓰면 약 {(limit * 50).toLocaleString("ko-KR")}원입니다.
                </p>
              </div>
            )}

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

            <p className="csec">답글 길이</p>
            <div className="pick-row" style={{ flexWrap: "wrap" }}>
              {LENGTHS.map((x) => (
                <button key={x.v} type="button"
                        className={`pickone${len === x.v ? " on" : ""}`}
                        onClick={() => setLen(x.v)}>
                  <span className="nm">{x.label}</span>
                  <span className="dim">{x.hint}</span>
                </button>
              ))}
            </div>

            <p className="csec">
              말투
              {star <= 3 && <span>별점이 낮아 「사과 중심」을 권합니다</span>}
            </p>
            <div className="pick-row" style={{ flexWrap: "wrap" }}>
              {TONES.map((x) => (
                <button key={x.v} type="button"
                        className={`pickone${tone === x.v ? " on" : ""}`}
                        onClick={() => setTone(x.v)}>
                  <span className="nm">{x.label}</span>
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

            <p className="csec">답글 끝인사<span>한 번 정해두면 모든 답글 끝에 붙습니다</span></p>
            <div className="pick-row" style={{ flexWrap: "wrap" }}>
              {ENDINGS.map((x) => (
                <button key={x} type="button"
                        className={`pickone${ending === x ? " on" : ""}`}
                        onClick={() => setEnding(x)}>
                  <span className="nm">{x}</span>
                </button>
              ))}
              <button type="button" className={`pickone${ending === "" ? " on" : ""}`}
                      onClick={() => setEnding("")}>
                <span className="nm">넣지 않기</span>
              </button>
            </div>
            <input className="input" style={{ marginTop: 8 }} value={ending}
                   placeholder="끝인사를 직접 쓰셔도 됩니다"
                   onChange={(e) => setEnding(e.target.value)} />

            <p className="csec">AI</p>
            <div className="pick-row" style={{ flexWrap: "wrap" }}>
              {MODELS.map((x) => (
                <button key={x.v} type="button"
                        className={`pickone${model === x.v ? " on" : ""}`}
                        onClick={() => setModel(x.v)}>
                  <span className="nm">{x.label}</span>
                  <span className="dim">{x.hint} · 약 {x.won}원</span>
                </button>
              ))}
            </div>
            <p className="stat-note">
              <b>불만 리뷰(별 1~2개)나 비꼬는 리뷰는 「좋은 것」을 쓰세요.</b> 말의 결을 읽어야 하는
              자리라 값 차이가 값어치를 합니다. 칭찬 리뷰는 「기본」으로 충분합니다.
              금액은 어림값이니 몇 번 써 보시고 콘솔 잔액으로 확인해 주세요.
            </p>

            {facts.length > 0 && (
              <p className="stat-note">
                이 지점에서 확인된 사실 <b>{facts.length}가지</b>를 답글 재료로 씁니다 —{" "}
                {facts.slice(0, 3).join(" · ")}
                {facts.length > 3 && " …"}
              </p>
            )}

            {msg && <div className="alert-bad" style={{ marginTop: 12 }}>{msg}</div>}
            {ok && <div className="alert-soft" style={{ marginTop: 12 }}>{ok}</div>}

            <button type="button" className="btn-dark" style={{ width: "100%", marginTop: 14 }}
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
            <div className="mcard">
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
              <div className="quote" style={{ margin: 0 }}>{out.답글}</div>
              <div className="who-acts" style={{ marginTop: 12 }}>
                <button type="button" className="btn-dark" onClick={() => doCopy(out.답글)}>
                  <Icon name="clipboard" size={15} /> 복사
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={make}>
                  다시 만들기
                </button>
              </div>
              <p className="stat-note">
                한 번 읽어보고 어색한 곳은 고쳐서 올려주세요. 만든 답글은 오른쪽에 쌓입니다.
              </p>
            </div>
          )}
        </div>

        {/* ── 밀린 리뷰 · 쌓인 답글 ───────────── */}
        <div className="mcol">
          <div className="mcard">
            <div className="mcard-head">
              <b>답글 밀린 리뷰</b>
              {open && <span className="sub">{open.length}개</span>}
              <button className="more" type="button" disabled={pulling || !p.hasPlace || !place}
                      onClick={pull}>
                {pulling ? "가져오는 중…" : "불러오기"}
              </button>
            </div>

            <div className="inline-form" style={{ marginBottom: 4 }}>
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

          <div className="mcard">
            <div className="mcard-head">
              <b>만든 답글</b>
              <span className="sub">{mine.length}개</span>
            </div>

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
                    <p className="ntext" style={{ margin: "6px 0 0" }}>
                      {isOpen || r.답글.length <= 90 ? r.답글 : r.답글.slice(0, 90) + "…"}
                    </p>
                    <div className="who-acts" style={{ margin: "8px 0 0" }}>
                      <button type="button" className="btn-ghost" onClick={() => doCopy(r.답글)}>
                        복사
                      </button>
                      {r.답글.length > 90 && (
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
                      <div className="quote" style={{ marginTop: 10 }}>
                        <b>붙여넣은 리뷰</b>
                        <br />
                        {r.리뷰내용}
                        <br />
                        <span className="dim">
                          {nameOf.get(r.등록자) ?? r.등록자} 님이 만듦
                          {r.키워드.length > 0 && ` · 키워드 ${r.키워드.join(", ")}`}
                        </span>
                      </div>
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
