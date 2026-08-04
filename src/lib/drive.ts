/**
 * 구글 드라이브 (서버 전용)
 *
 * 수업 후 사진을 어디엔가 두어야 하는데, 이 대시보드가 올라가 있는 곳은
 * 파일을 계속 보관하지 못한다 (배포할 때마다 사라진다).
 * 시트를 이미 구글에 두고 있으니 사진도 같은 곳에 둔다 — 새로 가입할 곳이 없다.
 *
 * 폴더 번호를 환경변수로 받지 않고 "이름으로 찾는다".
 * 대표님이 하실 일이 폴더 하나 만들어 공유하는 것뿐이 되도록 하기 위해서다.
 * 번호를 복사해 Vercel 에 붙여넣는 일까지 시키면 한 단계가 더 늘어난다.
 */
import { JWT } from "google-auth-library";
import { normalizePrivateKey } from "./privateKey";

/** 대표님이 드라이브에 이 이름으로 폴더를 만들고 대시보드 계정에 공유하면 된다 */
export const PHOTO_FOLDER = "대시보드 수업사진";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 가 설정되어 있지 않습니다.`);
  return v;
}

let cached: { token: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const client = new JWT({
    email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: normalizePrivateKey(env("GOOGLE_PRIVATE_KEY")),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const { access_token, expiry_date } = await client.authorize();
  if (!access_token) throw new Error("구글 인증에 실패했습니다.");
  cached = { token: access_token, expiresAt: expiry_date ?? Date.now() + 3_000_000 };
  return access_token;
}

let folderId: string | null = null;

/**
 * 사진을 넣을 폴더를 찾는다
 *
 * 서비스 계정은 제 드라이브 용량이 없어서 폴더를 스스로 만들 수 없다.
 * 그래서 대표님이 만든 폴더를 공유받아 쓴다. 없으면 무엇을 해야 하는지 알려준다.
 */
export async function photoFolder(): Promise<string> {
  if (folderId) return folderId;

  const t = await token();
  const FOLDER = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";

  async function find(where: string): Promise<any> {
    const res = await fetch(
      `${API}/files?q=${encodeURIComponent(where)}&fields=files(id,name)&pageSize=10`,
      { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }
    );
    if (!res.ok) throw explain(res.status, await res.text());
    return (await res.json()).files ?? [];
  }

  // 이름을 정확히 맞춘 것을 먼저 찾고, 없으면 비슷한 이름까지 본다.
  // 폴더 이름에 날짜나 지점명을 덧붙이는 일이 흔해서, 그 정도는 알아서 찾아준다
  let hits = await find(`name = '${PHOTO_FOLDER}' and ${FOLDER}`);
  if (hits.length === 0) hits = await find(`name contains '${PHOTO_FOLDER}' and ${FOLDER}`);

  if (hits.length === 0) {
    // 공유할 주소를 화면에 같이 띄운다. 이걸 찾으러 다른 곳을 뒤지게 하면 안 된다
    throw new Error(
      `구글 드라이브에 「${PHOTO_FOLDER}」 폴더가 없습니다. ` +
        `드라이브에서 이 이름으로 폴더를 만들고, 아래 주소를 편집자로 공유해주세요.\n` +
        (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "(계정 주소를 읽지 못했습니다)")
    );
  }
  folderId = hits[0].id;
  return hits[0].id;
}

/**
 * 구글이 보낸 오류를 사람이 읽을 수 있는 말로 바꾼다
 *
 * 드라이브 기능이 꺼져 있을 때가 제일 흔한데, 구글이 주는 문장은 영문 한 문단이라
 * 무엇을 눌러야 하는지 알 수가 없다. 눌러야 할 곳을 대신 적어준다.
 */
function explain(status: number, body: string): Error {
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(body)) {
    return new Error(
      "구글 클라우드에서 드라이브 기능이 아직 켜져 있지 않습니다. " +
        "console.cloud.google.com/apis/library/drive.googleapis.com 에 들어가 " +
        "「사용」을 눌러주세요. 켜고 나서 1~2분 뒤에 다시 시도하시면 됩니다."
    );
  }
  if (status === 403) {
    return new Error(
      "구글 드라이브에 접근할 권한이 없습니다. 폴더 공유에서 대시보드 계정을 " +
        "뷰어가 아니라 편집자로 바꿔주세요."
    );
  }
  if (status === 401) {
    return new Error("구글 인증에 실패했습니다. 서비스 계정 정보를 확인해주세요.");
  }
  return new Error(`구글 드라이브 요청 실패 (${status}): ${body.slice(0, 200)}`);
}

/** 폴더가 준비됐는지만 본다 — 화면에서 안내를 띄울지 정할 때 쓴다 */
export async function photoFolderReady(): Promise<string> {
  try {
    await photoFolder();
    return "";
  } catch (e: any) {
    return String(e?.message ?? e);
  }
}

/**
 * 사진을 올리고 파일 번호를 돌려준다
 *
 * 올린 뒤 "링크가 있는 사람 모두 보기" 같은 공개 설정은 하지 않는다.
 * 회원이 찍힌 사진이 주소만 알면 누구나 보이는 상태가 되면 안 된다.
 * 대시보드를 거쳐서만 보이게 한다.
 */
export async function uploadPhoto(
  name: string,
  mime: string,
  bytes: ArrayBuffer
): Promise<string> {
  const parent = await photoFolder();
  // 사진 안에 우연히 들어 있을 리 없는 글자면 된다
  const boundary = "----gymdashboard-photo-boundary----";

  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [parent] }) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;

  const body = new Blob([head, bytes, tail], { type: `multipart/related; boundary=${boundary}` });

  const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw explain(res.status, await res.text());
  const data = await res.json();
  return data.id as string;
}

/** 사진 내용을 가져온다 — 화면에 보여줄 때 대시보드가 대신 받아온다 */
export async function readPhoto(fileId: string): Promise<{ body: ArrayBuffer; mime: string }> {
  const t = await token();
  const meta = await fetch(`${API}/files/${fileId}?fields=mimeType`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: "no-store",
  });
  if (!meta.ok) throw new Error("사진을 찾지 못했습니다.");
  const { mimeType } = await meta.json();

  const res = await fetch(`${API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("사진을 읽지 못했습니다.");
  return { body: await res.arrayBuffer(), mime: mimeType ?? "image/jpeg" };
}
