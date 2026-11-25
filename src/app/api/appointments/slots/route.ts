import { NextResponse } from 'next/server';
import {
  calculateDaySlots,
  getWITAParts,
  createWITAISOString,
  formatWITADate,
} from '@/lib/utils/timezone';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    const now = new Date();
    const nowWita = getWITAParts(now);
    const todayStr = `${nowWita.year}-${String(nowWita.month).padStart(2, '0')}-${String(nowWita.day).padStart(2, '0')}`;

    const targetDateStr = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : todayStr;

    // Generate standard 8 slots for the target date
    const baseSlots = calculateDaySlots(targetDateStr);

    // Query booked/confirmed appointments for the target date
    const dayStartIso = createWITAISOString(
      parseInt(targetDateStr.split('-')[0], 10),
      parseInt(targetDateStr.split('-')[1], 10),
      parseInt(targetDateStr.split('-')[2], 10),
      0,
      0,
      0
    );
    const dayEndIso = createWITAISOString(
      parseInt(targetDateStr.split('-')[0], 10),
      parseInt(targetDateStr.split('-')[1], 10),
      parseInt(targetDateStr.split('-')[2], 10),
      23,
      59,
      59
    );

    const bookedStarts = new Set<string>();

    try {
      const admin = createAdminClient();
      const { data: appointments, error: queryError } = await admin
        .from('appointments')
        .select('slot_start, status')
        .gte('slot_start', dayStartIso)
        .lte('slot_start', dayEndIso)
        .in('status', ['BOOKED', 'CONFIRMED']);

      if (queryError) {
        console.warn('[Slots API] DB query warning:', queryError);
      } else if (appointments) {
        for (const appt of appointments) {
          bookedStarts.add(new Date(appt.slot_start).toISOString());
        }
      }
    } catch (dbErr) {
      console.warn('[Slots API] DB connection failed, evaluating slots purely by time:', dbErr);
    }

    const nowMs = now.getTime();

    // Map availability
    const slots = baseSlots.map((slot) => {
      const slotStartDate = new Date(slot.slot_start);
      const slotStartMs = slotStartDate.getTime();
      const slotStartIso = slotStartDate.toISOString();

      const isBooked = bookedStarts.has(slotStartIso);
      const isPast = slotStartMs <= nowMs;

      let available = true;
      let reason: 'BOOKED' | 'PAST' | null = null;

      if (isBooked) {
        available = false;
        reason = 'BOOKED';
      } else if (isPast) {
        available = false;
        reason = 'PAST';
      }

      return {
        ...slot,
        available,
        reason,
      };
    });

    return NextResponse.json({
      success: true,
      date: targetDateStr,
      date_formatted: formatWITADate(new Date(dayStartIso)),
      timezone: 'Asia/Makassar',
      slots,
    });
  } catch (err) {
    console.error('[Slots API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Gagal memuat jadwal slot.', details: (err as Error).message },
      { status: 500 }
    );
  }
}
