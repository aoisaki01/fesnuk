// src/app/api/posts/[postId]/likes/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan path ini benar

interface RouteParams {
  postId: string;
}

// Fungsi helper untuk membuat notifikasi (bisa diimpor jika sudah ada di file utilitas)
// Pastikan definisi dan parameter fungsi ini sesuai dengan yang Anda gunakan di API lain.
async function createNotification(db: ReturnType<typeof getDbConnection>, params: {
  recipientUserId: number;
  actorUserId?: number | null;
  type: string;
  targetEntityType?: string | null;
  targetEntityId?: number | null;
  message?: string | null;
}) {
    try {
        const { recipientUserId, actorUserId = null, type, targetEntityType = null, targetEntityId = null, message = null } = params;
        const stmt = db.prepare(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, type, target_entity_type, target_entity_id, message)
        VALUES (?, ?, ?, ?, ?, ?)`
        );
        stmt.run(recipientUserId, actorUserId, type, targetEntityType, targetEntityId, message);
        console.log(`Notifikasi (LIKE) dibuat: To=${recipientUserId}, Type=${type}, Actor=${actorUserId}, Target=${targetEntityType}:${targetEntityId}`);
    } catch (error) {
        console.error('Gagal membuat notifikasi (LIKE):', error);
    }
}

// Fungsi helper untuk cek blokir (jika belum diimpor, definisikan atau impor)
function checkBlockStatus(db: ReturnType<typeof getDbConnection>, userId1: number, userId2: number): boolean {
  const blockCheckStmt = db.prepare(`
    SELECT id FROM user_blocks
    WHERE (blocker_id = ? AND blocked_user_id = ?) OR (blocker_id = ? AND blocked_user_id = ?)
  `);
  const block = blockCheckStmt.get(userId1, userId2, userId2, userId1);
  return !!block;
}


// Handler untuk POST request - Menyukai sebuah postingan
export async function POST(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { postId } = await context.params;

  try {
    // "Selesaikan" request sebelum mengakses params (best practice Next.js baru)
    // Untuk POST ini, kita tidak mengharapkan body JSON, jadi request.text() cukup.
    await request.text(); 

    const authenticatedUser = verifyAuth(request); // verifyAuth menggunakan objek request asli
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan.' }, { status: 401 });
    }
    const interactorId = authenticatedUser.userId; // Pengguna yang melakukan aksi like
    const interactorUsername = authenticatedUser.username; // Untuk pesan notifikasi
    
    if (!postId) {
        console.error("API Like Post: postId tidak ditemukan di parameter rute.");
        return NextResponse.json({ message: 'Post ID tidak ditemukan di parameter rute.' }, { status: 400 });
    }
    const postIdInt = parseInt(postId, 10);

    if (isNaN(postIdInt)) {
      return NextResponse.json({ message: 'Post ID tidak valid (bukan angka).' }, { status: 400 });
    }

    const db = getDbConnection();

    // 1. Cek apakah postingan ada, siapa pemiliknya, dan apakah visible
    const postStmt = db.prepare('SELECT id, user_id as authorId, visibility_status FROM posts WHERE id = ?');
    const post = postStmt.get(postIdInt) as { id: number; authorId: number; visibility_status: string } | undefined;

    if (!post) {
      return NextResponse.json({ message: 'Postingan tidak ditemukan.' }, { status: 404 });
    }
    if (post.visibility_status !== 'VISIBLE') {
        return NextResponse.json({ message: 'Tidak dapat menyukai postingan ini karena status visibilitasnya.'}, {status: 403});
    }

    const authorId = post.authorId; // ID pemilik postingan

    // 2. Cek status blokir antara interactor dan author post (jika bukan postingan sendiri)
    if (interactorId !== authorId) {
        if (checkBlockStatus(db, interactorId, authorId)) {
            return NextResponse.json({ message: 'Tidak dapat berinteraksi dengan postingan ini karena status blokir.' }, { status: 403 });
        }
    }

    // 3. Cek apakah pengguna sudah menyukai postingan ini sebelumnya
    const likeCheckStmt = db.prepare('SELECT id FROM likes WHERE user_id = ? AND post_id = ?');
    const existingLike = likeCheckStmt.get(interactorId, postIdInt);

    if (existingLike) {
      return NextResponse.json({ message: 'Anda sudah menyukai postingan ini.' }, { status: 409 }); // Conflict
    }

    // 4. Tambahkan like ke database
    const insertLikeStmt = db.prepare('INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    const info = insertLikeStmt.run(interactorId, postIdInt);

    if (info.changes > 0) {
      const likeId = info.lastInsertRowid as number;
      // Hitung jumlah total like untuk postingan ini
      const countStmt = db.prepare('SELECT COUNT(*) as likeCount FROM likes WHERE post_id = ?');
      const result = countStmt.get(postIdInt) as { likeCount: number };

      // highlight-start
      // Buat notifikasi untuk pemilik postingan (jika bukan like postingan sendiri)
      if (authorId !== interactorId) {
        await createNotification(db, {
          recipientUserId: authorId,
          actorUserId: interactorId,
          type: 'POST_LIKED', // Tipe notifikasi yang jelas
          targetEntityType: 'POST',
          targetEntityId: postIdInt,
          message: `${interactorUsername || 'Seseorang'} menyukai postingan Anda.`
        });
      }
      // highlight-end

      return NextResponse.json({ 
        message: 'Postingan berhasil disukai', 
        likeId: likeId, 
        totalLikes: result ? result.likeCount : 0 
      }, { status: 201 });
    } else {
      return NextResponse.json({ message: 'Gagal menyukai postingan.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`Gagal menyukai postingan postId ${postId}:`, error);
    if (error.message?.includes('UNIQUE constraint failed')) { // Dari tabel likes
        return NextResponse.json({ message: 'Anda sudah menyukai postingan ini (constraint).', error: error.message }, { status: 409 });
    }
    return NextResponse.json({ message: 'Gagal memproses suka.', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}

// Handler untuk DELETE request - Membatalkan suka pada sebuah postingan
// (Tidak ada notifikasi yang dibuat saat unlike)
export async function DELETE(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { postId } = await context.params;
  try {
    await request.text(); // Selesaikan request
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) return NextResponse.json({ message: 'Akses ditolak' }, { status: 401 });
    
    const interactorId = authenticatedUser.userId;
    if (!postId) return NextResponse.json({ message: 'Post ID tidak ada' }, { status: 400 });
    const postIdInt = parseInt(postId, 10);
    if (isNaN(postIdInt)) return NextResponse.json({ message: 'Post ID tidak valid' }, { status: 400 });

    const db = getDbConnection();

    const deleteLikeStmt = db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?');
    const info = deleteLikeStmt.run(interactorId, postIdInt);

    if (info.changes > 0) {
      const countStmt = db.prepare('SELECT COUNT(*) as likeCount FROM likes WHERE post_id = ?');
      const result = countStmt.get(postIdInt) as { likeCount: number };
      return NextResponse.json({ message: 'Suka berhasil dibatalkan', totalLikes: result ? result.likeCount : 0 }, { status: 200 });
    } else {
      return NextResponse.json({ message: 'Gagal membatalkan suka: Entri tidak ditemukan atau Anda belum menyukai postingan ini.' }, { status: 404 });
    }
  } catch (error: any) {
    console.error(`Gagal membatalkan suka postId ${postId}:`, error);
    return NextResponse.json({ message: 'Gagal memproses pembatalan suka.', error: error.message }, { status: 500 });
  }
}