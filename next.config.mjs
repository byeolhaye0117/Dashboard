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
};
export default nextConfig;
