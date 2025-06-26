// src/app/api/users/[identifier]/friend-requests/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteContextParams {
  identifier: string; // Identifier dari pengguna yang akan menerima permintaan
}

async function createNotification(db: ReturnType<typeof getDbConnection>, params: { /* ... def ... */ }) { /* ... implementasi ... */ }

export async function POST(request: NextRequest, context: { params: RouteContextParams }) {
  console.log("FRIEND REQUEST: Full context received:", JSON.stringify(context, null, 2));
  if (!context || !context.params || !context.params.identifier) {
    console.error("FRIEND REQUEST: FATAL - context.params.identifier is missing.");
    return NextResponse.json({ message: 'Parameter rute tidak ditemukan.' }, { status: 400 });
  }
  const { identifier: receiverIdentifier } = context.params;

  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak' }, { status: 401 });
    }
    const senderId = authenticatedUser.userId;
    const senderUsername = authenticatedUser.username;

    const db = getDbConnection();
    let receiverId: number;

    // Dapatkan ID numerik dari receiverIdentifier
    if (!isNaN(parseInt(receiverIdentifier, 10))) {
      receiverId = parseInt(receiverIdentifier, 10);
    } else {
      // Jika identifier adalah username, cari ID-nya
      const userStmt = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
      const user = userStmt.get(receiverIdentifier) as { id: number } | undefined;
      if (!user) {
        return NextResponse.json({ message: 'Pengguna penerima (username) tidak ditemukan' }, { status: 404 });
      }
      receiverId = user.id;
    }

    const receiverUserCheckStmt = db.prepare('SELECT id, username FROM users WHERE id = ?');
    const receiverUser = receiverUserCheckStmt.get(receiverId) as {id: number, username: string} | undefined;
    if (!receiverUser) {
      return NextResponse.json({ message: 'Pengguna penerima (ID) tidak ditemukan' }, { status: 404 });
    }

    // ... (sisa logika validasi: tidak ke diri sendiri, cek blokir, cek existing friendship - SAMA SEPERTI SEBELUMNYA)
    if (senderId === receiverId) return NextResponse.json({ message: 'Tidak bisa ke diri sendiri' }, { status: 400 });
    // Cek Blokir
    const senderBlockedReceiverStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
    if (senderBlockedReceiverStmt.get(senderId, receiverId)) return NextResponse.json({ message: 'Anda memblokir pengguna ini.' }, { status: 403 });
    const receiverBlockedSenderStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
    if (receiverBlockedSenderStmt.get(receiverId, senderId)) return NextResponse.json({ message: 'Pengguna ini memblokir Anda.' }, { status: 403 });
    // Cek Existing Friendship
    const existingFriendshipStmt = db.prepare(`SELECT id, status, sender_id FROM friendships WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`);
    const existingFriendship = existingFriendshipStmt.get(senderId, receiverId, receiverId, senderId) as {id: number; status: string; sender_id: number;} | undefined;
    if (existingFriendship) { /* ... (handle existing) ... */ }


    const insertRequestStmt = db.prepare('INSERT INTO friendships (sender_id, receiver_id, status) VALUES (?, ?, ?)');
    const info = insertRequestStmt.run(senderId, receiverId, 'PENDING');

    if (info.changes > 0 && info.lastInsertRowid) {
      const friendshipId = info.lastInsertRowid as number;
      // await createNotification(db, { /* ... */ }); // Pastikan createNotification ada dan benar
      return NextResponse.json({ message: 'Permintaan terkirim', friendshipId, status: 'PENDING' }, { status: 201 });
    } else {
      return NextResponse.json({ message: 'Gagal mengirim permintaan' }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`Gagal mengirim permintaan pertemanan ke identifier ${receiverIdentifier}:`, error);
    return NextResponse.json({ message: 'Gagal memproses permintaan', error: error.message }, { status: 500 });
  }
}