// src/app/api/posts/trending/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth } from '@/lib/authUtils'; // Untuk is_liked_by_me dan filter blokir

// Tipe data untuk respons (mirip FeedPost atau PostData)
interface TrendingPostData {
  id: number;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  is_live?: boolean;
  live_status?: string | null;
  stream_playback_url?: string | null;
  visibility_status?: string | null;
  author_id: number;
  author_username: string;
  author_full_name: string | null;
  author_profile_picture_url: string | null;
  like_count: number;
  comment_count: number;
  is_liked_by_me: boolean;
  trending_score?: number; // Opsional, untuk debugging atau jika frontend perlu
}

const COMMENT_WEIGHT = 2; // Komentar dianggap 2x lebih berharga dari like untuk trending

export async function GET(request: NextRequest) {
  try {
    // "Selesaikan" request sebelum mengakses searchParams (best practice Next.js baru)
    await request.text();

    const db = getDbConnection();
    const loggedInUser = verifyAuth(request);
    const loggedInUserId = loggedInUser ? loggedInUser.userId : null;

    // Paginasi
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10); // Ambil 10 postingan trending per halaman
    const offset = (page - 1) * limit;

    // Query untuk mengambil postingan dan menghitung skor trending
    // Perhitungan skor dilakukan di SQL untuk efisiensi sorting.
    // Catatan: Subquery COUNT(*) bisa jadi berat untuk tabel besar.
    // Denormalisasi (menyimpan like_count, comment_count di tabel posts) adalah solusi performa jangka panjang.
    let trendingQuery = `
      SELECT
        p.id, p.content, p.image_url, p.video_url, p.created_at, p.updated_at,
        p.is_live, p.live_status, p.stream_playback_url, p.visibility_status,
        u.id as author_id, u.username as author_username,
        COALESCE(u.full_name, '') as author_full_name,
        u.profile_picture_url as author_profile_picture_url,
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
        ${loggedInUserId ? "EXISTS(SELECT 1 FROM likes l_me WHERE l_me.post_id = p.id AND l_me.user_id = ?)" : "FALSE"} as is_liked_by_me,
        ((SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) + ((SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) * ${COMMENT_WEIGHT})) AS trending_score
      FROM posts p
      JOIN users u ON p.user_id = u.id
    `;

    const queryParams: any[] = [];
    if (loggedInUserId) {
      queryParams.push(loggedInUserId); // Untuk is_liked_by_me
    }

    let whereClauses: string[] = ["(p.visibility_status IS NULL OR p.visibility_status = 'VISIBLE')"];
    if (loggedInUserId) {
      whereClauses.push(`p.user_id NOT IN (SELECT blocked_user_id FROM user_blocks WHERE blocker_id = ?)`);
      queryParams.push(loggedInUserId);
      whereClauses.push(`p.user_id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_user_id = ?)`);
      queryParams.push(loggedInUserId);
    }

    if (whereClauses.length > 0) {
      trendingQuery += " WHERE " + whereClauses.join(" AND ");
    }

    trendingQuery += ` ORDER BY trending_score DESC, p.created_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const trendingPostsStmt = db.prepare(trendingQuery);
    const trendingPosts = trendingPostsStmt.all(...queryParams) as TrendingPostData[];

    return NextResponse.json(trendingPosts, { status: 200 });

  } catch (error: any) {
    console.error('Gagal mengambil postingan trending:', error);
    return NextResponse.json({ message: 'Gagal mengambil postingan trending', error: error.message }, { status: 500 });
  }
}
