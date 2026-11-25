import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { signPatientSession } from '@/lib/patient/auth';

export const dynamic = 'force-dynamic';

const VerifyPinSchema = z.object({
  magic_token: z.string().min(6, 'Token tidak valid'),
  pin_last4: z.string().length(4, 'PIN harus berupa 4 digit'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = VerifyPinSchema.parse(json);

    const admin = createAdminClient();

    const { data: patient, error } = await admin
      .from('patients')
      .select('id, full_name, magic_token, pin_last4, whatsapp')
      .eq('magic_token', payload.magic_token)
      .single();

    if (error || !patient) {
      return NextResponse.json(
        { error: 'Data pasien tidak ditemukan.' },
        { status: 404 }
      );
    }

    if (patient.pin_last4 !== payload.pin_last4) {
      return NextResponse.json(
        { error: 'PIN 4 digit salah. Harap masukkan 4 digit terakhir nomor WhatsApp Anda.' },
        { status: 401 }
      );
    }

    // Sign patient session
    const signedSession = signPatientSession(patient.magic_token);

    const response = NextResponse.json({
      success: true,
      patient: {
        id: patient.id,
        full_name: patient.full_name,
        magic_token: patient.magic_token,
      },
    });

    response.cookies.set('rp_patient_session', signedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Verify PIN API] Error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat memverifikasi PIN.' },
      { status: 500 }
    );
  }
}
