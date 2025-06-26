// src/app/api/friend-requests/incoming/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

// Tipe data untuk permintaan pertemanan yang dikembalikan (termasuk info pengirim)
interface IncomingFriendRequest {
  friendship_id: number; // ID dari tabel friendships
  sender_id: number;
  sender_username: string;
  sender_full_name: string | null;
  sender_profile_picture_url: string | null;
  request_created_at: string; // Kapan permintaan dibuat
}

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const receiverId = authenticatedUser.userId; // Pengguna yang login adalah penerima

    const db = getDbConnection();

    // Ambil semua permintaan pertemanan yang ditujukan ke pengguna ini dan statusnya PENDING
    // Sertakan juga informasi dari pengguna yang mengirim permintaan
    const stmt = db.prepare<[number], IncomingFriendRequest>(`
      SELECT
        f.id as friendship_id,
        f.sender_id,
        u.username as sender_username,
        COALESCE(u.full_name, '') as sender_full_name,
        u.profile_picture_url as sender_profile_picture_url,
        f.created_at as request_created_at
      FROM friendships f
      JOIN users u ON f.sender_id = u.id
      WHERE f.receiver_id = ? AND f.status = 'PENDING'
      ORDER BY f.created_at DESC
    `);
    const incomingRequests = stmt.all(receiverId);

    return NextResponse.json(incomingRequests, { status: 200 });

  } catch (error) {
    console.error('Gagal mengambil permintaan pertemanan masuk:', error);
    return NextResponse.json({ message: 'Gagal mengambil permintaan pertemanan masuk', error: (error as Error).message }, { status: 500 });
  }
}