// src/app/api/search/users/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth } from '@/lib/authUtils'; // Untuk konteks pengguna yang login (filter blokir)

// Tipe data untuk hasil pencarian pengguna
interface UserSearchResult {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
  // Anda bisa menambahkan info lain jika perlu, misal status pertemanan singkat
}

export async function GET(request: NextRequest) {
  try {
    // "Selesaikan" request sebelum mengakses searchParams (best practice Next.js baru)
    await request.text(); 

    const searchQuery = request.nextUrl.searchParams.get('q');

    if (!searchQuery || searchQuery.trim().length < 2) {
      return NextResponse.json({ message: 'Query pencarian minimal 2 karakter.' }, { status: 400 });
    }

    const db = getDbConnection();
    const loggedInUser = verifyAuth(request); // Dapatkan info pengguna yang login
    const loggedInUserId = loggedInUser ? loggedInUser.userId : null;

    const searchTerm = `%${searchQuery.toLowerCase()}%`; // Untuk pencarian LIKE case-insensitive

    // Query dasar untuk mencari berdasarkan username atau full_name
    let baseQuery = `
      SELECT
        u.id,
        u.username,
        COALESCE(u.full_name, NULL) as full_name, -- Pastikan NULL jika memang NULL
        u.profile_picture_url
      FROM users u
      WHERE (LOWER(u.username) LIKE ? OR LOWER(COALESCE(u.full_name, '')) LIKE ?)
    `;

    const queryParams: any[] = [searchTerm, searchTerm];

    // Filter berdasarkan status blokir jika pengguna yang mencari sudah login
    if (loggedInUserId) {
      // Jangan tampilkan pengguna yang telah diblokir oleh pencari
      baseQuery += ` AND u.id NOT IN (SELECT blocked_user_id FROM user_blocks WHERE blocker_id = ?)`;
      queryParams.push(loggedInUserId);

      // Jangan tampilkan pengguna yang telah memblokir pencari
      baseQuery += ` AND u.id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_user_id = ?)`;
      queryParams.push(loggedInUserId);

      // Jangan tampilkan diri sendiri dalam hasil pencarian
      baseQuery += ` AND u.id != ?`;
      queryParams.push(loggedInUserId);
    }

    baseQuery += ` ORDER BY u.username ASC LIMIT 20;`; // Batasi hasil dan urutkan

    const searchStmt = db.prepare(baseQuery);
    const users = searchStmt.all(...queryParams) as UserSearchResult[];

    return NextResponse.json(users, { status: 200 });

  } catch (error: any) {
    console.error('Gagal melakukan pencarian pengguna:', error);
    return NextResponse.json({ message: 'Gagal melakukan pencarian pengguna', error: error.message }, { status: 500 });
  }
}
