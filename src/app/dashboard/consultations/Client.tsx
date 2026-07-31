"use client";

/**
 * 상담 목록 · 등록 · 진행 상태 관리
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { korDate, today } from "@/lib/time";
import { showPhone } from "@/lib/phone";

type Row = Record<string, string>;
type Item = Row & { id: string };

type Props = {
  items: Item[];
  activities: Row[];
  options: Record<string, string[]>;
  branches: { code: string; name: string }[];
  staffNames: Record<string, string>;
  counselors: { id: string; name: string }[];
  currentBranch: string;
  me: string;
  onlyMine: boolean;
  can: { create: boolean; update: boolean; remove: boolean };
};

const STAGES = ["신규", "연락중", "약속대기", "예약확정", "방문완료", "등록완료", "미등록"];

const STAGE_TONE: Record<string, string> = {
  신규: "point",
  연락중: "",
  약속대기: "warn",
  예약확정: "warn",
  방문완료: "",
  등록완료: "good",
  미등록: "bad",
};

export default function Client(p: Props) {
  const [stage, setStage] = useState("전체");
  const [branch, setBranch] = useState("전체");
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [detail, setDetail] = useState<Item | null>(null);

  const now = today();

  const list = useMemo(() => {
    return p.items.filter((c) => {
      if (stage !== "전체" && c["진행상태"] !== stage) return false;
      if (branch !== "전체" && c["지점코드"] !== branch) return false;
      if (q) {
        const hay = `${c["이름"]} ${c["전화번호"]} ${c["문의내용"]}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [p.items, stage, branch, q]);

  const thisMonth = now.slice(0, 7);
  const inMonth = p.items.filter((c) => (c["상담날짜"] ?? "").startsWith(thisMonth));
  const done = inMonth.filter((c) => c["진행상태"] === "등록완료").length;
  const rate = inMonth.length ? Math.round((done / inMonth.length) * 100) : 0;
  const overdue = p.items.filter(
    (c) =>
      !["등록완료", "미등록"].includes(c["진행상태"]) &&
      c["다음연락예정일"] &&
      c["다음연락예정일"] < now
  ).length;

  const branchName = (code: string) => p.branches.find((b) => b.code === code)?.name ?? code;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">상담</h1>
          <p className="page-sub">
            문의 접수부터 등록 전환까지 관리합니다
            {p.onlyMine && " · 내 담당 건만 보입니다"}
          </p>
        </div>
        {p.can.create && (
          <button className="btn-dark" onClick={() => setOpenNew(true)}>
            <Icon name="plus" size={16} strokeWidth={2} />
            상담 접수
          </button>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="lb">이번 달 상담</div>
          <div className="vl num">{inMonth.length}</div>
          <div className="dt">전체 {p.items.length}건 누적</div>
        </div>
        <div className="stat">
          <div className="lb">등록 전환</div>
          <div className="vl num">{done}</div>
          <div className="dt">이번 달 기준</div>
        </div>
        <div className="stat">
          <div className="lb">전환율</div>
          <div className="vl num">{rate}%</div>
          <div className="dt">{inMonth.length}건 중 {done}건</div>
        </div>
        <div className="stat">
          <div className="lb">연락 놓친 건</div>
          <div className="vl num" style={{ color: overdue ? "var(--bad)" : undefined }}>{overdue}</div>
          <div className="dt">{overdue ? "예정일이 지났습니다" : "밀린 건 없습니다"}</div>
        </div>
      </div>

      <div className="filters">
        <div className="chips">
          {["전체", ...STAGES].map((s) => (
            <button key={s} className={`chip${stage === s ? " on" : ""}`} onClick={() => setStage(s)}>
              {s}
              {s !== "전체" && (
                <span className="cnt num">{p.items.filter((c) => c["진행상태"] === s).length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="filter-right">
          {p.branches.length > 1 && (
            <select className="select" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="전체">전 지점</option>
              {p.branches.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          )}
          <input
            className="search"
            placeholder="이름 · 연락처 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <Icon name="phone" size={26} />
          <b>{p.items.length === 0 ? "아직 접수된 상담이 없습니다" : "조건에 맞는 상담이 없습니다"}</b>
          <p>
            {p.items.length === 0
              ? "오른쪽 위 상담 접수 단추로 첫 문의를 기록해보세요."
              : "필터를 바꿔보세요."}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>이름</th>
                <th>연락처</th>
                <th>상담일</th>
                <th>경로</th>
                <th>담당</th>
                <th>지점</th>
                <th>다음 연락</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const late =
                  !["등록완료", "미등록"].includes(c["진행상태"]) &&
                  c["다음연락예정일"] &&
                  c["다음연락예정일"] < now;
                return (
                  <tr key={c.id} onClick={() => setDetail(c)}>
                    <td className="strong">{c["이름"]}</td>
                    <td className="num">{showPhone(c["전화번호"])}</td>
                    <td className="num dim">{(c["상담날짜"] ?? "").slice(5)}</td>
                    <td className="dim">{c["방문경로"]}</td>
                    <td className="dim">{p.staffNames[c["상담자사번"]] ?? "-"}</td>
                    <td className="dim">{branchName(c["지점코드"])}</td>
                    <td className={late ? "late num" : "num dim"}>
                      {c["다음연락예정일"] ? (c["다음연락예정일"] ?? "").slice(5) : "-"}
                    </td>
                    <td>
                      <span className={`pill ${STAGE_TONE[c["진행상태"]] ?? ""}`}>
                        {c["진행상태"] || "신규"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openNew && (
        <NewForm
          options={p.options}
          branches={p.branches}
          counselors={p.counselors}
          defaultBranch={p.currentBranch}
          me={p.me}
          onClose={() => setOpenNew(false)}
        />
      )}

      {detail && (
        <Detail
          item={detail}
          activities={p.activities.filter((a) => a["상담번호"] === detail.id)}
          options={p.options}
          staffNames={p.staffNames}
          branchName={branchName(detail["지점코드"])}
          canUpdate={p.can.update}
          canRemove={p.can.remove}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

/* ── 상담 접수 ─────────────────────────────── */
function NewForm({
  options, branches, counselors, defaultBranch, me, onClose,
}: {
  options: Record<string, string[]>;
  branches: { code: string; name: string }[];
  counselors: { id: string; name: string }[];
  defaultBranch: string;
  me: string;
  onClose: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>({
    상담날짜: today(),
    지점코드: defaultBranch,
    상담자사번: me,
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  async function save() {
    if (!f["이름"]?.trim()) return setMsg("이름을 입력해주세요.");
    if (!f["전화번호"]?.trim()) return setMsg("연락처를 입력해주세요.");
    setBusy(true);
    const res = await fetch("/api/consultations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    location.reload();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>상담 접수</h3>

        <div className="form-grid">
          <L label="이름" req>
            <input className="input" value={f["이름"] ?? ""} onChange={(e) => set("이름", e.target.value)} />
          </L>
          <L label="연락처" req>
            <input className="input" inputMode="tel" placeholder="010-0000-0000"
                   value={f["전화번호"] ?? ""} onChange={(e) => set("전화번호", e.target.value)} />
          </L>
          <L label="상담일">
            <input className="input" type="date" value={f["상담날짜"] ?? ""}
                   onChange={(e) => set("상담날짜", e.target.value)} />
          </L>
          <L label="지점">
            <select className="input" value={f["지점코드"] ?? ""} onChange={(e) => set("지점코드", e.target.value)}>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </L>
          <Sel label="방문경로" k="방문경로" f={f} set={set} opts={options["방문경로"]} />
          <Sel label="문의유형" k="문의유형" f={f} set={set} opts={options["문의유형"]} />
          <Sel label="성별" k="성별" f={f} set={set} opts={options["성별"]} />
          <Sel label="나이대" k="나이대" f={f} set={set} opts={options["나이대"]} />
          <Sel label="거주동네" k="거주동네" f={f} set={set} opts={options["거주동네"]} />
          <Sel label="직업" k="직업" f={f} set={set} opts={options["직업"]} />
          <L label="담당자">
            <select className="input" value={f["상담자사번"] ?? ""} onChange={(e) => set("상담자사번", e.target.value)}>
              {counselors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </L>
          <L label="다음 연락 예정일">
            <input className="input" type="date" value={f["다음연락예정일"] ?? ""}
                   onChange={(e) => set("다음연락예정일", e.target.value)} />
          </L>
          <L label="방문 약속 일시" full>
            <input className="input" type="datetime-local" value={f["약속일시"] ?? ""}
                   onChange={(e) => set("약속일시", e.target.value)} />
          </L>
          <L label="문의 내용" full>
            <textarea className="input area" rows={3} value={f["문의내용"] ?? ""}
                      onChange={(e) => set("문의내용", e.target.value)} />
          </L>
        </div>

        {msg && <div className="alert-bad">{msg}</div>}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" style={{ marginTop: 0 }} onClick={save} disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 상세 ─────────────────────────────────── */
function Detail({
  item, activities, options, staffNames, branchName, canUpdate, canRemove, onClose,
}: {
  item: Item;
  activities: Row[];
  options: Record<string, string[]>;
  staffNames: Record<string, string>;
  branchName: string;
  canUpdate: boolean;
  canRemove: boolean;
  onClose: () => void;
}) {
  const [stage, setStage] = useState(item["진행상태"] || "신규");
  const [nextDate, setNextDate] = useState(item["다음연락예정일"] ?? "");
  const [reason, setReason] = useState(item["미등록사유"] ?? "");
  const [kind, setKind] = useState((options["상담활동종류"] ?? ["전화"])[0]);
  const [content, setContent] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Record<string, string>>({ ...item });
  const setV = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  async function saveEdit() {
    if (!f["이름"]?.trim()) return setMsg("이름을 입력해주세요.");
    if (!f["전화번호"]?.trim()) return setMsg("연락처를 입력해주세요.");
    setBusy(true);
    const res = await fetch("/api/consultations/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        changes: {
          이름: f["이름"], 전화번호: f["전화번호"], 상담날짜: f["상담날짜"],
          성별: f["성별"], 나이대: f["나이대"], 문의유형: f["문의유형"],
          방문경로: f["방문경로"], 거주동네: f["거주동네"], 직업: f["직업"],
          상담자사번: f["상담자사번"], 약속일시: f["약속일시"],
          문의내용: f["문의내용"], 메모: f["메모"],
        },
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    location.reload();
  }

  async function remove() {
    setBusy(true);
    const res = await fetch("/api/consultations/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "삭제하지 못했습니다.");
    location.reload();
  }

  async function saveStage() {
    setBusy(true);
    const res = await fetch("/api/consultations/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        changes: { 진행상태: stage, 다음연락예정일: nextDate, 미등록사유: stage === "미등록" ? reason : "" },
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    location.reload();
  }

  async function saveActivity() {
    if (!content.trim()) return setMsg("연락 내용을 적어주세요.");
    setBusy(true);
    const res = await fetch("/api/consultations/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, kind, content }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    location.reload();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div>
            <h3 style={{ margin: 0 }}>{item["이름"]}</h3>
            <span className="dim num">{showPhone(item["전화번호"])}</span>
          </div>
          <span className={`pill ${STAGE_TONE[item["진행상태"]] ?? ""}`}>{item["진행상태"] || "신규"}</span>
        </div>

        {editing ? (
          <>
            <div className="form-grid">
              <L label="이름" req>
                <input className="input" value={f["이름"] ?? ""} onChange={(e) => setV("이름", e.target.value)} />
              </L>
              <L label="연락처" req>
                <input className="input" inputMode="tel" value={f["전화번호"] ?? ""}
                       onChange={(e) => setV("전화번호", e.target.value)} />
              </L>
              <L label="상담일">
                <input className="input" type="date" value={(f["상담날짜"] ?? "").slice(0, 10)}
                       onChange={(e) => setV("상담날짜", e.target.value)} />
              </L>
              <L label="담당자">
                <select className="input" value={f["상담자사번"] ?? ""} onChange={(e) => setV("상담자사번", e.target.value)}>
                  {Object.entries(staffNames).map(([id, nm]) => (
                    <option key={id} value={id}>{nm}</option>
                  ))}
                </select>
              </L>
              <Sel label="방문경로" k="방문경로" f={f} set={setV} opts={options["방문경로"]} />
              <Sel label="문의유형" k="문의유형" f={f} set={setV} opts={options["문의유형"]} />
              <Sel label="성별" k="성별" f={f} set={setV} opts={options["성별"]} />
              <Sel label="나이대" k="나이대" f={f} set={setV} opts={options["나이대"]} />
              <Sel label="거주동네" k="거주동네" f={f} set={setV} opts={options["거주동네"]} />
              <Sel label="직업" k="직업" f={f} set={setV} opts={options["직업"]} />
              <L label="방문 약속 일시" full>
                <input className="input" type="datetime-local" value={f["약속일시"] ?? ""}
                       onChange={(e) => setV("약속일시", e.target.value)} />
              </L>
              <L label="문의 내용" full>
                <textarea className="input area" rows={3} value={f["문의내용"] ?? ""}
                          onChange={(e) => setV("문의내용", e.target.value)} />
              </L>
              <L label="메모" full>
                <textarea className="input area" rows={2} value={f["메모"] ?? ""}
                          onChange={(e) => setV("메모", e.target.value)} />
              </L>
            </div>

            {msg && <div className="alert-bad">{msg}</div>}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => { setEditing(false); setF({ ...item }); setMsg(""); }}>
                취소
              </button>
              <button className="btn-primary" style={{ marginTop: 0 }} onClick={saveEdit} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </>
        ) : (
        <>
        <dl className="kv">
          <Kv k="상담일" v={korDate(item["상담날짜"])} />
          <Kv k="지점" v={branchName} />
          <Kv k="방문경로" v={item["방문경로"]} />
          <Kv k="문의유형" v={item["문의유형"]} />
          <Kv k="성별 · 나이" v={[item["성별"], item["나이대"]].filter(Boolean).join(" · ")} />
          <Kv k="거주동네" v={item["거주동네"]} />
          <Kv k="직업" v={item["직업"]} />
          <Kv k="담당자" v={staffNames[item["상담자사번"]] ?? "-"} />
          <Kv k="접수자" v={staffNames[item["접수자사번"]] ?? "-"} />
          <Kv k="방문 약속" v={item["약속일시"]?.replace("T", " ")} />
        </dl>

        {item["문의내용"] && (
          <div className="quote">{item["문의내용"]}</div>
        )}

        <h4 className="mini-title">연락 이력 {activities.length > 0 && `(${activities.length})`}</h4>
        {activities.length === 0 ? (
          <p className="dim" style={{ fontSize: 13, margin: "0 0 12px" }}>아직 기록이 없습니다.</p>
        ) : (
          <ul className="timeline">
            {activities
              .slice()
              .sort((a, b) => (b["일시"] ?? "").localeCompare(a["일시"] ?? ""))
              .map((a) => (
                <li key={a["활동번호"]}>
                  <span className="pill">{a["활동종류"]}</span>
                  <span className="tl-body">{a["내용"]}</span>
                  <span className="tl-meta num">
                    {(a["일시"] ?? "").slice(5, 16)} · {staffNames[a["처리직원사번"]] ?? ""}
                  </span>
                </li>
              ))}
          </ul>
        )}

        {canUpdate && (
          <>
            <h4 className="mini-title">연락 기록 추가</h4>
            <div className="inline-form">
              <select className="input" style={{ maxWidth: 110 }} value={kind} onChange={(e) => setKind(e.target.value)}>
                {(options["상담활동종류"] ?? ["전화", "문자", "방문", "메모"]).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <input className="input" placeholder="무슨 얘기를 했는지 적어주세요"
                     value={content} onChange={(e) => setContent(e.target.value)} />
              <button className="btn-ghost" onClick={saveActivity} disabled={busy}>추가</button>
            </div>

            <h4 className="mini-title">진행 상태 바꾸기</h4>
            <div className="inline-form">
              <select className="input" style={{ maxWidth: 130 }} value={stage} onChange={(e) => setStage(e.target.value)}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input className="input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              <button className="btn-ghost" onClick={saveStage} disabled={busy}>저장</button>
            </div>
            {stage === "미등록" && (
              <select className="input" style={{ marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">미등록 사유를 골라주세요</option>
                {(options["미등록사유"] ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </>
        )}

        {msg && <div className="alert-bad">{msg}</div>}

        {confirmDel ? (
          <div className="confirm-box">
            <b>이 상담을 삭제할까요?</b>
            <p>
              {item["이름"]} · {showPhone(item["전화번호"])}
              <br />
              목록에서 사라집니다. 시트에는 기록이 남아 있어 되살릴 수 있습니다.
            </p>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setConfirmDel(false)}>그만두기</button>
              <button className="btn-danger" onClick={remove} disabled={busy}>
                {busy ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-actions">
            {canRemove && (
              <button className="btn-ghost danger" onClick={() => setConfirmDel(true)}>
                삭제
              </button>
            )}
            {canUpdate && (
              <button className="btn-ghost" onClick={() => { setEditing(true); setMsg(""); }}>
                수정
              </button>
            )}
            <button className="btn-ghost" onClick={onClose}>닫기</button>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

/* ── 작은 조각들 ───────────────────────────── */
function L({ label, children, req, full }: { label: string; children: React.ReactNode; req?: boolean; full?: boolean }) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label>{label}{req && <span className="req">*</span>}</label>
      {children}
    </div>
  );
}

function Sel({ label, k, f, set, opts }: {
  label: string; k: string; f: Record<string, string>;
  set: (k: string, v: string) => void; opts?: string[];
}) {
  return (
    <L label={label}>
      <select className="input" value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">선택</option>
        {(opts ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </L>
  );
}

function Kv({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="kv-row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
