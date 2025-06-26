// src/app/api/posts/[postId]/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan AuthenticatedUserPayload diimpor jika digunakan

// Interface untuk parameter dinamis dari URL
interface RouteParams {
  postId: string;
}

// Tipe data untuk detail postingan tunggal (digunakan oleh GET dan respons PUT)
interface SinglePostDetail {
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

// Tipe data untuk body request saat mengedit postingan (digunakan oleh PUT)
interface UpdatePostRequestBody {
  content?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}

// --- GET HANDLER ---
export async function GET(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { postId } = await context.params;
  try {
    const postIdInt = parseInt(postId, 10);
    if (isNaN(postIdInt)) {
      return NextResponse.json({ message: 'Post ID tidak valid' }, { status: 400 });
    }

    const db = getDbConnection();
    const loggedInUser = verifyAuth(request);
    const loggedInUserId = loggedInUser ? loggedInUser.userId : null;

    const stmt = db.prepare<unknown[], SinglePostDetail>(`
      SELECT
        p.id, p.content, p.image_url, p.video_url, p.created_at, p.updated_at,
        u.id as author_id, u.username as author_username,
        COALESCE(u.full_name, '') as author_full_name,
        u.profile_picture_url as author_profile_picture_url,
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
        ${loggedInUserId ? ", EXISTS(SELECT 1 FROM likes l_me WHERE l_me.post_id = p.id AND l_me.user_id = ?)" : ", FALSE"} as is_liked_by_me
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `);

    const queryParams: any[] = [];
    if (loggedInUserId) {
      queryParams.push(loggedInUserId); // Untuk is_liked_by_me
    }
    queryParams.push(postIdInt); // Untuk p.id = ?

    const postDetail = stmt.get(...queryParams);

    if (!postDetail) {
      return NextResponse.json({ message: 'Postingan tidak ditemukan' }, { status: 404 });
    }
    
    // Pengecekan blokir antara viewer dan author post
    if (loggedInUserId && postDetail.author_id !== loggedInUserId) {
        const blockCheckStmt = db.prepare(`
            SELECT id FROM user_blocks
            WHERE (blocker_id = ? AND blocked_user_id = ?) OR (blocker_id = ? AND blocked_user_id = ?)
        `);
        const blockExists = blockCheckStmt.get(loggedInUserId, postDetail.author_id, postDetail.author_id, loggedInUserId);
        if (blockExists) {
            return NextResponse.json({ message: 'Postingan tidak dapat diakses karena status blokir' }, { status: 403 }); // Forbidden
        }
    }

    return NextResponse.json(postDetail, { status: 200 });

  } catch (error) {
    console.error(`Gagal mengambil detail postingan ${postId}:`, error);
    return NextResponse.json({ message: 'Gagal mengambil detail postingan', error: (error as Error).message }, { status: 500 });
  }
}

// --- PUT HANDLER ---
export async function PUT(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { postId } = await context.params;
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;
    const postIdInt = parseInt(postId, 10);

    if (isNaN(postIdInt)) {
      return NextResponse.json({ message: 'Post ID tidak valid' }, { status: 400 });
    }

    const body = await request.json() as UpdatePostRequestBody;
    const { content, imageUrl, videoUrl } = body;

    if (content === undefined && imageUrl === undefined && videoUrl === undefined) {
      return NextResponse.json({ message: 'Tidak ada data yang dikirim untuk diperbarui' }, { status: 400 });
    }
    if (content !== undefined && content.trim() === '') {
      return NextResponse.json({ message: 'Konten postingan tidak boleh kosong jika diubah' }, { status: 400 });
    }

    const db = getDbConnection();

    const postCheckStmt = db.prepare('SELECT id, user_id FROM posts WHERE id = ?');
    const existingPost = postCheckStmt.get(postIdInt) as { id: number; user_id: number } | undefined;

    if (!existingPost) {
      return NextResponse.json({ message: 'Postingan tidak ditemukan' }, { status: 404 });
    }

    if (existingPost.user_id !== loggedInUserId) {
      return NextResponse.json({ message: 'Anda tidak berhak mengedit postingan ini' }, { status: 403 });
    }

    const fieldsToUpdate: { [key: string]: string | null } = {};
    const updateParams: (string | number | null)[] = [];

    if (content !== undefined) {
      fieldsToUpdate.content = content;
    }
    if (imageUrl !== undefined) {
      fieldsToUpdate.image_url = imageUrl;
    }
    if (videoUrl !== undefined) {
      fieldsToUpdate.video_url = videoUrl;
    }

    const setClauses = Object.keys(fieldsToUpdate).map(key => `${key} = ?`).join(', ');
    Object.values(fieldsToUpdate).forEach(value => updateParams.push(value));

    if (updateParams.length === 0) {
      return NextResponse.json({ message: 'Tidak ada field valid yang dikirim untuk diperbarui' }, { status: 400 });
    }

    updateParams.push(postIdInt); 
    updateParams.push(loggedInUserId); 

    const updateQuery = `UPDATE posts SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`;
    const updateStmt = db.prepare(updateQuery);
    const info = updateStmt.run(...updateParams);

    if (info.changes > 0) {
      const updatedPostStmt = db.prepare<unknown[], SinglePostDetail>(`
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
        WHERE p.id = ?
      `);
      // Gunakan loggedInUserId untuk parameter is_liked_by_me, bukan authenticatedUser.userId secara langsung
      // karena authenticatedUser bisa null jika tidak ada token, tapi loggedInUserId sudah di-handle.
      const finalQueryParams = [loggedInUserId, postIdInt];
      const updatedPost = updatedPostStmt.get(...finalQueryParams);

      return NextResponse.json({ message: 'Postingan berhasil diperbarui', post: updatedPost }, { status: 200 });
    } else {
      return NextResponse.json({ message: 'Gagal memperbarui postingan atau tidak ada perubahan data' }, { status: 304 });
    }

  } catch (error) {
    console.error(`Gagal mengedit postingan ${postId}:`, error);
    return NextResponse.json({ message: 'Gagal mengedit postingan', error: (error as Error).message }, { status: 500 });
  }
}

// --- DELETE HANDLER ---
export async function DELETE(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { postId } = await context.params;
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;
    const postIdInt = parseInt(postId, 10);

    if (isNaN(postIdInt)) {
      return NextResponse.json({ message: 'Post ID tidak valid' }, { status: 400 });
    }

    const db = getDbConnection();

    const postCheckStmt = db.prepare('SELECT id, user_id FROM posts WHERE id = ?');
    const existingPost = postCheckStmt.get(postIdInt) as { id: number; user_id: number } | undefined;

    if (!existingPost) {
      return NextResponse.json({ message: 'Postingan tidak ditemukan' }, { status: 404 });
    }

    if (existingPost.user_id !== loggedInUserId) {
      return NextResponse.json({ message: 'Anda tidak berhak menghapus postingan ini' }, { status: 403 });
    }

    const deleteStmt = db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?');
    const info = deleteStmt.run(postIdInt, loggedInUserId);

    if (info.changes > 0) {
      return NextResponse.json({ message: 'Postingan berhasil dihapus' }, { status: 200 });
    } else {
      return NextResponse.json({ message: 'Gagal menghapus postingan atau postingan tidak ditemukan' }, { status: 404 });
    }

  } catch (error) {
    console.error(`Gagal menghapus postingan ${postId}:`, error);
    return NextResponse.json({ message: 'Gagal menghapus postingan', error: (error as Error).message }, { status: 500 });
  }
}