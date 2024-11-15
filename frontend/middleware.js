import { NextResponse } from "next/server";

export function middleware(request) {
    // 보호된 경로 정의
    const protectedPaths = ['/measset-generation']
    const path = request.nextUrl.pathname

    // 로그인 페이지는 미들웨어 검사에서 제외
    if (path === `/auth/login`) {
        return NextResponse.next()
    }

    // 보호된 경로에 대한 접근 검사 진행
    if (protectedPaths.some(prefix => path.startWith(prefix))) {
        const authToken = request.cookies.get('auth_token')

        if (!authToken) {
        return NextResponse.redirect(new URL('/auth/login', request.url))
        }
    }
}