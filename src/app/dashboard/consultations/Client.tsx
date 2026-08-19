"use client";

/**
 * 상담 목록 · 등록 · 진행 상태 관리
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { korDate, today, now as nowMinute } from "@/lib/time";
import { showPhone } from "@/lib/phone";
import {
  stageOf, baseDate, monthOf, isSettled, DONE_STAGE, stageNow as stageAt,
} from "@/lib/stage";

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

const STAGES = ["예약", "약속전환", "등록", "미등록"];

const CHANNELS = ["전화문의", "네이버톡톡", "카카오채널", "네이버플레이스예약", "문자"];

/**
 * 미등록 사유 — 두 가지는 원인이 완전히 다르다
 *
 * 미방문 : 약속은 잡혔는데 오지 않았다 → 예약 관리·리마인드 문제
 * 등록실패: 방문은 했는데 등록하지 않았다 → 상담·가격·시설 문제
 *
 * 섞어서 세면 어느 쪽을 고쳐야 할지 알 수 없어 따로 둔다.
 */
const NOSHOW_REASONS = [
  "연락 두절",
  "약속 취소",
  "일정 미룸",
  "말없이 안 옴",
];
const FAIL_REASONS = [
  "가격 부담",
  "거리 · 위치",
  "운영 시간 안 맞음",
  "시설 · 환경",
  "타 업체 등록",
  "단순 문의였음",
  "기타",
];

/** 이 사유가 미방문 쪽인가 */
const isNoShowReason = (r: string) => NOSHOW_REASONS.includes((r ?? "").trim());

const STAGE_TONE: Record<string, string> = {
  예약: "point",
  약속전환: "warn",
  등록: "good",
  미등록: "bad",
};

/**
 * 날짜+시각 칸에 넣을 값
 *
 * datetime-local 은 「2026-08-14」 처럼 날짜만 주면 칸을 통째로 비운다.
 * 그대로 저장하면 날짜까지 날아간다. 시각이 없으면 00:00 을 붙여 넣고,
 * 00:00 은 보여줄 때 「시각 모름」으로 되돌린다.
 */
function forInput(v: string): string {
  const t = (v ?? "").trim().replace(" ", "T");
  if (!t) return "";
  return t.length > 10 ? t.slice(0, 16) : `${t.slice(0, 10)}T00:00`;
}

/**
 * 문의가 들어온 날과 시각
 *
 * ── 한 번 잘못 만들었던 자리다 ─────────────────────────────
 * 처음에는 상담날짜에 시각이 없으면 접수일시의 시각을 대신 썼다.
 * 접수일시는 「이 건을 대시보드에 넣은 시각」이지 「문의가 들어온 시각」이
 * 아니다. 그래서 아침 일곱 시에 몰아서 입력한 건들이 전부 7:02, 7:03 으로
 * 나왔고, 사장님이 바로 알아보셨다.
 *
 * 모르는 것은 모른다고 둔다. 상담날짜에 시각이 적혀 있을 때만 시각이다.
 * 접수 시각은 자세히 보기에 「언제 넣었는지」로 따로 적는다 — 지우지는 않되,
 * 문의 시각인 척하지도 않는다.
 *
 * 00:00 은 「시각 모름」으로 본다. 날짜만 있는 옛 기록을 고칠 때 시각 칸이
 * 00:00 으로 채워지는데, 자정에 들어온 문의는 실무상 없다.
 */
/**
 * 날짜와 시각을 한 자로 잰다
 *
 * 시트에 적히는 모양이 한 가지가 아니다. 화면에서 넣으면 「2026-08-14T09:00」이고,
 * 구글 시트가 날짜 칸으로 알아보면 「2026-08-14 9:00:00」으로 바꿔 적는다.
 * 앞의 0 이 사라지는 것이 문제였다 — 글자 그대로 비교하면 「9:00」이 「20:00」보다
 * 뒤로 간다. 실제로 9시 약속이 20시 약속 위에 붙었다.
 *
 * 그래서 자르지 않고 숫자로 읽는다. 시는 두 자리로 채워서 돌려준다.
 */
function stampOf(v: string): { date: string; time: string } {
  const raw = String(v ?? "").trim().replace("T", " ");
  if (!raw) return { date: "", time: "" };

  const d = raw.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  const date = d
    ? `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`
    : raw.slice(0, 10);

  /* 날짜 뒤에 오는 시:분만 본다. 날짜 안의 숫자를 시각으로 읽으면 안 된다 */
  const rest = d ? raw.slice((d.index ?? 0) + d[0].length) : raw.slice(10);
  const t = rest.match(/(\d{1,2}):(\d{2})/);
  const time = t ? `${t[1].padStart(2, "0")}:${t[2]}` : "";

  /* 00:00 은 「시각 모름」으로 본다. 자정에 오기로 한 약속은 없다 */
  return { date, time: time === "00:00" ? "" : time };
}

/** 문의가 들어온 날과 시각 */
const whenOf = (c: Row) => stampOf(c["상담날짜"] ?? "");

/**
 * 표에 보여줄 날짜와 시각
 *
 * 표에서 보고 싶은 것은 「이 사람 언제 오기로 했나」다. 문의가 들어온 날이
 * 아니다. 그래서 약속을 잡았으면 그 시각을 보여준다.
 *
 * 아직 약속이 없는 건은 문의 들어온 날을 보여주되 「문의」라고 적어 둔다.
 * 둘을 말없이 섞으면 어느 쪽 날짜인지 알 수가 없다 — 한 번 그렇게 틀렸다.
 */
function showWhen(c: Row): { date: string; time: string; appt: boolean } {
  const a = stampOf(c["약속일시"] ?? "");
  if (a.date) return { ...a, appt: true };
  return { ...whenOf(c), appt: false };
}

/** 이 건을 대시보드에 넣은 시각 — 문의 시각과는 다른 것이다 */
const enteredAt = (c: Row) => {
  const s = stampOf(c["접수일시"] ?? "");
  return s.date ? `${s.date} ${s.time || "00:00"}` : "";
};

/**
 * 줄 세우는 값
 *
 * 표에 보이는 값 그대로 세운다. 다른 값으로 세우면 눈에 보이는 순서가
 * 뒤죽박죽으로 읽힌다. 시각을 모르는 건은 그날 안에서 넣은 순서로 세운다 —
 * 모른다고 아무 데나 두면 같은 날 건들이 매번 다른 자리에 나온다.
 *
 * 날짜가 아예 없는 건은 맨 뒤로 보낸다. 앞에 두면 매일 그 줄부터 보게 된다.
 */
const whenKey = (c: Row) => {
  const w = showWhen(c);
  return `${w.date || "9999-99-99"} ${w.time || "00:00"} ${enteredAt(c)}`;
};

/**
 * 회원으로 올라갔는지 알린다
 *
 * 상태를 「등록」으로 바꾸면 서버가 회원 목록에 올린다. 조용히 넘어가면
 * 「올라간 건가」 싶어 회원 화면에서 또 손으로 넣게 되고, 그러면 같은 사람이
 * 둘이 된다. 올렸는지 이었는지, 어느 회원과 이었는지까지 적어 준다.
 */
function tellEnrolled(data: any) {
  if (data?.회원경고) {
    alert(`상담은 저장했지만 회원으로 올리지 못했습니다.\n\n${data.회원경고}`);
    return;
  }
  /* 등록을 되돌린 경우 — 회원까지 내렸는지, 왜 안 내렸는지 */
  if (data?.내림) {
    alert(
      data.내림.지움
        ? `등록을 되돌려서 회원 목록에서도 내렸습니다.\n(${data.내림.회원번호} ${data.내림.이름})`
        : `등록은 되돌렸습니다.\n\n다만 ${data.내림.이유}\n(${data.내림.회원번호} ${data.내림.이름})`
    );
    return;
  }
  if (!data?.회원) return;
  alert(
    data.회원.새로
      ? `회원 목록에 올렸습니다. (${data.회원.회원번호} ${data.회원.이름})\n\n` +
        `이용권과 결제는 아직 없습니다. 회원 화면에서 「상품 추가」로 넣어주세요.`
      : `이미 회원 목록에 있는 번호라 새로 만들지 않고 이었습니다.\n` +
        `(${data.회원.회원번호} ${data.회원.이름})`
  );
}

/** 문의 채널 — 시트 제목 줄이 아직 방문경로일 수도 있어 둘 다 본다 */
const chan = (c: Row) => (c["문의채널"] || c["방문경로"] || "").trim();
/** 약속을 잡았는가 — 약속일시가 채워졌으면 잡은 것이다 */
const hasAppt = (c: Row) => Boolean((c["약속일시"] ?? "").trim());

/** 화면에 보여줄 진짜 상태 — 규칙은 stage.ts 하나에만 둔다 */
const stageNow = (c: Row): string => stageAt(c, today());

/** 사람이 찍은 게 아니라 달이 지나서 미등록이 된 건 */
const isAutoFail = (c: Row) => !isSettled(c) && stageNow(c) === "미등록";

/** 약속 날짜는 지났는데 아직 결론이 없는 건 (이번 달 안이라 마감 전) */
const needsResult = (c: Row) =>
  !isSettled(c) && !isAutoFail(c) && hasAppt(c) && baseDate(c) < today();

export default function Client(p: Props) {
  const [tab, setTab] = useState("전체");
  /* 머리 위에서 고른 지점을 기본으로 본다. 지점을 골라 놓고도 다른 지점
     상담이 같이 뜨면, 무엇을 보고 있는지 화면이 두 가지로 말하는 셈이다.
     전 지점을 보실 때는 아래 고르개에서 「전 지점」을 고르시면 된다 */
  const [branch, setBranch] = useState(p.currentBranch || "전체");
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [detail, setDetail] = useState<Item | null>(null);

  const now = today();

  const list = useMemo(() => {
    return p.items.filter((c) => {
      if (tab !== "전체") {
        if (tab === "결론입력") {
          if (!needsResult(c)) return false;
        } else if (tab === "예약") {
          if (stageNow(c) !== "예약") return false;
        } else if (tab === "약속전환") {
          if (!hasAppt(c) || isSettled(c) || isAutoFail(c)) return false;
        } else if (tab === "등록" || tab === "미등록") {
          if (stageNow(c) !== tab) return false;
        } else if (chan(c) !== tab) return false;
      }
      if (branch !== "전체" && c["지점코드"] !== branch) return false;
      if (q) {
        const hay = `${c["이름"]} ${c["전화번호"]} ${c["문의내용"]}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    })
    /* 날짜 + 시각으로 줄 세운다. 최근 것이 위다 —
       시트에 들어간 순서(접수일시)로만 세우면 지난 건을 나중에 넣었을 때
       표에 보이는 날짜와 순서가 어긋난다. */
    /* 빠른 것이 위다. 오늘 누구부터 오는지가 이 표를 보는 이유다 */
    .sort((a, b) => whenKey(a).localeCompare(whenKey(b)) || a.id.localeCompare(b.id));
  }, [p.items, tab, branch, q]);

  const thisMonth = now.slice(0, 7);
  const inMonth = p.items.filter((c) => baseDate(c).startsWith(thisMonth));
  const base = inMonth.length;
  const pct = (n: number) => (base ? Math.round((n / base) * 100) : 0);

  const appt = inMonth.filter(hasAppt).length;               // 약속을 잡은 건
  const done = inMonth.filter((c) => stageNow(c) === "등록").length;
  const fail = inMonth.filter((c) => stageNow(c) === "미등록").length;
  const open = base - done - fail;                            // 아직 결론이 안 난 건
  const todo = p.items.filter(needsResult).length;            // 약속일이 지났는데 결론이 없는 건
  const overdue = p.items.filter(
    (c) => !isSettled(c) && c["다음연락예정일"] && c["다음연락예정일"] < now
  ).length;

  // 미등록 사유 중 가장 많은 것
  const failed = inMonth.filter((c) => stageNow(c) === "미등록");
  const noShow = failed.filter((c) => isNoShowReason(c["미등록사유"])).length;
  const failTop = (() => {
    const cnt: Record<string, number> = {};
    failed
      .filter((c) => c["미등록사유"])
      .forEach((c) => (cnt[c["미등록사유"]] = (cnt[c["미등록사유"]] ?? 0) + 1));
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "";
  })();

  const branchName = (code: string) => p.branches.find((b) => b.code === code)?.name ?? code;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">상담</h1>
          {p.onlyMine && <p className="page-sub">내 담당 건만 보입니다</p>}
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
          <div className="lb">이번 달 문의</div>
          <div className="vl num">{inMonth.length}</div>
          <div className="dt">전체 {p.items.length}건 누적</div>
        </div>
        <div className="stat">
          <div className="lb">약속전환율</div>
          <div className="vl num">{pct(appt)}%</div>
          <div className="dt">문의 {base}건 중 {appt}건 약속</div>
        </div>
        <div className="stat">
          <div className="lb">등록전환율</div>
          <div className="vl num">{pct(done)}%</div>
          <div className="dt">{base}건 중 {done}건 등록</div>
        </div>
        <div className="stat">
          <div className="lb">등록실패율</div>
          <div className="vl num">{pct(fail)}%</div>
          <div className="dt">{base}건 중 {fail}건 미등록</div>
        </div>
      </div>

      {base > 0 && (
        <p className="stat-note">
          이번 달 {base}건 가운데 <b>{open}건</b>이 아직 진행 중입니다.
          {todo > 0 && (
            <>
              {" "}약속 날짜가 지났는데 결론이 없는 건이{" "}
              <b className="warn-text">{todo}건</b> 있습니다.
            </>
          )}
          {overdue > 0 && (
            <>
              {" "}그중 <b className="warn-text">{overdue}건</b>은 연락 예정일이 지났습니다.
            </>
          )}
          {fail > 0 && (
            <>
              {" "}미등록 {fail}건 중 <b>{noShow}건</b>은 약속하고도 오지 않은 경우입니다.
              {failTop && (
                <>
                  {" "}사유는 <b>{failTop}</b>가 가장 많습니다.
                </>
              )}
            </>
          )}
        </p>
      )}


      <div className="filters">
        <div className="chips">
          <button className={`chip${tab === "전체" ? " on" : ""}`} onClick={() => setTab("전체")}>
            전체<span className="cnt num">{p.items.length}</span>
          </button>

          {CHANNELS.map((ch) => (
            <button key={ch} className={`chip${tab === ch ? " on" : ""}`} onClick={() => setTab(ch)}>
              {ch}
              <span className="cnt num">{p.items.filter((c) => chan(c) === ch).length}</span>
            </button>
          ))}

          <span className="chip-div" aria-hidden="true" />

          <button className={`chip${tab === "예약" ? " on" : ""}`} onClick={() => setTab("예약")}>
            예약<span className="cnt num">{p.items.filter((c) => stageNow(c) === "예약").length}</span>
          </button>
          <button className={`chip${tab === "약속전환" ? " on" : ""}`} onClick={() => setTab("약속전환")}>
            약속전환
            <span className="cnt num">
              {p.items.filter((c) => hasAppt(c) && !isSettled(c) && !isAutoFail(c)).length}
            </span>
          </button>
          <button className={`chip${tab === "등록" ? " on" : ""}`} onClick={() => setTab("등록")}>
            등록<span className="cnt num">{p.items.filter((c) => stageNow(c) === "등록").length}</span>
          </button>
          <button className={`chip${tab === "미등록" ? " on" : ""}`} onClick={() => setTab("미등록")}>
            미등록<span className="cnt num">{p.items.filter((c) => stageNow(c) === "미등록").length}</span>
          </button>

          {todo > 0 && (
            <button
              className={`chip warn-chip${tab === "결론입력" ? " on" : ""}`}
              onClick={() => setTab("결론입력")}
            >
              결론 입력<span className="cnt num">{todo}</span>
            </button>
          )}
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
              {/*
                칸 차례는 대표님이 정하신 순서다

                이름 다음에 성별이 오고, 등록자 옆에 상담자가 붙는다.
                「누가 넣었나」와 「누가 상담했나」는 나란히 놓고 봐야
                다른지 같은지가 한눈에 보인다.
              */}
              <tr>
                <th>이름</th>
                <th>성별</th>
                <th>연락처</th>
                <th>방문 약속</th>
                <th>문의</th>
                <th>채널</th>
                <th>등록자</th>
                <th>상담자</th>
                <th>지점</th>
                <th>다음 연락</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const late = !isSettled(c) && c["다음연락예정일"] && c["다음연락예정일"] < now;
                const st = stageNow(c);
                return (
                  <tr key={c.id} onClick={() => setDetail(c)}>
                    <td className="strong">{c["이름"]}</td>
                    <td className="dim">{c["성별"] || "-"}</td>
                    <td className="num">{showPhone(c["전화번호"])}</td>
                    <td className="num dim">
                      {/* 약속을 잡은 건은 약속 시각, 아직인 건은 문의 들어온 날.
                          어느 쪽인지 적어 두지 않으면 같은 칸에 다른 뜻이 섞인다 */}
                      {!showWhen(c).appt && <span className="ktag">문의</span>}
                      {showWhen(c).date.slice(5)}
                      {showWhen(c).time && <span className="at">{showWhen(c).time}</span>}
                    </td>
                    <td className="dim">{c["문의유형"] || "-"}</td>
                    <td className="dim">{chan(c) || "-"}</td>
                    {/* 이 줄을 화면에 넣은 사람 */}
                    <td className="dim">
                      {p.staffNames[c["접수자사번"]] ?? p.staffNames[c["상담자사번"]] ?? "-"}
                    </td>
                    {/* 실제로 상담을 한 사람. 등록으로 넘길 때 다시 물어 고친다 */}
                    <td className="dim">{p.staffNames[c["상담자사번"]] ?? "-"}</td>
                    <td className="dim">{branchName(c["지점코드"])}</td>
                    <td className={late ? "late num" : "num dim"}>
                      {c["다음연락예정일"] ? (c["다음연락예정일"] ?? "").slice(5) : "-"}
                    </td>
                    <td>
                      <span className={`pill ${STAGE_TONE[st] ?? ""}`}>{st}</span>
                      {isAutoFail(c) && (
                        <span className="auto-tag" title="달이 넘어가도록 결론이 없어 미등록으로 마감했습니다">
                          자동
                        </span>
                      )}
                      {needsResult(c) && <span className="todo-tag">결론 입력</span>}
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
    상담날짜: nowMinute(),
    지점코드: defaultBranch,
    상담자사번: me,
    진행상태: "예약",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  async function save() {
    if (!f["이름"]?.trim()) return setMsg("이름을 입력해주세요.");
    if (!f["전화번호"]?.trim()) return setMsg("연락처를 입력해주세요.");
    if (!f["문의채널"]) return setMsg("문의가 어디로 들어왔는지 골라주세요.");
    if (f["진행상태"] === "미등록" && !f["미등록사유"]) return setMsg("미등록 사유를 골라주세요.");
    setBusy(true);
    const res = await fetch("/api/consultations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "저장하지 못했습니다.");
    /* 접수하면서 바로 등록으로 넣으신 경우 — 회원까지 올라갔는지 알려준다 */
    tellEnrolled(data);
    location.reload();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>상담 접수</h3>
        <p className="modal-lead">
          이름과 연락처만 있으면 됩니다. 나머지는 나중에 알게 되면 수정에서 채우시면 됩니다.
        </p>

        <div className="form-grid">
          <L label="이름" req>
            <input className="input" value={f["이름"] ?? ""} onChange={(e) => set("이름", e.target.value)} />
          </L>
          <L label="연락처" req>
            <input className="input" inputMode="tel" placeholder="010-0000-0000"
                   value={f["전화번호"] ?? ""} onChange={(e) => set("전화번호", e.target.value)} />
          </L>
          <L label="상담일시">
            {/* 여기 적는 시각은 「문의가 들어온 시각」이다. 우리가 넣은 시각은
                따로 남으니 신경 쓰지 않으셔도 된다. 모르면 00:00 으로 두면
                표에 날짜만 나온다 */}
            <input className="input" type="datetime-local"
                   value={forInput(f["상담날짜"] ?? "")}
                   onChange={(e) => set("상담날짜", e.target.value.replace("T", " "))} />
          </L>
          <L label="지점">
            <select className="input" value={f["지점코드"] ?? ""} onChange={(e) => set("지점코드", e.target.value)}>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </L>
          <L label="문의 채널" req>
            <select className="input" value={f["문의채널"] ?? ""} onChange={(e) => set("문의채널", e.target.value)}>
              <option value="">선택</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </L>
          <Sel label="문의유형" k="문의유형" f={f} set={set} opts={options["문의유형"]} />
          <L label="진행 상태">
            <select className="input" value={f["진행상태"] ?? "신규"} onChange={(e) => set("진행상태", e.target.value)}>
              {STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </L>
          <L label="상담자">
            <select className="input" value={f["상담자사번"] ?? ""} onChange={(e) => set("상담자사번", e.target.value)}>
              {counselors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </L>
          {f["진행상태"] === "미등록" && (
            <L label="미등록 사유" full>
              <ReasonPick
                value={f["미등록사유"] ?? ""}
                onChange={(v) => set("미등록사유", v)}
                detail={f["메모"] ?? ""}
                onDetail={(v) => set("메모", v)}
                extra={options["미등록사유"]}
              />
            </L>
          )}
          <Sel label="성별" k="성별" f={f} set={set} opts={options["성별"]} />
          <Sel label="나이대" k="나이대" f={f} set={set} opts={options["나이대"]} />
          <L label="방문 약속 일시" full>
            <input
              className="input"
              type="datetime-local"
              value={f["약속일시"] ?? ""}
              onChange={(e) => {
                set("약속일시", e.target.value);
                // 약속을 잡으면 상태도 같이 올려준다. 원하면 다시 바꿀 수 있다
                if (e.target.value && (f["진행상태"] === "예약" || !f["진행상태"])) {
                  set("진행상태", "약속전환");
                }
              }}
            />
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
  const [stage, setStage] = useState(stageNow(item));
  const [nextDate, setNextDate] = useState(item["다음연락예정일"] ?? "");
  const [reason, setReason] = useState(item["미등록사유"] ?? "");
  /*
    등록으로 넘길 때 상담자를 다시 묻는다

    상담을 화면에 넣는 것은 데스크에서 대신 해 주는 일이 흔하다. 그래서
    처음 접수할 때 적힌 상담자가 실제로 상담한 사람이 아닐 때가 있다.
    등록으로 넘어가는 순간이 그것을 바로잡는 유일한 자리다 — 이때 놓치면
    매출은 붙었는데 누가 상담했는지는 틀린 채로 남는다.

    빈 값은 「그대로 둡니다」다. 손대지 않으면 아무것도 안 바뀐다.
  */
  const [newOwner, setNewOwner] = useState("");
  const [reasonMemo, setReasonMemo] = useState("");
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
          문의채널: f["문의채널"] ?? f["방문경로"] ?? "",
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
    // 사유를 안 남기면 나중에 왜 놓쳤는지 알 수 없다
    if (stage === "미등록" && !reason) return setMsg("미등록 사유를 골라주세요.");

    setBusy(true);
    const res = await fetch("/api/consultations/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        changes: {
          진행상태: stage,
          다음연락예정일: nextDate,
          미등록사유: stage === "미등록" ? reason : "",
          /* 고른 것이 있을 때만 넣는다. 빈 값을 보내면 적혀 있던 상담자가 지워진다 */
          ...(newOwner ? { 상담자사번: newOwner } : {}),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setMsg(data.error ?? "저장하지 못했습니다.");
    }

    /* 회원 목록에 올라갔는지 알려준다. 조용히 넘어가면 「올라간 건가」 하고
       회원 화면에 가서 또 손으로 넣게 된다 — 그러면 같은 사람이 둘이 된다 */
    tellEnrolled(data);

    // 자세한 사정은 연락 이력에 남겨서 나중에 읽을 수 있게 한다
    if (stage === "미등록" && reasonMemo.trim()) {
      await fetch("/api/consultations/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          kind: isNoShowReason(reason) ? "미방문" : "미등록",
          content: `${reason} · ${reasonMemo.trim()}`,
        }),
      });
    }
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
          <span className={`pill ${STAGE_TONE[stageNow(item)] ?? ""}`}>{stageNow(item)}</span>
        </div>

        {isAutoFail(item) && (
          <div className="alert-soft">
            약속 날짜가 지난 달인데 결론이 입력되지 않아 <b>미등록</b>으로 마감된 건입니다.
            실제로 등록하셨다면 아래에서 등록으로 바꿔주세요.
          </div>
        )}
        {needsResult(item) && (
          <div className="alert-soft">
            약속 날짜가 지났습니다. 등록 또는 미등록을 아래에서 정해주세요.
            이번 달 안에 등록하시면 등록으로 인정됩니다.
          </div>
        )}

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
              <L label="상담일시">
                <input className="input" type="datetime-local"
                       value={forInput(f["상담날짜"] ?? "")}
                       onChange={(e) => setV("상담날짜", e.target.value.replace("T", " "))} />
              </L>
              <L label="상담자">
                <select className="input" value={f["상담자사번"] ?? ""} onChange={(e) => setV("상담자사번", e.target.value)}>
                  {Object.entries(staffNames).map(([id, nm]) => (
                    <option key={id} value={id}>{nm}</option>
                  ))}
                </select>
              </L>
              <L label="문의 채널">
                <select className="input" value={f["문의채널"] || f["방문경로"] || ""}
                        onChange={(e) => setV("문의채널", e.target.value)}>
                  <option value="">선택</option>
                  {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </L>
              <Sel label="문의유형" k="문의유형" f={f} set={setV} opts={options["문의유형"]} />
              <Sel label="성별" k="성별" f={f} set={setV} opts={options["성별"]} />
              <Sel label="나이대" k="나이대" f={f} set={setV} opts={options["나이대"]} />
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
          <Kv k="상담일시"
              v={`${korDate(whenOf(item).date)}${
                whenOf(item).time ? ` ${whenOf(item).time}` : " (시각 모름)"
              }`} />
          {/* 문의가 들어온 시각과 우리가 넣은 시각은 다른 것이다.
              둘을 섞어 쓰다 한 번 틀렸다 — 이제 따로 적는다 */}
          <Kv k="넣은 시각" v={enteredAt(item) || "-"} />
          <Kv k="지점" v={branchName} />
          <Kv k="문의 채널" v={chan(item)} />
          <Kv k="문의유형" v={item["문의유형"]} />
          <Kv k="성별 · 나이" v={[item["성별"], item["나이대"]].filter(Boolean).join(" · ")} />
          {/* 상담을 한 사람과 화면에 넣은 사람은 다를 수 있다.
              접수는 데스크에서 대신 해 주는 일이 흔하다 */}
          <Kv k="상담자" v={staffNames[item["상담자사번"]] ?? "-"} />
          <Kv k="등록자" v={staffNames[item["접수자사번"]] ?? "-"} />
          <Kv k="방문 약속" v={item["약속일시"]?.replace("T", " ")} />
          <Kv
            k={isNoShowReason(item["미등록사유"]) ? "미방문 사유" : "미등록 사유"}
            v={item["미등록사유"]}
          />
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
            {stage === DONE_STAGE && stageNow(item) !== DONE_STAGE && (
              <div className="ask-box">
                <b>이 상담을 실제로 진행한 분이 누구입니까?</b>
                <p>
                  지금은 <b>{staffNames[item["상담자사번"]] ?? "-"}</b>님으로 적혀 있습니다.
                  접수는 데스크에서 대신 해 주는 일이 흔해, 적힌 사람과 실제로 상담한 사람이
                  다를 수 있습니다. 여기서 고른 분이 <b>상담자</b>로 기록됩니다.
                </p>
                <select className="input" style={{ maxWidth: 200 }}
                        value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
                  <option value="">그대로 둡니다</option>
                  {Object.entries(staffNames).map(([id, nm]) => (
                    <option key={id} value={id}>{nm}</option>
                  ))}
                </select>
              </div>
            )}
            {stage === "미등록" && (
              <ReasonPick
                value={reason}
                onChange={setReason}
                detail={reasonMemo}
                onDetail={setReasonMemo}
                extra={options["미등록사유"]}
              />
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

/**
 * 미등록 사유 고르기
 *
 * 미방문인지 방문 후 등록실패인지를 먼저 나누고, 그다음 사유를 고른다.
 * 시트 선택목록에 대표님이 따로 넣은 값이 있으면 뒤에 같이 보여준다.
 */
function ReasonPick({
  value, onChange, detail, onDetail, extra,
}: {
  value: string;
  onChange: (v: string) => void;
  detail: string;
  onDetail: (v: string) => void;
  extra?: string[];
}) {
  const known = [...NOSHOW_REASONS, ...FAIL_REASONS];
  const more = (extra ?? []).filter((r) => r && !known.includes(r));

  return (
    <div className="reason-box">
      <div className="reason-tabs">
        <button
          type="button"
          className={`mini-tab${value && isNoShowReason(value) ? " on" : ""}`}
          onClick={() => onChange(NOSHOW_REASONS[0])}
        >
          미방문
        </button>
        <button
          type="button"
          className={`mini-tab${value && !isNoShowReason(value) ? " on" : ""}`}
          onClick={() => onChange(FAIL_REASONS[0])}
        >
          방문했으나 미등록
        </button>
      </div>

      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">사유를 골라주세요</option>
        <optgroup label="미방문 — 약속했는데 안 옴">
          {NOSHOW_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </optgroup>
        <optgroup label="방문했으나 미등록">
          {FAIL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </optgroup>
        {more.length > 0 && (
          <optgroup label="직접 추가한 사유">
            {more.map((r) => <option key={r} value={r}>{r}</option>)}
          </optgroup>
        )}
      </select>

      <input
        className="input"
        placeholder="자세한 사정이 있으면 적어주세요 (선택)"
        value={detail}
        onChange={(e) => onDetail(e.target.value)}
      />
    </div>
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
