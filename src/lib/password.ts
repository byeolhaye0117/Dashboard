/**
 * 비밀번호 규칙
 *
 * 규칙을 빡빡하게 만들면 직원들이 종이에 적어 모니터에 붙인다.
 * 그러면 규칙이 없느니만 못하다. 그래서 "길이"와 "누구나 먼저 넣어볼 것"만 막는다.
 * 대문자·특수문자를 강요하지 않는 이유도 같다.
 */

/** 아무나 먼저 넣어보는 것들 */
const TOO_EASY = [
  "password", "passw0rd", "qwerty", "qwertyui", "asdfasdf", "asdfghjk",
  "11111111", "00000000", "12341234", "abcd1234", "1q2w3e4r", "1234qwer",
  "gym12345", "admin123", "administrator", "letmein", "iloveyou",
];

/** 1234567 · 87654321 처럼 죽 이어지는가 */
function isRun(v: string): boolean {
  if (v.length < 4) return false;
  let up = true;
  let down = true;
  for (let i = 1; i < v.length; i++) {
    const d = v.charCodeAt(i) - v.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  return up || down;
}

/**
 * 쓸 수 있는 비밀번호인지 본다
 *
 * 문제가 없으면 빈 글자를, 있으면 무엇이 문제인지 한국어로 돌려준다.
 * "규칙에 맞지 않습니다" 로만 알려주면 몇 번을 다시 넣어야 하는지 알 수 없다.
 */
export function checkPassword(plain: string, about?: { phone?: string; name?: string }): string {
  const v = String(plain ?? "");

  if (v.length < 8) return "비밀번호는 8자 이상으로 정해주세요.";
  if (v.length > 64) return "비밀번호가 너무 깁니다. 64자 아래로 정해주세요.";
  if (/\s/.test(v)) return "비밀번호에 띄어쓰기는 넣을 수 없습니다.";

  const low = v.toLowerCase();
  if (TOO_EASY.includes(low)) return "너무 흔한 비밀번호입니다. 다른 것으로 정해주세요.";
  if (new Set(v).size === 1) return "같은 글자만으로는 정할 수 없습니다.";
  if (isRun(v)) return "1234처럼 이어지는 숫자·글자만으로는 정할 수 없습니다.";

  // 반복만 한 것 (abcabcabc, 12121212)
  for (let n = 1; n <= Math.floor(v.length / 2); n++) {
    if (v.length % n === 0 && v.slice(0, n).repeat(v.length / n) === v) {
      if (n <= 4) return "같은 부분을 반복한 비밀번호는 정할 수 없습니다.";
    }
  }

  const digits = (about?.phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length >= 8 && v.length >= 8 && digits.includes(v.replace(/[^0-9]/g, "")) &&
      /^[0-9]+$/.test(v)) {
    return "전화번호를 그대로 쓰시면 안 됩니다. 다른 것으로 정해주세요.";
  }

  return "";
}
