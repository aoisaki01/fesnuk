// src/app/api/comments/[commentId]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteParams {
  commentId: string;
}

// Tipe data untuk body request saat mengedit komentar
interface UpdateCommentRequestBody {
  content?: string;
}

// Tipe data untuk komentar yang dikembalikan (bisa disesuaikan)
interface CommentData {
  id: number;
  user_id: number;
  post_id: number;
  parent_comment_id: number | null;
  content: string;
  created_at: string;
  updated_at: string;
  // Mungkin perlu join dengan user untuk author_username jika dikembalikan
}

// Handler untuk PUT request - Mengedit Komentar
export async function PUT(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { commentId } = await context.params;
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;
    const commentIdParsed = parseInt(commentId, 10);

    if (isNaN(commentIdParsed)) {
      return NextResponse.json({ message: 'Comment ID tidak valid' }, { status: 400 });
    }

    const body = await request.json() as UpdateCommentRequestBody;
    const { content } = body;

    if (!content || content.trim() === '') {
      return NextResponse.json({ message: 'Konten komentar tidak boleh kosong' }, { status: 400 });
    }

    const db = getDbConnection();

    // 1. Cek apakah komentar ada dan milik pengguna yang login
    const commentCheckStmt = db.prepare('SELECT id, user_id, post_id FROM comments WHERE id = ?');
    // @ts-ignore
    const existingComment = commentCheckStmt.get(commentIdParsed) as { id: number; user_id: number; post_id: number; } | undefined;

    if (!existingComment) {
      return NextResponse.json({ message: 'Komentar tidak ditemukan' }, { status: 404 });
    }

    if (existingComment.user_id !== loggedInUserId) {
      return NextResponse.json({ message: 'Anda tidak berhak mengedit komentar ini' }, { status: 403 }); // Forbidden
    }

    // 2. Update konten komentar
    const updateStmt = db.prepare(
      'UPDATE comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
    );
    const info = updateStmt.run(content, commentIdParsed, loggedInUserId);

    if (info.changes > 0) {
      // Ambil komentar yang sudah diupdate untuk dikembalikan
      const updatedCommentStmt = db.prepare<[number], CommentData>(`
        SELECT id, user_id, post_id, parent_comment_id, content, created_at, updated_at
        FROM comments
        WHERE id = ?
      `);
      const updatedComment = updatedCommentStmt.get(commentIdParsed);
      return NextResponse.json({ message: 'Komentar berhasil diperbarui', comment: updatedComment }, { status: 200 });
    } else {
      // Bisa jadi karena konten baru sama dengan konten lama
      return NextResponse.json({ message: 'Gagal memperbarui komentar atau tidak ada perubahan data' }, { status: 304 }); // Not Modified atau 400
    }

  } catch (error) {
    console.error(`Gagal mengedit komentar ${commentId}:`, error);
    return NextResponse.json({ message: 'Gagal mengedit komentar', error: (error as Error).message }, { status: 500 });
  }
}

// Handler untuk DELETE request - Menghapus Komentar
export async function DELETE(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { commentId } = await context.params;
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;
    const commentIdParsed = parseInt(commentId, 10);

    if (isNaN(commentIdParsed)) {
      return NextResponse.json({ message: 'Comment ID tidak valid' }, { status: 400 });
    }

    const db = getDbConnection();

    // 1. Cek apakah komentar ada dan milik pengguna yang login
    //    Alternatif: Pemilik postingan juga bisa menghapus komentar di postingannya.
    //    Jika demikian, Anda perlu mengambil `post_id` dari komentar, lalu `user_id` dari postingan,
    //    dan bandingkan dengan `loggedInUserId` selain `existingComment.user_id === loggedInUserId`.
    //    Untuk saat ini, kita batasi hanya pemilik komentar.
    const commentCheckStmt = db.prepare('SELECT id, user_id, post_id FROM comments WHERE id = ?');
    // @ts-ignore
    const existingComment = commentCheckStmt.get(commentIdParsed) as { id: number; user_id: number; post_id: number; } | undefined;

    if (!existingComment) {
      return NextResponse.json({ message: 'Komentar tidak ditemukan' }, { status: 404 });
    }

    if (existingComment.user_id !== loggedInUserId) {
      // Tambahkan logika di sini jika pemilik post juga boleh menghapus
      // const postOwnerCheckStmt = db.prepare('SELECT user_id FROM posts WHERE id = ?');
      // const post = postOwnerCheckStmt.get(existingComment.post_id);
      // if (!post || post.user_id !== loggedInUserId) {
      //   return NextResponse.json({ message: 'Anda tidak berhak menghapus komentar ini' }, { status: 403 });
      // }
      return NextResponse.json({ message: 'Anda tidak berhak menghapus komentar ini' }, { status: 403 });
    }

    // 2. Hapus komentar dari database
    // Jika ada balasan (replies) yang `parent_comment_id`-nya merujuk ke commentId ini,
    // dan skema Anda memiliki `ON DELETE CASCADE` pada foreign key tersebut, replies juga akan terhapus.
    const deleteStmt = db.prepare('DELETE FROM comments WHERE id = ? AND user_id = ?');
    // Jika pemilik post juga boleh menghapus, WHERE clause-nya akan berbeda.
    // const deleteStmt = db.prepare('DELETE FROM comments WHERE id = ?');
    const info = deleteStmt.run(commentIdParsed, loggedInUserId);


    if (info.changes > 0) {
      // Penting: Setelah menghapus komentar, Anda mungkin perlu memicu pembaruan jumlah komentar
      // pada postingan terkait di frontend, atau API detail postingan akan otomatis menghitung ulang.
      // Untuk saat ini, kita hanya kirim sukses.
      return NextResponse.json({ message: 'Komentar berhasil dihapus' }, { status: 200 });
      // Atau: return new NextResponse(null, { status: 204 });
    } else {
      return NextResponse.json({ message: 'Gagal menghapus komentar atau komentar tidak ditemukan' }, { status: 404 });
    }

  } catch (error) {
    console.error(`Gagal menghapus komentar ${commentId}:`, error);
    return NextResponse.json({ message: 'Gagal menghapus komentar', error: (error as Error).message }, { status: 500 });
  }
}