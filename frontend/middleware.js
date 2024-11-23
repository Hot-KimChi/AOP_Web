import { NextResponse } from 'next/server'
 
export function middleware(request) {
  // 보호된 경로 정의 (메인 기능 페이지들만 보호)
  const protectedPaths = ['/measset-generation']
  const path = request.nextUrl.pathname
  const authToken = request.cookies.get('auth_token')
  
  // 로그인 페이지 처리
  if (path === '/auth/login') {
    // 이미 로그인된 사용자가 로그인 페이지에 접근하면 홈으로 리다이렉트
    if (authToken) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // 보호된 경로에 대한 접근 검사
  if (protectedPaths.some(prefix => path.startsWith(prefix))) {
    if (!authToken) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  return NextResponse.next()
}

// 미들웨어가 적용될 경로 설정
export const config = {
  matcher: [
    '/measset-generation/:path*',
    '/auth/login'
  ]
}
