"use client";

/**
 * 고르는 목록 고치기 — 그 자리에서
 *
 * ── 왜 창으로 여나 ─────────────────────────────────────────
 * 「목록 고치기」는 목록 관리 화면으로 가는 길이었다. 그런데 이 길을 누르는
 * 때는 대개 회원을 반쯤 적어 둔 채다 — 「봉명동」이 목록에 없어서 넣으려는
 * 순간이다. 화면이 바뀌면 적어 둔 것이 통째로 날아간다.
 * 그래서 옮기지 않고 그 위에 겹쳐 연다. 닫으면 적던 자리로 돌아온다.
 *
 * 창을 닫을 때 화면을 새로 읽지 않는다. 새로 읽으면 결국 같은 일이 난다 —
 * 대신 고친 목록을 부모에게 그대로 돌려주어, 밑에 뜨는 목록만 갈아 끼운다.
 *
 * 지우기는 없다. 이미 그 값으로 저장된 회원이 있는데 목록에서 사라지면
 * 나중에 그 값이 무엇이었는지 되짚을 수가 없다. 「안 쓰기」로 돌리면 새로
 * 고를 때는 안 뜨고, 이미 적힌 것은 그대로 남는다.
 */
import { useEffect, useState } from "react";
import { backdrop } from "@/lib/backdrop";

type Row = { 줄: number; 값: string; 씀: boolean };

export default function OptionEdit({ kind, title, onChange, onClose }: {
  /** 선택목록 시트의 「구분」 — 거주동네 · 직업 · 문의채널 … */
  kind: string;
  /** 화면에 적는 이름 — 「거주 동네」처럼 띄어 쓴 쪽 */
  title?: string;
  /** 쓸 수 있는 값이 바뀌었을 때 — 부모가 밑에 뜨는 목록을 갈아 끼운다 */
  onChange?: (values: string[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [typing, setTyping] = useState("");
  const [edit, setEdit] = useState<{ 줄: number; 값: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    try {
      const res = await fetch(`/api/options?kind=${encodeURIComponent(kind)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "읽지 못했습니다.");
      setRows(d.items ?? []);
      onChange?.((d.items ?? []).filter((r: Row) => r.씀).map((r: Row) => r.값));
    } catch (e: any) {
      setRows([]);
      setMsg(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function send(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "저장하지 못했습니다.");
      setTyping("");
      setEdit(null);
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back top" {...backdrop(onClose)}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{title ?? kind} 목록 고치기</h3>

        <div className="inline-form" style={{ margin: "12px 0" }}>
          <input className="input" value={typing} autoFocus
                 placeholder={`${title ?? kind} 목록에 넣을 값`}
                 onChange={(e) => setTyping(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === "Enter" && typing.trim()) {
                     e.preventDefault();
                     send({ action: "add", 구분: kind, 값: typing.trim() });
                   }
                 }} />
          <button type="button" className="btn-dark" disabled={busy || !typing.trim()}
                  onClick={() => send({ action: "add", 구분: kind, 값: typing.trim() })}>
            넣기
          </button>
        </div>

        {msg && <div className="alert-bad" style={{ marginBottom: 12 }}>{msg}</div>}

        {rows === null ? (
          <p className="dim mini-note">읽는 중…</p>
        ) : rows.length === 0 ? (
          <p className="dim mini-note">
            아직 넣어 둔 값이 없습니다. 위 칸에 넣으면 밑에 뜨는 목록에 바로 올라옵니다.
          </p>
        ) : (
          <ul className="rolelist">
            {rows.map((r) => (
              <li key={r.줄} className={r.씀 ? "" : "off"}>
                {edit?.줄 === r.줄 ? (
                  <input className="input" value={edit.값} autoFocus
                         onChange={(e) => setEdit({ 줄: r.줄, 값: e.target.value })}
                         onKeyDown={(e) => {
                           if (e.key === "Enter" && edit.값.trim()) {
                             e.preventDefault();
                             send({ action: "patch", 줄: r.줄, 값: edit.값.trim() });
                           }
                           if (e.key === "Escape") setEdit(null);
                         }} />
                ) : (
                  <>
                    <span className="nm">{r.값}</span>
                    {!r.씀 && <span className="tag">안 씀</span>}
                  </>
                )}

                <span className="ops">
                  {edit?.줄 === r.줄 ? (
                    <>
                      <button className="mini-tab" disabled={busy || !edit.값.trim()}
                              onClick={() => send({ action: "patch", 줄: r.줄, 값: edit.값.trim() })}>
                        저장
                      </button>
                      <button className="mini-tab" onClick={() => setEdit(null)}>그만</button>
                    </>
                  ) : (
                    <>
                      <button className="mini-tab" disabled={busy}
                              onClick={() => { setEdit({ 줄: r.줄, 값: r.값 }); setMsg(""); }}>
                        이름
                      </button>
                      <button className="mini-tab" disabled={busy}
                              onClick={() => send({ action: "patch", 줄: r.줄, 씀: !r.씀 })}>
                        {r.씀 ? "안 쓰기" : "다시 쓰기"}
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="stat-note">
          지우는 대신 <b>「안 쓰기」</b>로 돌립니다. 새로 고를 때는 안 뜨고, 이미 그 값으로
          저장된 회원은 그대로 남습니다.
        </p>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
