// src/app/api/livestreams/start/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan path ini benar

interface StartLiveRequestBody {
  caption?: string | null;
}

// Tipe data untuk PostData yang dikembalikan (termasuk field live stream)
interface LivePostData {
  id: number;
  user_id: number;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  is_live: boolean;
  live_status: string | null;
  stream_playback_url: string | null;
  author_username?: string; // Opsional, tergantung query saat mengambil data
  author_profile_picture_url?: string | null; // Opsional
}

// Fungsi helper untuk membuat notifikasi (opsional, jika Anda menggunakannya)
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
        console.log(`Notifikasi (LIVESTREAM_START) dibuat: To=${recipientUserId}, Type=${type}, Actor=${actorUserId}`);
    } catch (error) {
        console.error('Gagal membuat notifikasi (LIVESTREAM_START):', error);
    }
}

export async function POST(request: NextRequest) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan.' }, { status: 401 });
    }
    const userId = authenticatedUser.userId;
    const username = authenticatedUser.username; // Untuk pesan notifikasi

    let body;
    try {
        body = await request.json() as StartLiveRequestBody;
    } catch (e) {
        console.error("API /livestreams/start: Gagal parse JSON body:", e);
        return NextResponse.json({ message: 'Format request body tidak valid atau body kosong, pastikan mengirim JSON.' }, { status: 400 });
    }
    
    const caption = body.caption ? body.caption.trim() : null;

    const db = getDbConnection();

    // Verifikasi apakah userId dari token ada di tabel users
    const userCheckStmt = db.prepare('SELECT id FROM users WHERE id = ?');
    const userExists = userCheckStmt.get(userId) as { id: number } | undefined;

    if (!userExists) {
        console.error(`API /livestreams/start: Pengguna dengan ID ${userId} (dari token) tidak ditemukan di tabel users.`);
        return NextResponse.json({ message: 'Error: Pengguna terkait tidak valid atau sesi tidak sinkron.' }, { status: 400 });
    }

    // Placeholder untuk URL playback. Di aplikasi nyata, ini mungkin didapat dari media server.
    const placeholderPlaybackUrl = `/live-placeholder/${userId}/${Date.now()}`;

    console.log(`API /livestreams/start: Mencoba memasukkan postingan live untuk userId=${userId}, caption=${caption}, playbackUrl=${placeholderPlaybackUrl}`);

    const insertStmt = db.prepare(
      `INSERT INTO posts (user_id, content, is_live, live_status, stream_playback_url, image_url, video_url, created_at, updated_at)
       VALUES (?, ?, TRUE, 'PENDING', ?, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    
    // Kolom 'content' di tabel 'posts' harus bisa NULL berdasarkan skema terbaru kita (Canvas #113)
    const info = insertStmt.run(userId, caption, placeholderPlaybackUrl);

    if (info.changes > 0 && info.lastInsertRowid) {
      const newPostId = info.lastInsertRowid as number;
      
      const newPostStmt = db.prepare<[number], LivePostData>(`
        SELECT p.id, p.user_id, p.content, p.image_url, p.video_url, 
               p.created_at, p.updated_at, p.is_live, p.live_status, p.stream_playback_url,
               u.username as author_username, u.profile_picture_url as author_profile_picture_url
        FROM posts p JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `);
      const newLivePost = newPostStmt.get(newPostId);

      // Anda bisa memanggil createNotification di sini jika perlu
      // await createNotification(db, { /* parameter yang sesuai */ });

      return NextResponse.json({ message: 'Sesi live stream berhasil dimulai (status PENDING)', post: newLivePost }, { status: 201 });
    } else {
      console.error("API /livestreams/start: Gagal insert postingan live ke DB. Info:", info);
      return NextResponse.json({ message: 'Gagal memulai sesi live stream di database' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error memulai live stream (API /livestreams/start):', error);
    // Deteksi error parsing JSON dari body request
    if (error instanceof SyntaxError && error.message.toLowerCase().includes('json')) {
        return NextResponse.json({ message: 'Format request body tidak valid atau body kosong, pastikan mengirim JSON.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal memulai live stream', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}