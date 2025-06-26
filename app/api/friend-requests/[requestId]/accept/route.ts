// src/app/api/friend-requests/[requestId]/accept/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan path ini benar

interface RouteParams {
  requestId: string; // ID dari entri di tabel friendships
}

// Fungsi helper untuk membuat notifikasi (jika Anda memisahkannya)
// Jika tidak, definisikan di sini atau pastikan bisa diakses
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
        console.log(`Notifikasi (friend_request_accepted) dibuat: To=${recipientUserId}, Type=${type}, Actor=${actorUserId}`);
    } catch (error) {
        console.error('Gagal membuat notifikasi (friend_request_accepted):', error);
    }
}

export async function PUT(request: NextRequest, context: { params: Promise<RouteParams> }) {
    const { requestId } = await context.params;
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId; // Pengguna yang login (yang akan menerima)
    const loggedInUsername = authenticatedUser.username; // Untuk notifikasi
    const requestIdParsed = parseInt(requestId, 10);

    if (isNaN(requestIdParsed)) {
      return NextResponse.json({ message: 'Request ID tidak valid' }, { status: 400 });
    }

    const db = getDbConnection();

    // 1. Ambil detail permintaan pertemanan
    const friendshipStmt = db.prepare(
      `SELECT id, sender_id, receiver_id, status FROM friendships WHERE id = ?`
    );
    const friendship = friendshipStmt.get(requestIdParsed) as { id: number; sender_id: number; receiver_id: number; status: string; } | undefined;

    if (!friendship) {
      return NextResponse.json({ message: 'Permintaan pertemanan tidak ditemukan' }, { status: 404 });
    }

    // 2. Validasi: Pastikan pengguna yang login adalah penerima permintaan ini
    if (friendship.receiver_id !== loggedInUserId) {
      return NextResponse.json({ message: 'Anda tidak berhak melakukan aksi ini pada permintaan pertemanan tersebut' }, { status: 403 });
    }

    // 3. Validasi: Pastikan status permintaan adalah 'PENDING'
    if (friendship.status !== 'PENDING') {
      return NextResponse.json({ message: `Permintaan pertemanan ini sudah ${friendship.status === 'ACCEPTED' ? 'diterima' : 'tidak lagi pending'}` }, { status: 409 });
    }

    // 4. Update status permintaan menjadi 'ACCEPTED'
    const updateStmt = db.prepare(
      "UPDATE friendships SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    );
    const info = updateStmt.run(requestIdParsed);

    if (info.changes > 0) {
      // Buat notifikasi untuk pengirim bahwa permintaannya diterima
      await createNotification(db, {
        recipientUserId: friendship.sender_id, // Penerima notifikasi adalah si pengirim permintaan
        actorUserId: loggedInUserId,           // Aktornya adalah yang menerima
        type: 'FRIEND_REQUEST_ACCEPTED',
        targetEntityType: 'USER',              // Targetnya adalah profil pengguna yang menerima
        targetEntityId: loggedInUserId,
        message: `${loggedInUsername || 'Seseorang'} telah menerima permintaan pertemanan Anda.`
      });

      return NextResponse.json({ message: 'Permintaan pertemanan berhasil diterima' }, { status: 200 });
    } else {
      return NextResponse.json({ message: 'Gagal menerima permintaan pertemanan' }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`Gagal menerima permintaan pertemanan requestId: ${requestId}:`, error);
    return NextResponse.json({ message: 'Gagal memproses permintaan', error: error.message }, { status: 500 });
  }
}