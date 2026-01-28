import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE_NAME } from "@/lib/server/session"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 인증 관련 API는 통과
  if (pathname.startsWith("/api/auth")) return NextResponse.next()

  // 정적 파일/next 내부 리소스 통과
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/icon") || pathname.startsWith("/apple-icon")) {
    return NextResponse.next()
  }

  const session = req.cookies.get(SESSION_COOKIE_NAME)?.value

  // 보호할 경로: /(app) 아래 페이지들(실제 라우팅은 /home, /sites 등)
  const isProtectedPage =
    pathname === "/home" ||
    pathname.startsWith("/sites") ||
    pathname.startsWith("/workers") ||
    pathname.startsWith("/records") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/settlement") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/attendance")

  const isProtectedApi = pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")

  if ((isProtectedPage || isProtectedApi) && !session) {
    // API면 401
    if (isProtectedApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // 페이지면 로그인으로
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
