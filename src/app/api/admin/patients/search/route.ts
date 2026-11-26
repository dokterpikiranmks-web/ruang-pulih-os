import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ success: true, patients: [] });
    }

    const term = q.trim();
    const admin = createAdminClient();

    // Search by full_name or whatsapp partial match (case-insensitive)
    const { data: patients, error } = await admin
      .from('patients')
      .select('id, full_name, whatsapp, age, address, magic_token, pin_last4, created_at')
      .or(`full_name.ilike.%${term}%,whatsapp.ilike.%${term}%`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[Admin Patient Search] Query error:', error);
      return NextResponse.json(
        { error: 'Gagal mencari data pasien.', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      patients: patients || [],
    });
  } catch (err) {
    console.error('[Admin Patient Search] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan server saat mencari pasien.' },
      { status: 500 }
    );
  }
}
