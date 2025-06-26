// src/app/api/notifications/mark-all-as-read/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

export async function PUT(request: NextRequest) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;

    const db = getDbConnection();

    // Update semua notifikasi yang belum dibaca milik pengguna ini menjadi sudah dibaca
    const updateStmt = db.prepare(
      'UPDATE notifications SET is_read = TRUE WHERE recipient_user_id = ? AND is_read = FALSE'
    );
    const info = updateStmt.run(loggedInUserId);

    return NextResponse.json({
      message: 'Semua notifikasi yang belum dibaca berhasil ditandai sudah dibaca',
      notifications_updated_count: info.changes // Jumlah baris yang terpengaruh/diupdate
    }, { status: 200 });

  } catch (error) {
    console.error('Gagal menandai semua notifikasi sebagai sudah dibaca:', error);
    return NextResponse.json({ message: 'Gagal memproses permintaan', error: (error as Error).message }, { status: 500 });
  }
}