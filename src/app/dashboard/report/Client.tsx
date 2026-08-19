"use client";

/**
 * 보고 — 빠진 회원 정보
 *
 * 누가 빠뜨렸는지 따지는 자리가 아니다. 다음에 그 분과 마주 앉을 때 무엇을
 * 여쭤야 하는지 알려 주는 자리다. 그래서 이름을 누르면 그 회원 창이 바로
 * 열리게 해 둔다 — 보고를 보고 나서 다시 찾아 들어가야 하면 아무도 안 고친다.
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { showPhone } from "@/lib/phone";

type Row = {
  id: string;
  이름: string;
  전화번호: string;
  지점코드: string;
  가입일: string;
  방문경로: string;
  거주동네: string;
  직업: string;
  미입력사유: string;
};

type Named = { code: string; name: string };

const 칸: { k: "방문경로" | "거주동네" | "직업"; label: string }[] = [
  { k: "방문경로", label: "방문 경로" },
  { k: "거주동네", label: "거주 동네" },
  { k: "직업", label: "직업" },
];

export default function Client(p: {
  rows: Row[];
  branches: Named[];
  problem: string;
}) {
  const [tab, setTab] = useState("전체");
  const [branch, setBranch] = useState("");
  const [q, setQ] = useState("");

  const branchName = (code: string) =>
    p.branches.find((b) => b.code === code)?.name ?? code ?? "-";

  const scoped = useMemo(
    () => (branch ? p.rows.filter((r) => r.지점코드 === branch) : p.rows),
    [p.rows, branch]
  );

  const 없는것 = (r: Row) => 칸.filter((c) => !r[c.k]).map((c) => c.label);

  const list = useMemo(() => {
    return scoped
      .filter((r) => tab === "전체" || 없는것(r).includes(tab))
      .filter((r) => !q || `${r.이름} ${r.전화번호}`.includes(q.trim()))
      /* 오래 비어 있던 것부터. 최근에 등록한 분은 아직 여쭐 기회가 있다 */
      .sort((a, b) => (a.가입일 ?? "").localeCompare(b.가입일 ?? ""));
  }, [scoped, tab, q]);

  if (p.problem) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">보고</h1>
            <p className="page-sub">시트를 읽지 못했습니다</p>
          </div>
        </div>
        <div className="alert-bad" style={{ lineHeight: 1.7 }}>{p.problem}</div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">보고</h1>
          <p className="page-sub">
            방문 경로 · 거주 동네 · 직업이 비어 있는 회원입니다. 이름을 누르면 그 회원 창이 열립니다
          </p>
        </div>
      </div>

      <div className="stats">
        {칸.map((c) => (
          <div className="stat" key={c.k}>
            <div className="lb">{c.label} 없음</div>
            <div className="vl num">{scoped.filter((r) => !r[c.k]).length}</div>
            <div className="dt">전체 {scoped.length}명 중</div>
          </div>
        ))}
        <div className="stat">
          <div className="lb">까닭 적힌 분</div>
          <div className="vl num">{scoped.filter((r) => r.미입력사유).length}</div>
          <div className="dt">이미 여쭤본 분입니다</div>
        </div>
      </div>

      {p.branches.length > 1 && (
        <div className="bchips" style={{ marginTop: 14 }}>
          <button className={`bchip${branch === "" ? " on" : ""}`} onClick={() => setBranch("")}>
            <span className="nm">전 지점</span>
            <span className="am num">{p.rows.length}</span>
          </button>
          {p.branches.map((b) => (
            <button key={b.code} className={`bchip${branch === b.code ? " on" : ""}`}
                    onClick={() => setBranch(b.code)}>
              <span className="nm">{b.name}</span>
              <span className="am num">{p.rows.filter((r) => r.지점코드 === b.code).length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="filter-row">
        <div className="chips">
          {["전체", ...칸.map((c) => c.label)].map((t) => (
            <button key={t} className={`chip${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
              {t}
              <span className="cnt num">
                {t === "전체"
                  ? scoped.length
                  : scoped.filter((r) => 없는것(r).includes(t)).length}
              </span>
            </button>
          ))}
        </div>
        <div className="filter-right">
          <input className="search" placeholder="이름 · 연락처 검색"
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <Icon name="check" size={26} />
          <b>{p.rows.length === 0 ? "빠진 것이 없습니다" : "조건에 맞는 회원이 없습니다"}</b>
          <p>
            {p.rows.length === 0
              ? "방문 경로 · 거주 동네 · 직업이 모두 채워져 있습니다."
              : "다른 갈래나 지점을 골라 보세요."}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>이름</th>
                <th>연락처</th>
                <th>지점</th>
                <th>가입일</th>
                <th>빠진 것</th>
                <th>못 적은 까닭</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}
                    onClick={() => { location.href = `/dashboard/members#${r.id}`; }}>
                  <td className="strong">{r.이름}</td>
                  <td className="num">{showPhone(r.전화번호)}</td>
                  <td className="dim">{branchName(r.지점코드)}</td>
                  <td className="num dim">{r.가입일 ? r.가입일.slice(2) : "-"}</td>
                  <td>
                    {없는것(r).map((x) => (
                      <span className="pill warn" key={x} style={{ marginRight: 4 }}>{x}</span>
                    ))}
                  </td>
                  {/*
                    까닭이 적혀 있으면 이미 한 번 여쭤본 분이다. 다시 전화를
                    걸 이유가 없으니 눈에 덜 띄게 둔다
                  */}
                  <td className="dim">{r.미입력사유 || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 「못 적은 까닭」이 어디서 온 값인지는 화면만 봐서는 알 수 없다 */}
      <p className="stat-note" style={{ marginTop: 12 }}>
        <b>못 적은 까닭</b>은 회원을 등록하거나 상품을 더할 때 <b>「미입력으로 두기」</b>를
        누르고 적으신 한 줄입니다.
      </p>
    </>
  );
}
