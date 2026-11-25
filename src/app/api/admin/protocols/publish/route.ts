import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PublishProtocolSchema = z.object({
  protocol_id: z.string().uuid('ID Protokol tidak valid'),
  practitioner_summary: z.string().optional(),
  patient_friendly_summary: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = PublishProtocolSchema.parse(json);

    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: any = {
      status: 'PUBLISHED',
      published_at: new Date().toISOString(),
    };

    if (payload.practitioner_summary) {
      updatePayload.practitioner_summary = payload.practitioner_summary;
    }
    if (payload.patient_friendly_summary) {
      updatePayload.patient_friendly_summary = payload.patient_friendly_summary;
    }

    const { data: updated, error } = await admin
      .from('clinical_protocols')
      .update(updatePayload)
      .eq('id', payload.protocol_id)
      .select('id, status, published_at')
      .single();

    if (error || !updated) {
      console.error('[Publish Protocol API] Update error:', error);
      return NextResponse.json({ error: 'Gagal menerbitkan protokol klinis.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      protocol_id: updated.id,
      status: updated.status,
      published_at: updated.published_at,
      message: 'Protokol berhasil disetujui & diterbitkan ke Aplikasi Pasien.',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Publish Protocol API] Unexpected error:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan sistem.' }, { status: 500 });
  }
}
