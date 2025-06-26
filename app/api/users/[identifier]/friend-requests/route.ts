// src/app/api/users/[identifier]/friend-requests/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteContextParams {
  identifier: string;
}

// Fungsi helper untuk membuat notifikasi (pastikan sudah ada dan benar)
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
        console.log(`Notifikasi (FRIEND_REQUEST_RECEIVED) dibuat: To=${recipientUserId}, Type=${type}, Actor=${actorUserId}`);
    } catch (error) {
        console.error('Gagal membuat notifikasi (FRIEND_REQUEST_RECEIVED):', error);
    }
}

export async function POST(request: NextRequest, context: { params: Promise<RouteContextParams> }) {
  const params = await context.params;
  // 1. "Selesaikan" objek request terlebih dahulu
  // Untuk POST ini, kita tidak membaca body dari client, jadi request.text() cukup.
  // Jika Anda mengirim JSON body dari client untuk API POST lain, gunakan await request.json().
  try {
    await request.text(); // Ini untuk memenuhi ekspektasi Next.js sebelum params diakses
  } catch (e) {
    // Error saat membaca request (jarang terjadi untuk request.text() jika tidak ada body aneh)
    console.error("Error 'settling' request object:", e);
    // Anda bisa memutuskan apakah ini fatal atau tidak. Untuk saat ini, kita lanjutkan.
  }

  // 2. Sekarang, akses dan validasi params
  // Log untuk debugging
  console.log("FRIEND REQUEST API Handler (after await): Full context received:", JSON.stringify(context, null, 2));
  console.log("FRIEND REQUEST API Handler (after await): context.params:", JSON.stringify(context?.params, null, 2));

  if (!params || typeof params.identifier !== 'string' || params.identifier.trim() === '') {
    console.error("FRIEND REQUEST API: ERROR - params.identifier is missing, not a string, or empty.");
    return NextResponse.json({ message: 'Parameter rute "identifier" pengguna tidak ditemukan atau tidak valid.' }, { status: 400 });
  }
  const receiverIdentifier = params.identifier;

  // 3. Lanjutkan dengan autentikasi dan logika utama
  try {
    const authenticatedUser = verifyAuth(request); // verifyAuth tetap menggunakan objek 'request' asli
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan.' }, { status: 401 });
    }
    const senderId = authenticatedUser.userId;
    const senderUsername = authenticatedUser.username;

    const db = getDbConnection();
    let receiverId: number;

    // Konversi receiverIdentifier ke receiverId (angka)
    if (!isNaN(parseInt(receiverIdentifier, 10))) {
      receiverId = parseInt(receiverIdentifier, 10);
    } else {
      const userStmt = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
      const user = userStmt.get(receiverIdentifier.toLowerCase()) as { id: number } | undefined;
      if (!user) {
        return NextResponse.json({ message: `Pengguna penerima dengan username "${receiverIdentifier}" tidak ditemukan` }, { status: 404 });
      }
      receiverId = user.id;
    }
    
    console.log(`FRIEND REQUEST API: senderId: ${senderId}, receiverId (from identifier "${receiverIdentifier}"): ${receiverId}`);

    const receiverUserCheckStmt = db.prepare('SELECT id, username FROM users WHERE id = ?');
    const receiverUser = receiverUserCheckStmt.get(receiverId) as {id: number, username: string} | undefined;
    if (!receiverUser) {
      return NextResponse.json({ message: `Pengguna penerima dengan ID ${receiverId} tidak ditemukan setelah konversi.` }, { status: 404 });
    }

    // Validasi (tidak ke diri sendiri, cek blokir, cek existing friendship)
    if (senderId === receiverId) {
      return NextResponse.json({ message: 'Anda tidak bisa mengirim permintaan pertemanan ke diri sendiri' }, { status: 400 });
    }
    
    const senderBlockedReceiverStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
    if (senderBlockedReceiverStmt.get(senderId, receiverId)) {
      return NextResponse.json({ message: 'Anda tidak dapat mengirim permintaan pertemanan kepada pengguna yang telah Anda blokir.' }, { status: 403 });
    }
    const receiverBlockedSenderStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
    if (receiverBlockedSenderStmt.get(receiverId, senderId)) {
      return NextResponse.json({ message: 'Pengguna ini tidak menerima permintaan pertemanan dari Anda.' }, { status: 403 });
    }
    
    const existingFriendshipStmt = db.prepare(`SELECT id, status, sender_id FROM friendships WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`);
    const existingFriendship = existingFriendshipStmt.get(senderId, receiverId, receiverId, senderId) as {id: number; status: string; sender_id: number;} | undefined;

    if (existingFriendship) {
        if (existingFriendship.status === 'ACCEPTED') {
            return NextResponse.json({ message: 'Anda sudah berteman dengan pengguna ini' }, { status: 409 });
        }
        if (existingFriendship.status === 'PENDING') {
            if (existingFriendship.sender_id === senderId) {
                return NextResponse.json({ message: 'Anda sudah mengirim permintaan pertemanan ke pengguna ini' }, { status: 409 });
            } else {
                return NextResponse.json({ message: 'Pengguna ini sudah mengirim permintaan kepada Anda. Silakan direspons.' }, { status: 409 });
            }
        }
    }

    // Buat entri permintaan pertemanan baru
    const insertRequestStmt = db.prepare('INSERT INTO friendships (sender_id, receiver_id, status) VALUES (?, ?, ?)');
    const info = insertRequestStmt.run(senderId, receiverId, 'PENDING');

    if (info.changes > 0 && info.lastInsertRowid) {
      const friendshipId = info.lastInsertRowid as number;
      await createNotification(db, {
          recipientUserId: receiverId,
          actorUserId: senderId,
          type: 'FRIEND_REQUEST_RECEIVED',
          targetEntityType: 'USER', 
          targetEntityId: senderId, 
          message: `${senderUsername || 'Seseorang'} mengirimi Anda permintaan pertemanan.`
      });
      return NextResponse.json({ message: 'Permintaan pertemanan berhasil dikirim', friendshipId, status: 'PENDING' }, { status: 201 });
    } else {
      console.error("FRIEND REQUEST API: Gagal insert friendship ke DB.", info);
      return NextResponse.json({ message: 'Gagal mengirim permintaan pertemanan ke database' }, { status: 500 });
    }

  } catch (error: any) { // Ini akan menangkap error dari langkah 3 dan seterusnya
    console.error(`Gagal memproses permintaan pertemanan untuk identifier ${params?.identifier}:`, error);
    return NextResponse.json({ message: 'Gagal memproses permintaan pertemanan.', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}