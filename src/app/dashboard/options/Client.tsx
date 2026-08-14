"use client";

/**
 * 목록 관리
 *
 * 왼쪽에서 어느 목록인지 고르고, 오른쪽에서 값을 더하거나 고친다.
 * 한 번에 한 목록만 다룬다 — 전부 펼치면 백 줄이 넘어 어디를 고쳤는지
 * 본인도 모르게 된다. 권한 화면과 같은 얼개다.
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";

type Row = { 줄: number; 구분: string; 값: string; 정렬순서: number; 씀: boolean };

type Props = {
  rows: Row[];
  /** 이 목록이 어느 화면에서 쓰이는지 */
  used: Record<string, string>;
  canEdit: boolean;
};

export default function Client(p: Props) {
  const 구분들 = useMemo(() => {
    const set = new Set(p.rows.map((r) => r.구분));
    /* 아직 한 줄도 없는 목록도 만들 수 있어야 한다 */
    Object.keys(p.used).forEach((k) => set.add(k));
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [p.rows, p.used]);

  const [pick, setPick] = useState(구분들[0] ?? "");
  const [typing, setTyping] = useState("");
  const [edit, setEdit] = useState<{ 줄: number; 값: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const mine = p.rows.filter((r) => r.구분 === pick);

  async function send(body: any) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusy(false);
        return setMsg(data.error ?? "저장하지 못했습니다.");
      }
      location.reload();
    } catch (e: any) {
      setBusy(false);
      setMsg(String(e?.message ?? e));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">목록 관리</h1>
          <p className="page-sub">
            회원 · 상담 화면에서 고르게 되어 있는 값들입니다. 여기서 고치면 그 화면이 바로 바뀝니다.
          </p>
        </div>
      </div>

      {/* 어느 목록인가 */}
      <div className="bchips">
        {구분들.map((k) => (
          <button key={k} className={`bchip${pick === k ? " on" : ""}`}
                  onClick={() => { setPick(k); setEdit(null); setMsg(""); }}>
            <span className="nm">{k}</span>
            <span className="am num">{p.rows.filter((r) => r.구분 === k).length}개</span>
          </button>
        ))}
      </div>

      {p.used[pick] && (
        <p className="stat-note" style={{ marginTop: 10 }}>
          {p.used[pick]}
        </p>
      )}

      {p.canEdit && (
        <div className="inline-form" style={{ margin: "12px 0" }}>
          <input className="input" value={typing} placeholder={`${pick} 목록에 넣을 값`}
                 onChange={(e) => setTyping(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === "Enter" && typing.trim()) {
                     e.preventDefault();
                     send({ action: "add", 구분: pick, 값: typing.trim() });
                   }
                 }} />
          <button type="button" className="btn-dark" disabled={busy || !typing.trim()}
                  onClick={() => send({ action: "add", 구분: pick, 값: typing.trim() })}>
            넣기
          </button>
        </div>
      )}

      {msg && <div className="alert-bad" style={{ marginBottom: 12 }}>{msg}</div>}

      {mine.length === 0 ? (
        <div className="empty">
          <Icon name="clipboard" size={26} />
          <b>{pick} 목록이 비어 있습니다</b>
          <p>위 칸에 값을 넣으면 회원 · 상담 화면에서 고를 수 있게 됩니다.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>값</th>
                <th style={{ width: 90 }}>쓰는가</th>
                {p.canEdit && <th style={{ width: 150 }} />}
              </tr>
            </thead>
            <tbody>
              {mine.map((r) => (
                <tr key={r.줄}>
                  <td className="strong">
                    {edit?.줄 === r.줄 ? (
                      <input className="input" value={edit.값} autoFocus
                             onChange={(e) => setEdit({ 줄: r.줄, 값: e.target.value })}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") {
                                 e.preventDefault();
                                 send({ action: "patch", 줄: r.줄, 값: edit.값 });
                               }
                               if (e.key === "Escape") setEdit(null);
                             }} />
                    ) : (
                      <span className={r.씀 ? "" : "dim"}>{r.값}</span>
                    )}
                  </td>
                  <td>
                    {r.씀 ? (
                      <span className="pill good">씁니다</span>
                    ) : (
                      <span className="pill">안 씁니다</span>
                    )}
                  </td>
                  {p.canEdit && (
                    <td className="r">
                      {edit?.줄 === r.줄 ? (
                        <>
                          <button className="mini-tab" disabled={busy}
                                  onClick={() => send({ action: "patch", 줄: r.줄, 값: edit.값 })}>
                            저장
                          </button>
                          <button className="mini-tab" onClick={() => setEdit(null)}>취소</button>
                        </>
                      ) : (
                        <>
                          <button className="mini-tab" onClick={() => setEdit({ 줄: r.줄, 값: r.값 })}>
                            고치기
                          </button>
                          <button className="mini-tab" disabled={busy}
                                  onClick={() => send({ action: "patch", 줄: r.줄, 씀: !r.씀 })}>
                            {r.씀 ? "안 쓰기" : "다시 쓰기"}
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        지우기를 안 두는 이유

        이미 그 값으로 저장된 회원이 있는데 목록에서 사라지면, 나중에
        「이 값이 뭐였지」를 되짚을 수가 없다. 「안 쓰기」로 돌리면 새로 고를
        때는 안 뜨고, 이미 적힌 것은 그대로 남는다. 그게 맞는 자리다.
      */}
      <p className="stat-note" style={{ marginTop: 12 }}>
        지우는 대신 <b>「안 쓰기」</b>로 돌립니다. 새로 고를 때는 안 뜨고, 이미 그 값으로
        저장된 회원은 그대로 남습니다. 아예 지우면 나중에 그 값이 무엇이었는지 알 수 없습니다.
      </p>
    </>
  );
}
