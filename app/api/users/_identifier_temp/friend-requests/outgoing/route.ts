// src/app/api/friend-requests/outgoing/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

// Tipe data untuk permintaan pertemanan keluar yang dikembalikan (termasuk info penerima)
interface OutgoingFriendRequest {
  friendship_id: number; // ID dari tabel friendships
  receiver_id: number;
  receiver_username: string;
  receiver_full_name: string | null;
  receiver_profile_picture_url: string | null;
  request_created_at: string; // Kapan permintaan dibuat
}

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const senderId = authenticatedUser.userId; // Pengguna yang login adalah pengirim

    const db = getDbConnection();

    // Ambil semua permintaan pertemanan yang dikirim oleh pengguna ini dan statusnya PENDING
    // Sertakan juga informasi dari pengguna yang menerima permintaan
    const stmt = db.prepare<[number], OutgoingFriendRequest>(`
      SELECT
        f.id as friendship_id,
        f.receiver_id,
        u.username as receiver_username,
        COALESCE(u.full_name, '') as receiver_full_name,
        u.profile_picture_url as receiver_profile_picture_url,
        f.created_at as request_created_at
      FROM friendships f
      JOIN users u ON f.receiver_id = u.id
      WHERE f.sender_id = ? AND f.status = 'PENDING'
      ORDER BY f.created_at DESC
    `);
    const outgoingRequests = stmt.all(senderId);

    return NextResponse.json(outgoingRequests, { status: 200 });

  } catch (error) {
    console.error('Gagal mengambil permintaan pertemanan keluar:', error);
    return NextResponse.json({ message: 'Gagal mengambil permintaan pertemanan keluar', error: (error as Error).message }, { status: 500 });
  }
}