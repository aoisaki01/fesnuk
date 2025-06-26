// src/app/api/users/[identifier]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/authUtils';

// Interface untuk respons API
interface UserProfileAPIResponse {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
  bio: string | null;
  created_at: string;
  posts: PostForProfileAPI[];
  friendship_status?: 'NOT_FRIENDS' | 'FRIENDS' | 'PENDING_SENT_BY_VIEWER' | 'PENDING_RECEIVED_BY_VIEWER' | 'SELF' | 'BLOCKED_BY_PROFILE_USER' | 'PROFILE_USER_BLOCKED_BY_VIEWER';
  friendship_id?: number | null;
}

// Interface untuk data pengguna dari database
interface UserDbRecord {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
  bio: string | null;
  created_at: string;
}

// Interface untuk data postingan
interface PostForProfileAPI {
  id: number;
  user_id: number;
  content: string;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  like_count: number;
  comment_count: number;
  is_liked_by_me: boolean;
}

export async function GET(request: NextRequest, context: { params: Promise<{ identifier: string }> }) {
  const params = await context.params;
  try {
    // =============================================
    // PERBAIKAN: "Selesaikan" request sebelum mengakses params
    await request.text(); 
    // =============================================

    const identifier = params.identifier;
    const db = getDbConnection();
    const viewingUser = verifyAuth(request);
    const viewingUserId = viewingUser ? viewingUser.userId : null;

    let userQuery = '';
    let queryParam: string | number = '';

    if (!isNaN(parseInt(identifier, 10))) {
      userQuery = 'SELECT id, username, COALESCE(full_name, NULL) as full_name, profile_picture_url, COALESCE(bio, NULL) as bio, created_at FROM users WHERE id = ?';
      queryParam = parseInt(identifier, 10);
    } else {
      userQuery = 'SELECT id, username, COALESCE(full_name, NULL) as full_name, profile_picture_url, COALESCE(bio, NULL) as bio, created_at FROM users WHERE LOWER(username) = LOWER(?)';
      queryParam = identifier;
    }

    const userStmt = db.prepare(userQuery);
    const user = userStmt.get(queryParam) as UserDbRecord | undefined;

    if (!user) {
      return NextResponse.json({ message: 'Pengguna tidak ditemukan' }, { status: 404 });
    }

    // Pengecekan blokir DUA ARAH
    if (viewingUserId && viewingUserId !== user.id) {
        const blockCheckStmt = db.prepare(
            `SELECT id FROM user_blocks WHERE (blocker_id = ? AND blocked_user_id = ?) OR (blocker_id = ? AND blocked_user_id = ?)`
        );
        const blockExists = blockCheckStmt.get(viewingUserId, user.id, user.id, viewingUserId);
        if (blockExists) {
            // Mengembalikan objek dengan status blokir daripada error 403 langsung,
            // agar frontend bisa memutuskan cara menampilkannya (misal, profil terbatas).
            // Atau tetap 403 jika ingin akses ditolak sepenuhnya.
            // Untuk konsistensi dengan logika frontend sebelumnya, kita kembalikan 403.
            return NextResponse.json({ message: 'Anda tidak dapat melihat profil ini karena status blokir.' }, { status: 403 });
        }
    }

    // Ambil postingan pengguna beserta detail interaksi
    const postsStmt = db.prepare(
      `SELECT 
        p.id, p.user_id, p.content, p.image_url, p.video_url, p.created_at, p.updated_at,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
        ${viewingUserId ? ", EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?)" : ", FALSE"} as is_liked_by_me
      FROM posts p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT 20`
    );

    const postQueryParams: any[] = [];
    if (viewingUserId) {
        postQueryParams.push(viewingUserId);
    }
    postQueryParams.push(user.id);
    
    const userPosts = postsStmt.all(...postQueryParams) as PostForProfileAPI[];

    const responseData: UserProfileAPIResponse = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      profile_picture_url: user.profile_picture_url,
      bio: user.bio,
      created_at: user.created_at,
      posts: userPosts,
      // friendship_status dan friendship_id akan diisi di bawah
    };

    // Logika untuk status pertemanan
    if (viewingUserId && viewingUserId !== user.id) {
      // Cek dulu apakah viewer memblokir pemilik profil
      const viewerBlockedProfileStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
      if (viewerBlockedProfileStmt.get(viewingUserId, user.id)) {
         responseData.friendship_status = 'PROFILE_USER_BLOCKED_BY_VIEWER';
         responseData.friendship_id = null;
      } else {
        // Jika tidak diblokir oleh viewer, baru cek status pertemanan
        const friendshipStatusStmt = db.prepare(
          `SELECT id as friendship_id, status, sender_id FROM friendships 
           WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`
        );
        const friendship = friendshipStatusStmt.get(viewingUserId, user.id, user.id, viewingUserId) as { friendship_id: number; status: string; sender_id: number } | undefined;

        if (friendship) {
          responseData.friendship_id = friendship.friendship_id;
          if (friendship.status === 'ACCEPTED') {
            responseData.friendship_status = 'FRIENDS';
          } else if (friendship.status === 'PENDING') {
            responseData.friendship_status = friendship.sender_id === viewingUserId ? 'PENDING_SENT_BY_VIEWER' : 'PENDING_RECEIVED_BY_VIEWER';
          } else { // Seharusnya tidak ada status lain yang relevan di sini
            responseData.friendship_status = 'NOT_FRIENDS'; // Fallback jika status tidak terduga
            responseData.friendship_id = null;
          }
        } else {
          responseData.friendship_status = 'NOT_FRIENDS';
          responseData.friendship_id = null;
        }
      }
    } else if (viewingUserId && viewingUserId === user.id) {
      responseData.friendship_status = 'SELF';
    }

    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    // params mungkin undefined jika error terjadi sebelum 'identifier = params.identifier;'
    // jadi gunakan optional chaining pada params saat logging error.
    console.error(`Gagal mengambil profil untuk identifier ${params?.identifier}:`, error);
    return NextResponse.json({ message: 'Gagal mengambil profil pengguna', error: error.message }, { status: 500 });
  }
}

// Jika Anda memiliki PUT atau DELETE handler di file ini (misalnya untuk edit/delete user),
// pastikan mereka juga menambahkan `await request.text();` atau `await request.json();`
// di awal jika mengalami error serupa.