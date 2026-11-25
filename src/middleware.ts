import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin (except /admin/login) and /api/admin/*
  const isAdminPage = pathname.startsWith('/admin') && !pathname.startsWith('/admin/login');
  const isAdminApi = pathname.startsWith('/api/admin');

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not authenticated
  if (!user) {
    if (isAdminApi) {
      return NextResponse.json(
        { error: 'Akses ditolak: Autentikasi praktisi diperlukan.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check Email Whitelist if configured
  const adminEmailsEnv = process.env.ADMIN_EMAILS;
  if (adminEmailsEnv && user.email) {
    const allowedEmails = adminEmailsEnv.split(',').map((e) => e.trim().toLowerCase());
    if (!allowedEmails.includes(user.email.toLowerCase())) {
      if (isAdminApi) {
        return NextResponse.json(
          { error: 'Akses ditolak: Email Anda tidak berada dalam daftar praktisi resmi.', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/admin/login?error=unauthorized_email', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
