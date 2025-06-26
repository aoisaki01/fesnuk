// src/app/api/reels/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/authUtils';

// Tipe data untuk Reel (mirip FeedPost, tapi kita pastikan video_url ada)
interface ReelData {
  id: number;
  content: string | null;
  video_url: string; // Di sini, video_url tidak boleh null
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
    await request.text();

    const db = getDbConnection();
    const loggedInUser = verifyAuth(request);
    const loggedInUserId = loggedInUser ? loggedInUser.userId : null;

    // Paginasi
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '5', 10); // Ambil 5 video per request
    const offset = (page - 1) * limit;

    let reelsQuery = `
      SELECT
        p.id, p.content, p.video_url, p.created_at, p.updated_at,
        u.id as author_id, u.username as author_username,
        COALESCE(u.full_name, '') as author_full_name,
        u.profile_picture_url as author_profile_picture_url,
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
        ${loggedInUserId ? ", EXISTS(SELECT 1 FROM likes l_me WHERE l_me.post_id = p.id AND l_me.user_id = ?)" : ", FALSE"} as is_liked_by_me
      FROM posts p
      JOIN users u ON p.user_id = u.id
    `;
    const queryParams: any[] = [];
    if (loggedInUserId) {
      queryParams.push(loggedInUserId); // Untuk is_liked_by_me
    }

    // WHERE clause untuk hanya mengambil post yang memiliki video_url dan visible
    let whereClauses: string[] = [
        "p.video_url IS NOT NULL AND p.video_url != ''",
        "(p.visibility_status IS NULL OR p.visibility_status = 'VISIBLE')"
    ];
    
    if (loggedInUserId) {
      whereClauses.push(`p.user_id NOT IN (SELECT blocked_user_id FROM user_blocks WHERE blocker_id = ?)`);
      queryParams.push(loggedInUserId);
      whereClauses.push(`p.user_id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_user_id = ?)`);
      queryParams.push(loggedInUserId);
    }

    reelsQuery += " WHERE " + whereClauses.join(" AND ");
    
    // Urutkan secara acak untuk pengalaman "For You Page" sederhana
    reelsQuery += ` ORDER BY RANDOM() LIMIT ? OFFSET ?`;
    // Alternatif: urutkan berdasarkan terbaru: ORDER BY p.created_at DESC
    queryParams.push(limit, offset);

    const reelsStmt = db.prepare(reelsQuery);
    const reels = reelsStmt.all(...queryParams) as ReelData[];

    return NextResponse.json(reels, { status: 200 });

  } catch (error: any) {
    console.error('Gagal mengambil reels:', error);
    return NextResponse.json({ message: 'Gagal mengambil reels', error: error.message }, { status: 500 });
  }
}
