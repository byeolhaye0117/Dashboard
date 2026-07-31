/**
 * 연결 점검 화면
 *
 * 구글 시트 연결이 안 될 때, 무엇이 잘못됐는지 한국어로 알려준다.
 * 개발자를 부르지 않고도 원인을 찾을 수 있게 하기 위한 화면이다.
 */
import { listSheetNames, readSheet } from "@/lib/sheets";
import { diagnosePrivateKey } from "@/lib/privateKey";

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

  const allOk = checks.every((c) => c.ok);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>연결 점검</h1>
      <p style={{ color: "#666", fontSize: 14, marginTop: 0 }}>
        대시보드가 구글 시트를 제대로 읽을 수 있는지 확인합니다.
      </p>

      <div
        style={{
          background: allOk ? "#ecfdf5" : "#fef2f2",
          border: `1px solid ${allOk ? "#a7f3d0" : "#fecaca"}`,
          borderRadius: 10,
          padding: 16,
          margin: "20px 0",
        }}
      >
        <strong style={{ color: allOk ? "#065f46" : "#991b1b" }}>
          {allOk ? "모두 정상입니다. 로그인 화면으로 가셔도 됩니다." : "아래 빨간 항목을 확인해주세요."}
        </strong>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          {checks.map((c) => (
            <tr key={c.name} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "10px 6px", width: 28 }}>{c.ok ? "✅" : "❌"}</td>
              <td style={{ padding: "10px 6px", fontWeight: 600 }}>{c.name}</td>
              <td style={{ padding: "10px 6px", color: c.ok ? "#666" : "#b91c1c" }}>{c.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rawError && (
        <details style={{ marginTop: 22, fontSize: 12, color: "#6b7280" }}>
          <summary style={{ cursor: "pointer" }}>구글이 보낸 원래 메시지 보기 (개발자용)</summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              background: "#f9fafb",
              padding: 12,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            {rawError.slice(0, 800)}
          </pre>
        </details>
      )}

      <p style={{ marginTop: 24 }}>
        <a href="/" style={{ color: "#4f46e5" }}>로그인 화면으로</a>
      </p>
    </main>
  );
}
