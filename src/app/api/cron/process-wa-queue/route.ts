import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendWhatsAppMessage } from '@/lib/wa/fonnte';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // 1. Mandatory Authorization Security Gate
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing CRON_SECRET token.' },
        { status: 401 }
      );
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // 2. Anti-Timeout: Fetch max 5 pending messages due for sending
    const { data: rawQueue, error: fetchError } = await admin
      .from('wa_queue')
      .select('id, patient_id, appointment_id, trigger_type, message_body, scheduled_for, retry_count, patients(whatsapp, full_name)')
      .eq('status', 'PENDING')
      .lte('scheduled_for', nowIso)
      .lt('retry_count', 3)
      .order('scheduled_for', { ascending: true })
      .limit(5);

    if (fetchError) {
      console.error('[CRON WA] Fetch queue error:', fetchError);
      return NextResponse.json(
        { error: 'Gagal mengambil antrean pesan.' },
        { status: 500 }
      );
    }

    const queueItems = rawQueue || [];
    const results = [];

    // 3. Process each message sequentially
    for (const item of queueItems) {
      const patient = item.patients as unknown as {
        whatsapp?: string;
        full_name?: string;
      };

      const targetPhone = patient?.whatsapp;

      if (!targetPhone) {
        // Mark as failed directly if phone number missing
        await admin
          .from('wa_queue')
          .update({
            status: 'FAILED',
            last_error: 'Nomor WhatsApp pasien tidak ditemukan.',
          })
          .eq('id', item.id);

        results.push({ id: item.id, status: 'FAILED', error: 'No phone' });
        continue;
      }

      // Send via Fonnte API
      const sendResult = await sendWhatsAppMessage({
        target: targetPhone,
        message: item.message_body,
        delay: '3-7',
      });

      if (sendResult.success) {
        await admin
          .from('wa_queue')
          .update({
            status: 'SENT',
            sent_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        results.push({ id: item.id, target: targetPhone, status: 'SENT' });
      } else {
        const nextRetry = (item.retry_count || 0) + 1;
        const isFinalFail = nextRetry >= 3;

        await admin
          .from('wa_queue')
          .update({
            retry_count: nextRetry,
            status: isFinalFail ? 'FAILED' : 'PENDING',
            last_error: sendResult.error || 'Fonnte delivery error',
          })
          .eq('id', item.id);

        results.push({
          id: item.id,
          target: targetPhone,
          status: isFinalFail ? 'FAILED' : 'RETRY',
          retry_count: nextRetry,
          error: sendResult.error,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed_count: queueItems.length,
      sent_count: results.filter((r) => r.status === 'SENT').length,
      failed_count: results.filter((r) => r.status === 'FAILED').length,
      results,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[CRON WA] Unexpected error:', errMsg);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem pada Cron Worker WA.', details: errMsg },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}

