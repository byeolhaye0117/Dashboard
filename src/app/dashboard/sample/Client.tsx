"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

export default function Client() {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function run(action: "add" | "remove") {
    setBusy(action);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "처리하지 못했습니다.");
        return;
      }
      setMsg(
        action === "add"
          ? `회원 ${data.count}명과 그에 딸린 이용권 · 결제를 넣었습니다. 매출 화면에서 확인해보세요.`
          : data.count > 0
            ? `샘플 회원 ${data.count}명과 딸린 자료를 모두 지웠습니다.`
            : "지울 샘플 자료가 없습니다."
      );
    } catch {
      setErr("연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">샘플 자료</h1>
          <p className="page-sub">화면이 어떻게 보이는지 확인하기 위한 가짜 자료입니다</p>
        </div>
      </div>

      <div className="panel">
        <div className="bd">
          <p>
            지난 <strong>13개월치</strong> 회원 · 이용권 · 결제를 한 번에 넣습니다.
            지점 · 상품 · 날짜를 섞어 넣기 때문에 <strong>지점 비교 · 12개월 추이 ·
            전년 대비</strong>가 실제로 어떻게 보이는지 확인하실 수 있습니다.
          </p>
          <p>
            넣은 자료에는 모두 <strong>[샘플]</strong> 표시가 붙습니다.
            확인이 끝나면 아래 지우기로 한 번에 없앨 수 있고,
            <strong> 대표님이 직접 넣으신 자료는 건드리지 않습니다.</strong>
          </p>
          <p>
            시트에서도 줄을 실제로 없애지 않고 삭제 표시만 남기므로,
            잘못 눌러도 되돌릴 수 있습니다.
          </p>
        </div>
      </div>

      {msg && <div className="banner" style={{ marginTop: 16 }}>
        <span className="lead"><Icon name="check" size={18} /></span>
        <div><b>완료</b><p>{msg}</p></div>
      </div>}
      {err && <div className="alert-bad" style={{ marginTop: 16 }}>{err}</div>}

      <div className="modal-actions" style={{ maxWidth: 420, marginTop: 20 }}>
        <button className="btn-ghost danger" onClick={() => run("remove")} disabled={Boolean(busy)}>
          {busy === "remove" ? "지우는 중…" : "샘플 자료 지우기"}
        </button>
        <button className="btn-primary" style={{ marginTop: 0 }}
                onClick={() => run("add")} disabled={Boolean(busy)}>
          {busy === "add" ? "넣는 중… (30초쯤)" : "샘플 자료 넣기"}
        </button>
      </div>

      <p className="stat-note">
        넣는 데 20~40초쯤 걸립니다. 창을 닫지 말고 기다려주세요.
      </p>
    </>
  );
}
