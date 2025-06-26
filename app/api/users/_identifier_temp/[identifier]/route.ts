// src/app/api/users/[identifier]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/authUtils'; // Untuk status pertemanan

// Tipe data ini harus konsisten dengan yang diharapkan frontend
interface UserProfileAPIResponse {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
  bio: string | null;
  created_at: string;
  posts: any[]; // Seharusnya UserPost[], tapi kita sederhanakan dulu untuk API
  friendship_status?: string;
}

interface UserDbRecord {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
  bio: string | null;
  created_at: string;
}

interface PostDbRecord { // Sesuaikan dengan struktur tabel posts Anda
  id: number;
  content: string;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  user_id: number; // Dibutuhkan untuk JOIN atau filter jika perlu
  // Tambahkan like_count, comment_count, is_liked_by_me jika API ini yang menghitungnya
  // Untuk saat ini, kita asumsikan ini tidak dihitung di sini agar simpel,
  // dan PostCard akan menanganinya atau API posts terpisah.
  // Jika UserProfileData.posts butuh like_count, comment_count, is_liked_by_me,
  // maka query posts di bawah perlu di-JOIN atau dimodifikasi.
}


export async function GET(request: NextRequest, { params }: { params: { identifier: string } }) {
  try {
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

    // Cek blokir DUA ARAH sebelum melanjutkan
    if (viewingUserId && viewingUserId !== user.id) {
        const blockCheckStmt = db.prepare(`
            SELECT id FROM user_blocks
            WHERE (blocker_id = ? AND blocked_user_id = ?) OR (blocker_id = ? AND blocked_user_id = ?)
        `);
        const blockExists = blockCheckStmt.get(viewingUserId, user.id, user.id, viewingUserId);
        if (blockExists) {
            return NextResponse.json({ message: 'Anda tidak dapat melihat profil ini karena status blokir.' }, { status: 403 });
        }
    }

    // Ambil postingan pengguna
    // Modifikasi query ini untuk menyertakan like_count, comment_count, dan is_liked_by_me jika ingin
    // data ini langsung tersedia untuk PostCard tanpa SWR tambahan di PostCard
    const postsStmt = db.prepare<[number], PostDbRecord>(`
      SELECT 
        p.id, p.user_id, p.content, p.image_url, p.video_url, p.created_at, p.updated_at,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
        ${viewingUserId ? ", EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?)" : ", FALSE"} as is_liked_by_me
      FROM posts p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT 20 
    `); // Batasi jumlah postingan yang diambil untuk profil

    const postQueryParams: any[] = [];
    if (viewingUserId) {
        postQueryParams.push(viewingUserId); // Untuk is_liked_by_me
    }
    postQueryParams.push(user.id); // Untuk p.user_id = ?

    const userPosts = postsStmt.all(...postQueryParams);

    const responseData: UserProfileAPIResponse = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      profile_picture_url: user.profile_picture_url,
      bio: user.bio,
      created_at: user.created_at,
      posts: userPosts,
    };

    // Tambahkan status pertemanan
    if (viewingUserId && viewingUserId !== user.id) {
      const friendshipStatusStmt = db.prepare(`
        SELECT status, sender_id FROM friendships
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      `);
      const friendship = friendshipStatusStmt.get(viewingUserId, user.id, user.id, viewingUserId) as { status: string, sender_id: number } | undefined;

      if (friendship) {
        if (friendship.status === 'ACCEPTED') {
          responseData.friendship_status = 'FRIENDS';
        } else if (friendship.status === 'PENDING') {
          responseData.friendship_status = friendship.sender_id === viewingUserId ? 'PENDING_SENT_BY_VIEWER' : 'PENDING_RECEIVED_BY_VIEWER';
        } else {
          responseData.friendship_status = 'NOT_FRIENDS';
        }
      } else {
        responseData.friendship_status = 'NOT_FRIENDS';
      }
    } else if (viewingUserId && viewingUserId === user.id) {
      responseData.friendship_status = 'SELF';
    }
    // Jika viewer telah memblokir profile user, tambahkan status ini (frontend sudah menanganinya)
    // const viewerBlockedProfileStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
    // if (viewingUserId && viewerBlockedProfileStmt.get(viewingUserId, user.id)) {
    //    responseData.friendship_status = 'PROFILE_USER_BLOCKED_BY_VIEWER';
    // }


    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    console.error(`Gagal mengambil profil untuk identifier ${params.identifier}:`, error);
    return NextResponse.json({ message: 'Gagal mengambil profil pengguna', error: error.message }, { status: 500 });
  }
}