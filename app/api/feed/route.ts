// src/app/api/feed/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/authUtils'; // Pastikan path ini benar

// Tipe data untuk FeedPost (pastikan sesuai dengan yang Anda gunakan di frontend)
interface FeedPost {
  id: number;
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
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;

    const db = getDbConnection();

    // 1. Ambil daftar ID teman
    const friendsStmt = db.prepare(`
      SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as friend_id
      FROM friendships
      WHERE (sender_id = ? OR receiver_id = ?) AND status = 'ACCEPTED'
    `);
    const friendRows = friendsStmt.all(loggedInUserId, loggedInUserId, loggedInUserId) as { friend_id: number }[];
    let friendIds = friendRows.map(row => row.friend_id);

    // 2. Ambil daftar ID pengguna yang terkait blokir
    const iHaveBlockedStmt = db.prepare('SELECT blocked_user_id FROM user_blocks WHERE blocker_id = ?');
    const iHaveBlockedRows = iHaveBlockedStmt.all(loggedInUserId) as { blocked_user_id: number }[];
    const iHaveBlockedIds = new Set(iHaveBlockedRows.map(row => row.blocked_user_id));

    const whoBlockedMeStmt = db.prepare('SELECT blocker_id FROM user_blocks WHERE blocked_user_id = ?');
    const whoBlockedMeRows = whoBlockedMeStmt.all(loggedInUserId) as { blocker_id: number }[];
    const whoBlockedMeIds = new Set(whoBlockedMeRows.map(row => row.blocker_id));

    // 3. Filter friendIds
    friendIds = friendIds.filter(id => !iHaveBlockedIds.has(id) && !whoBlockedMeIds.has(id));

    // 4. Gabungkan ID teman (yang sudah difilter) dengan ID pengguna sendiri
    const userIdsForFeed = [loggedInUserId, ...friendIds];
    const uniqueUserIdsForFeed = [...new Set(userIdsForFeed)];

    if (uniqueUserIdsForFeed.length === 0) {
        return NextResponse.json([], { status: 200 });
    }

    const placeholders = uniqueUserIdsForFeed.map(() => '?').join(',');

    // 5. Paginasi
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    // 6. Ambil postingan
    const feedPostsStmt = db.prepare<unknown[], FeedPost>(`
      SELECT
        p.id, p.content, p.image_url, p.video_url, p.created_at, p.updated_at,
        u.id as author_id, u.username as author_username,
        COALESCE(u.full_name, '') as author_full_name,
        u.profile_picture_url as author_profile_picture_url,
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
        EXISTS(SELECT 1 FROM likes l_me WHERE l_me.post_id = p.id AND l_me.user_id = ?) as is_liked_by_me
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id IN (${placeholders})
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const queryParams = [loggedInUserId, ...uniqueUserIdsForFeed, limit, offset];
    const feedPosts = feedPostsStmt.all(...queryParams);

    return NextResponse.json(feedPosts, { status: 200 });

  } catch (error: any) {
    console.error('Gagal mengambil news feed:', error);
    return NextResponse.json({ message: 'Gagal mengambil news feed', error: error.message }, { status: 500 });
  }
}