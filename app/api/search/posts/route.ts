// src/app/api/search/posts/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

// Menggunakan kembali atau mendefinisikan ulang tipe FeedPost (atau SearchResultPost)
interface SearchResultPost {
  id: number; // Post ID
  content: string;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  author_id: number;
  author_username: string;
  author_full_name: string | null;
  author_profile_picture_url: string | null;
  like_count: number;
  comment_count: number;
  is_liked_by_me: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const searchQuery = request.nextUrl.searchParams.get('q');

    if (!searchQuery || searchQuery.trim().length < 2) { // Minimal 2 karakter untuk pencarian
      return NextResponse.json({ message: 'Query pencarian minimal 2 karakter.' }, { status: 400 });
    }

    const db = getDbConnection();
    const loggedInUser = verifyAuth(request);
    const loggedInUserId = loggedInUser ? loggedInUser.userId : null;

    const searchTerm = `%${searchQuery.toLowerCase()}%`;

    // Paginasi
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    let baseQuery = `
      SELECT
        p.id,
        p.content,
        p.image_url,
        p.video_url,
        p.created_at,
        p.updated_at,
        u.id as author_id,
        u.username as author_username,
        COALESCE(u.full_name, '') as author_full_name,
        u.profile_picture_url as author_profile_picture_url,
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
        ${loggedInUserId ? ", EXISTS(SELECT 1 FROM likes l_me WHERE l_me.post_id = p.id AND l_me.user_id = ?)" : ", FALSE"} as is_liked_by_me
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE LOWER(p.content) LIKE ?
    `;

    const queryParams: any[] = [];
    if (loggedInUserId) {
      queryParams.push(loggedInUserId); // Untuk is_liked_by_me
    }
    queryParams.push(searchTerm); // Untuk p.content LIKE ?

    // Integrasi Logika Blokir jika pengguna login
    if (loggedInUserId) {
      // Postingan dari pengguna yang diblokir oleh loggedInUser tidak ditampilkan
      baseQuery += ` AND p.user_id NOT IN (SELECT blocked_user_id FROM user_blocks WHERE blocker_id = ?)`;
      queryParams.push(loggedInUserId);

      // Postingan dari pengguna yang telah memblokir loggedInUser tidak ditampilkan
      baseQuery += ` AND p.user_id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_user_id = ?)`;
      queryParams.push(loggedInUserId);
    }

    baseQuery += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?;`;
    queryParams.push(limit, offset);

    const searchStmt = db.prepare(baseQuery);
    const posts = searchStmt.all(...queryParams) as SearchResultPost[];

    return NextResponse.json(posts, { status: 200 });

  } catch (error) {
    console.error('Gagal melakukan pencarian postingan:', error);
    return NextResponse.json({ message: 'Gagal melakukan pencarian postingan', error: (error as Error).message }, { status: 500 });
  }
}