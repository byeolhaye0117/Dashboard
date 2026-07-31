/**
 * 전화번호 다루기
 *
 * 구글 시트는 "01082772896" 을 숫자로 보고 앞의 0 을 지워버린다.
 * 그래서 저장할 때 하이픈을 넣어 글자로 만든다. 010-8277-2896 은 숫자가 아니다.
 */

/** 저장용 — 010-8277-2896 형태로 다듬는다 */
export function formatPhone(raw: string): string {
  const d = (raw ?? "").replace(/[^0-9]/g, "");
  if (!d) return "";

  // 휴대폰 (010-1234-5678)
  if (d.length === 11 && d.startsWith("01")) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  // 앞자리 0 이 이미 잘려나간 값 (1082772896)
  if (d.length === 10 && d.startsWith("1")) {
    const f = "0" + d;
    return `${f.slice(0, 3)}-${f.slice(3, 7)}-${f.slice(7)}`;
  }
  // 서울 (02-123-4567 / 02-1234-5678)
  if (d.startsWith("02")) {
    return d.length === 9
      ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
      : `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  // 그 밖의 지역번호 (041-000-0000)
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;

  return raw;
}

/** 화면 표시용 — 이미 0 이 잘려 저장된 값도 제대로 보여준다 */
export function showPhone(stored: string): string {
  return formatPhone(stored) || stored;
}
