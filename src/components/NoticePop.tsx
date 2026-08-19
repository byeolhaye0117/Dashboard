"use client";

/**
 * 공지 팝업
 *
 * ── 왜 있는가 ────────────────────────────────────────────────
 * 공지는 「가서 보는 것」이 아니라 「와서 알려주는 것」이라야 한다. 공지
 * 화면에 들어가야만 보이면, 안 들어가는 사람은 평생 못 본다. 그래서 어느
 * 화면을 열든 안 읽은 공지가 있으면 여기서 먼저 말한다.
 *
 * ── 지키려 한 것 ────────────────────────────────────────────
 * 1. 화면을 막지 않는다. 이 조각은 화면이 다 그려진 뒤에 따로 물어본다.
 *    공지 하나 때문에 매일 쓰는 회원 화면이 늦게 뜨면 안 된다.
 * 2. 못 불러오면 아무 말도 안 한다. 공지를 못 읽어 온 것 때문에 붉은
 *    글씨가 뜨면 정작 해야 할 일을 못 한다.
 * 3. 「확인했습니다」를 눌러야 읽음으로 남는다. 「나중에」는 이번 화면에서만
 *    닫고, 다음에 다시 뜬다 — 바쁠 때 미룰 자리는 있어야 하지만, 미룬 것이
 *    읽은 것이 되면 안 된다.
 */
import { useEffect, useState } from "react";

type Item = {
  id: string;
  제목: string;
  내용: string;
  중요: boolean;
  게시일: string;
  마감일: string;
};

export default function NoticePop() {
  const [items, setItems] = useState<Item[]>([]);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/notices/popup")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        if (alive && Array.isArray(d.items)) setItems(d.items);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const cur = items[at];
  if (!cur) return null;

  /** 이 공지를 닫고 다음 것으로 — 마지막이면 팝업이 사라진다 */
  const next = () => setAt((i) => i + 1);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", 공지번호: cur.id }),
      });
    } catch {
      /* 못 남겨도 넘어간다. 여기서 막으면 공지를 읽고도 화면을 못 쓴다 —
         읽음이 안 남았으면 다음에 다시 뜰 뿐이다 */
    }
    setBusy(false);
    next();
  }

  return (
    <div className="modal-back">
      {/*
        넓게 연다

        공지는 문단으로 적히는 글이다. 좁은 창에 넣으면 한 문장이 네 줄로
        접혀 읽기가 힘들고, 그 때문에 스크롤까지 생겨 아래 문단이 있는지도
        모르게 된다.
      */}
      <div className="modal wide np" onClick={(e) => e.stopPropagation()}>
        <div className="np-top">
          {cur.중요 && <span className="pill bad">중요</span>}
          {items.length > 1 && (
            <span className="np-count num">
              {at + 1} / {items.length}
            </span>
          )}
        </div>

        <h3>{cur.제목}</h3>
        <p className="page-sub" style={{ margin: "2px 0 12px" }}>
          {cur.게시일}
          {cur.마감일 ? ` ~ ${cur.마감일}` : ""}
        </p>

        {/* 줄바꿈을 그대로 살린다. 공지는 문단으로 적히는 글이다 */}
        <div className="np-body">{cur.내용 || "내용이 없습니다."}</div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={next} disabled={busy}>
            나중에
          </button>
          <button className="btn-dark" onClick={confirm} disabled={busy}>
            {busy ? "남기는 중…" : "확인했습니다"}
          </button>
        </div>

        <p className="stat-note">
          <b>확인했습니다</b>를 누르면 읽음으로 남고 다시 뜨지 않습니다.{" "}
          <b>나중에</b>는 이번 화면에서만 닫히고 다음에 다시 뜹니다.
        </p>
      </div>
    </div>
  );
}
