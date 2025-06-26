// src/app/api/notifications/[notificationId]/read/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteParams {
  notificationId: string;
}

export async function PUT(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { notificationId } = await context.params;
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;
    const notificationIdNum = parseInt(notificationId, 10);

    if (isNaN(notificationIdNum)) {
      return NextResponse.json({ message: 'Notification ID tidak valid' }, { status: 400 });
    }

    const db = getDbConnection();

    // 1. Cek apakah notifikasi ada dan milik pengguna yang login
    const notificationStmt = db.prepare(
      'SELECT id, recipient_user_id, is_read FROM notifications WHERE id = ?'
    );
    const notification = notificationStmt.get(notificationIdNum) as { id: number; recipient_user_id: number; is_read: boolean } | undefined;

    if (!notification) {
      return NextResponse.json({ message: 'Notifikasi tidak ditemukan' }, { status: 404 });
    }

    if (notification.recipient_user_id !== loggedInUserId) {
      return NextResponse.json({ message: 'Anda tidak berhak mengubah notifikasi ini' }, { status: 403 });
    }

    if (notification.is_read) {
      return NextResponse.json({ message: 'Notifikasi sudah ditandai dibaca', notification_id: notificationIdNum, is_read: true }, { status: 200 });
    }

    const updateStmt = db.prepare(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND recipient_user_id = ?'
    );
    const info = updateStmt.run(notificationIdNum, loggedInUserId);

    if (info.changes > 0) {
      return NextResponse.json({ message: 'Notifikasi berhasil ditandai sudah dibaca', notification_id: notificationIdNum, is_read: true }, { status: 200 });
    } else {
      return NextResponse.json({ message: 'Gagal menandai notifikasi sebagai sudah dibaca atau notifikasi tidak ditemukan/milik user lain' }, { status: 404 });
    }

  } catch (error) {
    console.error(`Gagal menandai notifikasi ${notificationId} sebagai sudah dibaca:`, error);
    return NextResponse.json({ message: 'Gagal memproses permintaan', error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { notificationId } = await context.params;
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;
    const notificationIdNum = parseInt(notificationId, 10);

    if (isNaN(notificationIdNum)) {
      return NextResponse.json({ message: 'Notification ID tidak valid' }, { status: 400 });
    }

    const db = getDbConnection();

    const deleteStmt = db.prepare('DELETE FROM notifications WHERE id = ? AND recipient_user_id = ?');
    const info = deleteStmt.run(notificationIdNum, loggedInUserId);

    if (info.changes > 0) {
      return NextResponse.json({ message: 'Notifikasi berhasil dihapus' }, { status: 200 });
    } else {
      return NextResponse.json({ message: 'Notifikasi tidak ditemukan atau sudah dihapus sebelumnya' }, { status: 404 });
    }
  } catch (error) {
    console.error(`Gagal menghapus notifikasi ${notificationId}:`, error);
    return NextResponse.json({ message: 'Gagal memproses permintaan', error: (error as Error).message }, { status: 500 });
  }
}