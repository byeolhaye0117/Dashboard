/**
 * 연결 점검 화면
 *
 * 구글 시트 연결이 안 될 때, 무엇이 잘못됐는지 한국어로 알려준다.
 * 개발자를 부르지 않고도 원인을 찾을 수 있게 하기 위한 화면이다.
 */
import { listSheetNames, readSheet } from "@/lib/sheets";
import { diagnosePrivateKey } from "@/lib/privateKey";
import { getStaffAll, getStaffBranches } from "@/lib/data";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

const REQUIRED_SHEETS = [
  "지점",
  "직급",
  "권한",
  "직원",
  "직원담당지점",
  "상품",
  "상품판매지점",
  "선택목록",
];

const ENVS = [
  { key: "GOOGLE_SHEET_ID", label: "구글 시트 주소의 ID" },
  { key: "GOOGLE_SERVICE_ACCOUNT_EMAIL", label: "서비스 계정 이메일" },
  { key: "GOOGLE_PRIVATE_KEY", label: "서비스 계정 비밀키" },
  { key: "SESSION_SECRET", label: "로그인 암호화 키" },
  { key: "ADMIN_INIT_PASSWORD", label: "대표 최초 로그인 비밀번호" },
];

type Check = { name: string; ok: boolean; detail: string };

export default async function SetupPage() {
  const checks: Check[] = [];

  for (const e of ENVS) {
    const v = process.env[e.key];
    checks.push({
      name: `${e.label} (${e.key})`,
      ok: Boolean(v),
      detail: v ? "설정됨" : "Vercel 환경변수에 넣어주세요",
    });
  }

  // 비밀키 형태 점검 (키 내용 자체는 화면에 절대 나오지 않는다)
  const keyCheck = diagnosePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  checks.push({ name: "비밀키 형태", ok: keyCheck.ok, detail: keyCheck.detail });

  let names: string[] = [];
  let connected = false;
  let rawError = "";
  try {
    names = await listSheetNames();
    connected = true;
    checks.push({ name: "구글 시트 연결", ok: true, detail: `탭 ${names.length}개를 읽었습니다` });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    rawError = msg;
    let hint = msg;
    if (msg.includes("403")) {
      hint = "시트에 서비스 계정을 편집자로 공유했는지 확인해주세요.";
    } else if (msg.includes("404")) {
      hint = "GOOGLE_SHEET_ID 가 틀렸습니다. 시트 주소를 다시 확인해주세요.";
    } else if (msg.includes("invalid_grant")) {
      hint = "구글이 이 계정을 거절했습니다. 서비스 계정 이메일과 비밀키가 같은 JSON 파일에서 나온 것인지 확인해주세요.";
    } else if (msg.includes("DECODER") || msg.includes("PEM") || msg.includes("asn1")) {
      hint = "비밀키를 읽지 못했습니다. JSON 파일의 private_key 값을 따옴표 없이 통째로 넣어주세요.";
    } else if (msg.includes("Invalid JWT") || msg.includes("signature")) {
      hint = "비밀키가 이 서비스 계정의 것이 아닙니다. 키를 새로 만들어 다시 넣어주세요.";
    }
    checks.push({ name: "구글 시트 연결", ok: false, detail: hint });
  }

  if (connected) {
    for (const s of REQUIRED_SHEETS) {
      if (!names.includes(s)) {
        checks.push({ name: `${s} 탭`, ok: false, detail: "탭이 없습니다" });
        continue;
      }
      try {
        const { rows, headers } = await readSheet(s);
        checks.push({
          name: `${s} 탭`,
          ok: rows.length > 0,
          detail: rows.length > 0 ? `${rows.length}줄 · 칸 ${headers.length}개` : "내용이 비어 있습니다",
        });
      } catch (e: any) {
        checks.push({ name: `${s} 탭`, ok: false, detail: String(e?.message ?? e).slice(0, 120) });
      }
    }
  }

  // 로그인이 가능한 상태인지 — 대표 계정을 실제로 들여다본다
  if (connected) {
    try {
      const [staff, branchMap] = await Promise.all([getStaffAll(), getStaffBranches()]);
      const owners = staff.filter((s) => s.roleCode === "R1");

      if (owners.length === 0) {
        checks.push({
          name: "대표 계정",
          ok: false,
          detail: "직원 탭에 직급코드가 R1 인 줄이 없습니다",
        });
      } else {
        const o = owners[0];
        const myBranches = branchMap.get(o.id) ?? [];
        if (o.mainBranch && !myBranches.includes(o.mainBranch)) myBranches.push(o.mainBranch);

        checks.push({
          name: "대표 계정",
          ok: o.active,
          detail: o.active
            ? `${o.name} · 사번 ${o.id} · 재직중`
            : `${o.name} · 계정사용 또는 재직상태를 확인해주세요 (현재: ${o.status})`,
        });

        checks.push({
          name: "대표 담당 지점",
          ok: myBranches.length > 0,
          detail:
            myBranches.length > 0
              ? `${myBranches.join(" · ")} 에서 로그인 가능`
              : "직원담당지점 탭에 대표 사번이 없습니다",
        });

        const init = process.env.ADMIN_INIT_PASSWORD;
        if (o.passwordHash) {
          checks.push({
            name: "대표 로그인 방법",
            ok: true,
            detail: "이미 정한 비밀번호로 로그인하세요 (임시 비밀번호는 더 이상 쓰이지 않습니다)",
          });
        } else if (init) {
          checks.push({
            name: "대표 로그인 방법",
            ok: true,
            detail: `임시 비밀번호로 로그인하세요 (${init.length}자)`,
          });
        } else {
          checks.push({
            name: "대표 로그인 방법",
            ok: false,
            detail:
              "비밀번호가 아직 없는데 ADMIN_INIT_PASSWORD 도 없습니다. 환경변수에 넣고 다시 배포해주세요.",
          });
        }
      }
    } catch (e: any) {
      checks.push({ name: "대표 계정", ok: false, detail: String(e?.message ?? e).slice(0, 160) });
    }
  }

  const allOk = checks.every((c) => c.ok);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "36px 20px 60px" }}>
      <h1 className="h1">연결 점검</h1>
      <p className="sub">대시보드가 구글 시트를 제대로 읽을 수 있는지 확인합니다.</p>

      <div
        className="banner"
        style={{
          background: allOk ? "var(--good-soft)" : "var(--bad-soft)",
          borderColor: allOk ? "var(--good)" : "var(--bad)",
        }}
      >
        <span className="lead" style={{ color: allOk ? "var(--good)" : "var(--bad)" }}>
          <Icon name={allOk ? "check" : "warn"} size={18} />
        </span>
        <div>
          <b>{allOk ? "모두 정상입니다" : "아래 빨간 항목을 확인해주세요"}</b>
          <p>{allOk ? "로그인 화면으로 가셔도 됩니다." : "각 줄에 원인이 적혀 있습니다."}</p>
        </div>
      </div>

      <div className="panel">
        <div className="bd" style={{ padding: "4px 15px" }}>
          <table className="check-table">
            <tbody>
              {checks.map((c) => (
                <tr key={c.name}>
                  <td style={{ color: c.ok ? "var(--good)" : "var(--bad)" }}>
                    <Icon name={c.ok ? "check" : "warn"} size={15} strokeWidth={2} />
                  </td>
                  <td>{c.name}</td>
                  <td className={c.ok ? "pass" : "fail"}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rawError && (
        <details style={{ marginTop: 18, fontSize: 12, color: "var(--muted)" }}>
          <summary style={{ cursor: "pointer" }}>구글이 보낸 원래 메시지 보기 (개발자용)</summary>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--surface-2)",
                        padding: 12, borderRadius: 8, marginTop: 8 }}>
            {rawError.slice(0, 800)}
          </pre>
        </details>
      )}

      <p style={{ marginTop: 22, display: "flex", gap: 12, alignItems: "baseline" }}>
        <a href="/" style={{ color: "var(--point)", fontWeight: 600 }}>로그인 화면으로</a>
        <span className="build-tag">
          화면 버전 {(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "로컬"}
        </span>
      </p>
    </main>
  );
}
