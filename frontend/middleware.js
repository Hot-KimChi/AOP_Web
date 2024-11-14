import { NextResponse } from 'next/server';

export function middleware(request) {
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth');
  const token = request.cookies.get('auth_token');

  // 인증이 필요한 페이지에서 토큰이 없는 경우
  if (!isAuthPage && !token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // 이미 로그인된 사용자가 로그인/회원가입 페이지 접근 시
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)',],
};