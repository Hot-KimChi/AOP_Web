// middleware.js
import { NextResponse } from 'next/server';

export async function middleware(req) {
  const { pathname, origin } = req.nextUrl;

  // 로그인 페이지로 이동하는 경우 제외
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // 쿠키에서 token 확인
  const token = req.cookies.get('token');

  // 토큰이 없는 경우 로그인 페이지로 리다이렉트
  if (!token) {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    // 토큰 유효성 검사
    const decoded = jwt.verify(token, SECRET_KEY);

    // 토큰이 유효한 경우 정상적으로 페이지 로드
    return NextResponse.next();
  } catch (error) {
    // 토큰이 유효하지 않은 경우 로그인 페이지로 리다이렉트
    return NextResponse.redirect(`${origin}/login`);
  }
}

export const config = {
  matcher: ['/', '/measset-generation', '/viewer', '/verification-report', '/machine-learning'],
};