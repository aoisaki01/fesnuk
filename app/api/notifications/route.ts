// src/app/api/notifications/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

// Tipe data untuk notifikasi yang dikembalikan ke klien
interface NotificationData {
  id: number;
  recipient_user_id: number;
  actor_user_id: number | null;
  actor_username: string | null; // Username dari actor_user_id
  actor_profile_picture_url: string | null; // Foto profil actor_user_id
  type: string;
  target_entity_type: string | null;
  target_entity_id: number | null;
  is_read: boolean;
  message: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const recipientUserId = authenticatedUser.userId;

    const db = getDbConnection();

    // Paginasi
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '15', 10); // Misal default 15 notif per halaman
    const offset = (page - 1) * limit;

    // Ambil notifikasi untuk pengguna ini, beserta informasi aktor (jika ada)
    // Diurutkan: yang belum dibaca dulu, lalu berdasarkan tanggal terbaru
    const stmt = db.prepare<[number, number, number], NotificationData>(`
      SELECT
        n.id,
        n.recipient_user_id,
        n.actor_user_id,
        u_actor.username as actor_username,
        u_actor.profile_picture_url as actor_profile_picture_url,
        n.type,
        n.target_entity_type,
        n.target_entity_id,
        n.is_read,
        n.message,
        n.created_at
      FROM notifications n
      LEFT JOIN users u_actor ON n.actor_user_id = u_actor.id -- LEFT JOIN karena actor_user_id bisa NULL
      WHERE n.recipient_user_id = ?
      ORDER BY n.is_read ASC, n.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const notifications = stmt.all(recipientUserId, limit, offset);

    // Opsional: Hitung total notifikasi yang belum dibaca untuk badge
    const unreadCountStmt = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE recipient_user_id = ? AND is_read = FALSE');
    // @ts-ignore
    const unreadResult = unreadCountStmt.get(recipientUserId) as { count: number };
    const unreadCount = unreadResult.count;


    return NextResponse.json({
      notifications,
      unreadCount, // Jumlah notifikasi yang belum dibaca
      currentPage: page,
      totalPages: Math.ceil( (unreadCount + stmt.all(recipientUserId, 1000000, 0).length - unreadCount) / limit) // Perkiraan total halaman
      // Perhitungan totalPages bisa lebih akurat dengan query COUNT(*) terpisah tanpa limit/offset untuk semua notifikasi user
    }, { status: 200 });

  } catch (error) {
    console.error('Gagal mengambil notifikasi:', error);
    return NextResponse.json({ message: 'Gagal mengambil notifikasi', error: (error as Error).message }, { status: 500 });
  }
}