"use client";

/**
 * 리뷰 답글
 *
 * 왼쪽에서 만들고, 오른쪽에 쌓인다. 만든 답글은 전부 시트에 남으므로
 * 나중에 다른 사람이 열어도 "저번에 뭐라고 답했더라" 를 찾을 수 있다.
 *
 * AI 가 쓴 것은 초안이다. 그대로 올리라고 만들지 않았다 —
 * 복사해서 읽어보고 고쳐 올리는 것을 전제로 한다.
 */
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import {
  LENGTHS, TONES, MODELS, ENDINGS, keywordsFor, suggestTone,
} from "@/lib/reviewMeta";

type Named = { code: string; name: string };
type Person = { id: string; name: string };
type Reply = {
  id: string; 지점코드: string; 별점: number; 리뷰내용: string;
  주제: string[]; 답글: string; 키워드: string[]; 말투: string; 길이: string;
  등록일시: string; 등록자: string;
};

type Props = {
  me: string;
  myBranch: string;
  branches: Named[];
  people: Person[];
  replies: Reply[];
  can: { create: boolean; remove: boolean };
  /** AI 열쇠가 꽂혀 있는지 — 없으면 눌러도 안 되니 미리 알려준다 */
  hasKey: boolean;
  limit: number;
  problem: string;
};

/** 별을 글자로 — 숫자보다 눈에 빨리 들어온다 */
function stars(n: number): string {
  if (!n) return "";
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

function when(s: string): string {
  const d = (s ?? "").slice(0, 16).replace("T", " ");
  return d || "";
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
  /** 화면에서 직접 더 넣은 키워드 — 지점마다 따로 기억한다 */
  const [extra, setExtra] = useState<string[]>([]);
  const [typing, setTyping] = useState("");

  const [list, setList] = useState<Reply[]>(p.replies);
  const [out, setOut] = useState<{ 주제: string[]; 답글: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [open, setOpen] = useState<string | null>(null);

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

  /* 지점을 바꾸면 그 지점에서 쓰던 키워드를 다시 꺼내온다 */
  useEffect(() => {
    if (!branch) return;
    let saved: string[] = [];
    let mine: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(`rv_kw_${branch}`) ?? "[]");
      mine = JSON.parse(localStorage.getItem(`rv_add_${branch}`) ?? "[]");
    } catch {
      /* 저장된 것이 깨졌으면 그냥 비운다 */
    }
    setExtra(Array.isArray(mine) ? mine : []);
    setPicked(Array.isArray(saved) && saved.length ? saved : keywordsFor(branchName).slice(0, 1));
    setOut(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  const remember = (next: string[], adds?: string[]) => {
    try {
      localStorage.setItem(`rv_kw_${branch}`, JSON.stringify(next));
      if (adds) localStorage.setItem(`rv_add_${branch}`, JSON.stringify(adds));
    } catch {
      /* 저장이 막혀 있어도 화면은 그대로 쓸 수 있어야 한다 */
    }
  };

  const toggleKw = (w: string) => {
    setPicked((cur) => {
      const has = cur.includes(w);
      if (!has && cur.length >= 5) {
        setMsg("키워드는 다섯 개까지만 넣을 수 있습니다. 많이 넣으면 광고처럼 읽힙니다.");
        return cur;
      }
      const next = has ? cur.filter((x) => x !== w) : [...cur, w];
      setMsg("");
      remember(next);
      return next;
    });
  };

  const addKw = () => {
    const w = typing.trim();
    if (!w) return;
    if (candidates.includes(w)) {
      setTyping("");
      if (!picked.includes(w)) toggleKw(w);
      return;
    }
    const adds = [...extra, w];
    setExtra(adds);
    setTyping("");
    const next = picked.length < 5 ? [...picked, w] : picked;
    setPicked(next);
    remember(next, adds);
  };

  /* 별점이 낮으면 말투를 먼저 「사과 중심」으로 돌려둔다 — 그대로 두면 불난 데 부채질이다 */
  const pickStar = (n: number) => {
    setStar(n);
    setTone(suggestTone(n));
  };

  const mine = useMemo(() => list.filter((r) => r.지점코드 === branch), [list, branch]);
  const usedToday = useMemo(() => {
    const day = new Date().toISOString().slice(0, 10);
    return mine.filter((r) => (r.등록일시 ?? "").startsWith(day)).length;
  }, [mine]);

  const nameOf = useMemo(() => new Map(p.people.map((x) => [x.id, x.name])), [p.people]);

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
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "답글을 만들지 못했습니다.");

      setOut({ 주제: json.주제 ?? [], 답글: json.답글 });
      setList((cur) => [
        {
          id: json.id, 지점코드: branch, 별점: star, 리뷰내용: review,
          주제: json.주제 ?? [], 답글: json.답글, 키워드: picked,
          말투: tone, 길이: len, 등록일시: json.등록일시 ?? new Date().toISOString(),
          등록자: p.me,
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
            손님이 남긴 리뷰를 붙여넣으면 답글 초안을 만들어 드립니다.
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
                오늘 {usedToday}/{p.limit}회 · {branchName}
              </span>
            </div>

            <div className="field" style={{ marginBottom: 12 }}>
              <label>새로 올라온 리뷰를 붙여넣어 주세요</label>
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

            <p className="csec">답글 끝인사</p>
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
                  <span className="dim">{x.hint}</span>
                </button>
              ))}
            </div>

            {msg && <div className="alert-bad" style={{ marginTop: 12 }}>{msg}</div>}
            {ok && <div className="alert-soft" style={{ marginTop: 12 }}>{ok}</div>}

            <button type="button" className="btn-dark" style={{ width: "100%", marginTop: 14 }}
                    disabled={busy || !p.can.create || !p.hasKey || !branch}
                    onClick={make}>
              {busy ? "쓰는 중입니다…" : "이 리뷰에 맞춘 답글 만들기"}
            </button>
            {!p.can.create && (
              <p className="stat-note">답글을 만들 권한이 없는 계정입니다.</p>
            )}
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

        {/* ── 쌓인 답글 ───────────────────────── */}
        <div className="mcol">
          <div className="mcard">
            <div className="mcard-head">
              <b>만든 답글</b>
              <span className="sub">{mine.length}개</span>
            </div>

            {mine.length === 0 ? (
              <p className="empty">아직 만든 답글이 없습니다.</p>
            ) : (
              mine.map((r) => {
                const isOpen = open === r.id;
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
                                onClick={() => setOpen(isOpen ? null : r.id)}>
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
