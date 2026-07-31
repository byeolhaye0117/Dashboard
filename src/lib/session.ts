/**
 * 로그인 상태 관리
 *
 * 중요: 비밀번호 확인도, 권한 확인도 전부 서버에서 한다.
 * 브라우저에는 "누구인지"만 암호로 봉인해서 담아두고, 비밀번호는 절대 내려보내지 않는다.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const COOKIE = "gym_session";

export type Session = {
  staffId: string;
  name: string;
  roleCode: string;
  roleName: string;
  scope: string;
  branches: string[];
  currentBranch: string;
  mustChangePassword: boolean;
};

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("환경변수 SESSION_SECRET 이 없거나 너무 짧습니다. 40자 이상으로 넣어주세요.");
  }
  return new TextEncoder().encode(s);
}

export async function createSession(data: Session) {
  const token = await new SignJWT(data as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
