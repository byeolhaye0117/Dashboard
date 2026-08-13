/**
 * 답글 코어를 원본에서 다시 뽑아온다
 *
 * 답글의 주인은 플레이스 진단 서버(naver_place/reply-core.js)다. 대시보드는
 * 그 서버에 닿지 못할 때만 쓰는 사본을 하나 갖고 있는데, 그 사본을 손으로
 * 옮겨 적으면 반드시 어딘가 달라진다. 실제로 그것 때문에 답글의 인사말과
 * 이모지가 원본과 달랐고, 사장님이 세 번 되돌려 보내셨다.
 *
 * 그래서 손으로 옮기지 않는다. 이 스크립트가 원본에서 통째로 떠 온다.
 * 하는 일은 셋뿐이다 — 브라우저/서버 양쪽을 받는 껍데기를 벗기고,
 * 밖에서 쓸 수 있게 export 를 붙이고, 타입스크립트가 걸고 넘어지는
 * 네 자리를 고친다. 안의 판단은 한 줄도 건드리지 않는다.
 *
 *   node scripts/sync-reply-core.mjs ../naver_place/reply-core.js
 *
 * 원본이 바뀌면 이걸 다시 돌리고 커밋하면 된다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("원본 경로를 주세요. 예) node scripts/sync-reply-core.mjs ../naver_place/reply-core.js");
  process.exit(1);
}

const OUT = resolve("src/lib/replyCore.ts");
let s = readFileSync(resolve(src), "utf8");

/* UMD 껍데기를 벗긴다 — 대시보드는 ES 모듈 하나만 쓴다 */
const OPEN = "function () {\n";
const start = s.indexOf(OPEN);
const end = s.lastIndexOf("  return {");
if (start < 0 || end < 0) {
  console.error("원본 모양이 바뀌었습니다. 껍데기를 못 찾았습니다 — 눈으로 보고 이 스크립트를 고쳐주세요.");
  process.exit(1);
}
let body = s.slice(start + OPEN.length, end);

/* 맨 앞 열에 있는 것만 밖으로 낸다. 안쪽 들여쓰기된 것은 원본에서도 속사정이다 */
body = body.replace(/^const /gm, "export const ").replace(/^function /gm, "export function ");

/* 타입스크립트가 걸고 넘어지는 자리. 값이 아니라 표기만 바꾼다 */
const FIX = [
  ["export const SAFE_SWAP = [", "export const SAFE_SWAP: any[] = ["],
  ["SAFE_SWAP.forEach(([re, to]) =>", "SAFE_SWAP.forEach(([re, to]: any) =>"],
  ["export function replySafe(t) {", "export function replySafe(t: string) {"],
  ["const out = new Set();", "const out = new Set<string>();"],
];
for (const [from, to] of FIX) {
  if (!body.includes(from)) {
    console.error(`원본에서 「${from}」 를 못 찾았습니다. 고칠 자리가 바뀌었는지 봐주세요.`);
    process.exit(1);
  }
  body = body.replace(from, to);
}

const head = `/**
 * 답글 지시문 · 재료 · 견본 · 말투 — naver_place/reply-core.js 에서 뜬 사본
 *
 * 손으로 고치지 마세요. scripts/sync-reply-core.mjs 가 원본에서 통째로 떠 온
 * 것입니다. 고치실 것이 있으면 원본을 고치고 그 스크립트를 다시 돌리세요.
 *
 * 원본은 naver_place 저장소에 있고, 그쪽 /api/reply 가 답글의 주인입니다.
 * 이 사본은 그 서버에 닿지 못할 때만 씁니다 — 무료 서버라 자고 있거나
 * 아직 새 코드를 못 받았을 때 답글을 아예 못 만들면 안 되기 때문입니다.
 * 사본으로 쓴 답글은 화면에 그렇다고 적습니다.
 */
`;

writeFileSync(OUT, head + body.replace(/^\n+/, "\n"));
console.log(`${OUT} 다시 떴습니다 (${(head + body).length}자)`);
