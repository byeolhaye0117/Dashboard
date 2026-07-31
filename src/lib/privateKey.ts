/**
 * 서비스 계정 비밀키 정리
 *
 * JSON 파일에서 복사해 Vercel에 붙여넣을 때 실수가 잦다.
 * 흔한 실수를 여기서 알아서 바로잡고, 그래도 안 되면 무엇이 문제인지 알려준다.
 */

const BEGIN = "-----BEGIN PRIVATE KEY-----";
const END = "-----END PRIVATE KEY-----";

/** 어떻게 붙여넣었든 쓸 수 있는 형태로 다듬는다 */
export function normalizePrivateKey(raw: string): string {
  let k = (raw ?? "").trim();
  if (!k) return "";

  // 줄 끝에 딸려온 쉼표
  while (k.endsWith(",")) k = k.slice(0, -1).trim();

  // 통째로 감싼 따옴표
  for (let i = 0; i < 2; i++) {
    if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
      k = k.slice(1, -1).trim();
    }
  }

  // "private_key": "..." 를 통째로 붙여넣은 경우
  const m = k.match(/"private_key"\s*:\s*"([\s\S]*?)"/);
  if (m) k = m[1];

  // 글자 \n 을 진짜 줄바꿈으로
  k = k.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");

  // 머리말·꼬리말이 없으면 붙여준다 (본문만 복사한 경우)
  if (!k.includes(BEGIN)) {
    const body = k.replace(/\s+/g, "");
    if (body.length > 100) {
      const lines = body.match(/.{1,64}/g) ?? [];
      k = [BEGIN, ...lines, END].join("\n");
    }
  }

  // 머리말·꼬리말이 한 줄로 붙어 있으면 떼어낸다
  k = k.replace(new RegExp(`${BEGIN}\\s*`), `${BEGIN}\n`);
  k = k.replace(new RegExp(`\\s*${END}`), `\n${END}`);

  return k.trim() + "\n";
}

export type KeyDiagnosis = {
  ok: boolean;
  detail: string;
};

/** 비밀키가 형태상 멀쩡한지 본다. 키 내용 자체는 절대 밖으로 내보내지 않는다. */
export function diagnosePrivateKey(raw: string | undefined): KeyDiagnosis {
  if (!raw) return { ok: false, detail: "값이 비어 있습니다" };

  const problems: string[] = [];
  const t = raw.trim();

  if (t.startsWith('"') || t.startsWith("'")) problems.push("앞에 따옴표가 붙어 있습니다");
  if (t.endsWith(",")) problems.push("끝에 쉼표가 붙어 있습니다");

  const k = normalizePrivateKey(raw);

  if (!k.includes(BEGIN)) problems.push("-----BEGIN PRIVATE KEY----- 부분이 없습니다");
  if (!k.includes(END)) problems.push("-----END PRIVATE KEY----- 부분이 없습니다");

  const body = k.replace(BEGIN, "").replace(END, "").replace(/\s+/g, "");

  // 첫 줄만 들어온 전형적인 경우
  if (k.includes(BEGIN) && body.length === 0) {
    return {
      ok: false,
      detail:
        "첫 줄만 들어왔습니다. 여러 줄을 한 줄짜리 칸에 붙여넣으면 뒷부분이 잘립니다. " +
        "JSON 파일에서 \\n 이 글자 그대로 보이는 한 줄짜리 값을 복사해 넣어주세요.",
    };
  }

  if (body.length < 800) {
    problems.push(`내용이 너무 짧습니다 (${body.length}자, 보통 1600자 안팎)`);
  }
  if (/[^A-Za-z0-9+/=]/.test(body)) {
    problems.push("이상한 문자가 섞여 있습니다");
  }

  if (problems.length === 0) {
    return { ok: true, detail: `형태 정상 (본문 ${body.length}자)` };
  }
  return { ok: false, detail: problems.join(" · ") };
}
