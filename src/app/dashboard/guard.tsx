/**
 * 화면이 통째로 죽는 것을 막는다
 *
 * 화면 하나가 구글 시트를 읽다 실패하면 지금까지는 흰 바탕에
 * "Application error: a server-side exception has occurred" 만 떴다.
 * 무엇이 잘못됐는지 쓰는 분도, 만드는 사람도 알 수가 없다.
 *
 * 그래서 화면 그리는 일을 통째로 감싸고, 실패하면 이유를 한국어로 보여준다.
 * 이유를 감추지 않고 그대로 적는다 — 로그인한 사람만 보는 화면이고,
 * "탭이 없다 / 권한이 없다" 같은 말이 곧 해결 방법이기 때문이다.
 */
import Icon from "@/components/Icon";

/**
 * next 의 redirect() · notFound() 는 오류가 아니라 "이동 신호"다
 *
 * 내부적으로 예외를 던져서 위로 올라가는 방식이라, 여기서 같이 잡아버리면
 * 로그인 화면으로 보내야 할 때 오류 화면이 뜬다. 그래서 다시 던진다.
 */
function isNavigation(e: any): boolean {
  const d = e?.digest;
  if (typeof d !== "string") return false;
  return (
    d.startsWith("NEXT_REDIRECT") ||
    d.startsWith("NEXT_NOT_FOUND") ||
    d.startsWith("NEXT_HTTP_ERROR_FALLBACK")
  );
}

export async function guard(where: string, render: () => Promise<any>): Promise<any> {
  try {
    return await render();
  } catch (e: any) {
    if (isNavigation(e)) throw e;
    return <Broken where={where} message={String(e?.message ?? e)} />;
  }
}

function Broken({ where, message }: { where: string; message: string }) {
  return (
    <div className="broken">
      <div className="broken-card">
        <span className="broken-mark">
          <Icon name="warn" size={22} />
        </span>
        <h1>{where} 화면을 열지 못했습니다</h1>
        <p>
          구글 시트를 읽는 중에 막혔습니다. 아래 문장이 막힌 이유입니다.
          <br />
          그대로 알려주시면 어디를 고쳐야 하는지 바로 알 수 있습니다.
        </p>
        <pre className="broken-why">{message || "이유를 알 수 없습니다."}</pre>
        <div className="broken-acts">
          <a className="btn-primary" href="">다시 시도</a>
          <a className="btn-ghost" href="/dashboard">홈으로</a>
        </div>
      </div>
    </div>
  );
}
