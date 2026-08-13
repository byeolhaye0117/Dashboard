/** @type {import('next').NextConfig} */

/*
  화면에 박아 둘 판 번호

  "올렸다 / 안 바뀌었다"를 말로 주고받으면 확인할 방법이 없다. 배포될 때마다
  바뀌는 값을 화면 구석에 적어 두면, 새로고침이 됐는지 한눈에 알 수 있다.
  Vercel 이 넣어 주는 커밋 번호를 쓰고, 없으면(내 컴퓨터) 빌드한 시각을 쓴다.
*/
const stamp =
  (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) ||
  new Date().toISOString().slice(5, 16).replace("T", " ");

const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD: stamp },

  /*
    화면을 브라우저가 오래 물고 있지 않게

    휴대폰 브라우저는 한 번 받은 화면을 며칠씩 그대로 쓰기도 한다. 그러면
    새로 올려도 옛 화면이 계속 보인다. 이 화면들은 늘 서버에서 새로 그리는
    것이라 담아 둘 값어치가 없다 — 담아 두지 말라고 못 박는다.
    (JS·CSS 파일은 이름에 지문이 붙어 있어 그대로 담아 둬도 안전하다.
     여기서 막는 것은 화면 문서뿐이다.)
  */
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};
export default nextConfig;
