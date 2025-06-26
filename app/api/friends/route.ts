// src/app/api/friends/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

// Tipe data untuk teman yang dikembalikan
interface FriendData {
  friend_user_id: number; // ID pengguna yang menjadi teman
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
  friendship_id: number; // ID dari tabel friendships
  friends_since: string; // Kapan pertemanan di-update (accepted)
}

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;

    const db = getDbConnection();

    // Query untuk mengambil teman. Seorang teman adalah ketika:
    // 1. loggedInUserId adalah sender_id DAN status = 'ACCEPTED' -> temannya adalah receiver_id
    // 2. loggedInUserId adalah receiver_id DAN status = 'ACCEPTED' -> temannya adalah sender_id
    // Kita menggunakan UNION ALL untuk menggabungkan kedua kasus tersebut.
    const stmt = db.prepare<[number, number], FriendData>(`
      SELECT
        u.id as friend_user_id,
        u.username,
        COALESCE(u.full_name, '') as full_name,
        u.profile_picture_url,
        f.id as friendship_id,
        f.updated_at as friends_since -- updated_at akan diisi saat status menjadi ACCEPTED
      FROM friendships f
      JOIN users u ON u.id = f.receiver_id
      WHERE f.sender_id = ? AND f.status = 'ACCEPTED'

      UNION ALL

      SELECT
        u.id as friend_user_id,
        u.username,
        COALESCE(u.full_name, '') as full_name,
        u.profile_picture_url,
        f.id as friendship_id,
        f.updated_at as friends_since
      FROM friendships f
      JOIN users u ON u.id = f.sender_id
      WHERE f.receiver_id = ? AND f.status = 'ACCEPTED'

      ORDER BY u.username ASC -- Urutkan berdasarkan username teman
    `);

    const friends = stmt.all(loggedInUserId, loggedInUserId);

    return NextResponse.json(friends, { status: 200 });

  } catch (error) {
    console.error('Gagal mengambil daftar teman:', error);
    return NextResponse.json({ message: 'Gagal mengambil daftar teman', error: (error as Error).message }, { status: 500 });
  }
}