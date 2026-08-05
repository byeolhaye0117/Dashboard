/**
 * 수업 후 사진 보관 (서버 전용)
 *
 * 구글 드라이브에 두려 했으나 못 쓴다. 구글은 프로그램용 계정에 저장 용량을
 * 0으로 주고, 폴더를 편집자로 공유해도 파일을 만드는 주체가 그 계정이라 막힌다.
 * 권한 설정으로는 풀리지 않는 구조 문제다.
 *
 * 그래서 이 대시보드가 올라가 있는 곳(Vercel)의 저장소를 쓴다.
 * 새로 가입할 곳이 없고, 열쇠를 복사해 붙여넣는 단계도 없다.
 *
 * 사진 주소는 시트에 적히지만 화면으로는 절대 내보내지 않는다.
 * 대시보드가 대신 받아서 보여준다 — 주소만 알면 누구나 보이는 상태로 두지 않는다.
 */
import { put, get } from "@vercel/blob";

const TOKEN = "BLOB_READ_WRITE_TOKEN";

/** 저장소가 준비됐는지 — 화면에서 안내를 띄울지 정할 때 쓴다 */
export function photoStoreReady(): string {
  if (process.env[TOKEN]) return "";
  return (
    "사진을 보관할 곳이 아직 연결되지 않았습니다. " +
    "vercel.com 에서 이 프로젝트를 열고 Storage 탭 → Create → Blob 을 만들어주세요. " +
    "만들면 자동으로 연결되고, 따로 옮겨 적을 것은 없습니다."
  );
}

/** 사진을 올리고 주소를 돌려준다 */
export async function uploadPhoto(
  name: string,
  mime: string,
  bytes: ArrayBuffer
): Promise<string> {
  const why = photoStoreReady();
  if (why) throw new Error(why);

  /*
    비공개로 올린다. 회원이 찍힌 사진이라 주소를 알아낸다고 열리면 안 된다.
    보여줄 때는 대시보드가 로그인을 확인하고 대신 받아온다.
  */
  const { url } = await put(`lesson/${name}`, bytes, {
    access: "private",
    contentType: mime,
    // 같은 날 다시 보고해도 앞의 사진을 덮지 않도록 이름 뒤에 임의의 글자를 붙인다
    addRandomSuffix: true,
  });
  return url;
}

/**
 * 사진을 가져온다
 *
 * 주소를 그대로 믿고 받아오면, 아무 주소나 넣어서 서버로 하여금
 * 엉뚱한 곳에 접속하게 만들 수 있다. 우리 저장소 주소만 받는다.
 */
export async function readPhoto(url: string): Promise<{ body: ArrayBuffer; mime: string }> {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("사진 주소가 올바르지 않습니다.");
  }
  // 비공개·공개 저장소가 서로 다른 주소를 쓰므로 둘 다 받는다
  if (!/\.blob\.vercel-storage\.com$/.test(host)) {
    throw new Error("우리 저장소의 사진이 아닙니다.");
  }

  const got = await get(url, { access: "private" });
  if (!got) throw new Error("사진을 찾지 못했습니다.");
  return {
    body: await new Response(got.stream).arrayBuffer(),
    mime: got.headers.get("content-type") ?? got.blob?.contentType ?? "image/jpeg",
  };
}
