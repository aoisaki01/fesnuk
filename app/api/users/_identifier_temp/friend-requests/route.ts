// src/app/api/users/[userId]/friend-requests/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteParams {
  userId: string;
}

export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const senderId = authenticatedUser.userId;
    const receiverId = parseInt(params.userId, 10);

    if (isNaN(receiverId)) {
      return NextResponse.json({ message: 'User ID penerima tidak valid' }, { status: 400 });
    }

    if (senderId === receiverId) {
      return NextResponse.json({ message: 'Anda tidak bisa mengirim permintaan pertemanan ke diri sendiri' }, { status: 400 });
    }

    const db = getDbConnection();

    const receiverUserStmt = db.prepare('SELECT id FROM users WHERE id = ?');
    const receiverUser = receiverUserStmt.get(receiverId);
    if (!receiverUser) {
      return NextResponse.json({ message: 'Pengguna penerima tidak ditemukan' }, { status: 404 });
    }

    // highlight-start
    // TAMBAHAN: Cek status blokir dua arah
    // Cek apakah sender telah memblokir receiver
    const senderBlockedReceiverStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
    const senderBlockedReceiver = senderBlockedReceiverStmt.get(senderId, receiverId);
    if (senderBlockedReceiver) {
      return NextResponse.json({ message: 'Anda tidak dapat mengirim permintaan pertemanan kepada pengguna yang telah Anda blokir.' }, { status: 403 }); // Forbidden
    }

    // Cek apakah receiver telah memblokir sender
    const receiverBlockedSenderStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
    const receiverBlockedSender = receiverBlockedSenderStmt.get(receiverId, senderId);
    if (receiverBlockedSender) {
      return NextResponse.json({ message: 'Pengguna ini tidak menerima permintaan pertemanan dari Anda.' }, { status: 403 }); // Forbidden
    }
    // highlight-end

    const existingFriendshipStmt = db.prepare(`
      SELECT id, status, sender_id FROM friendships
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    `);
    const existingFriendship = existingFriendshipStmt.get(senderId, receiverId, receiverId, senderId) as {id: number; status: string; sender_id: number;} | undefined;

    if (existingFriendship) {
      if (existingFriendship.status === 'ACCEPTED') {
        return NextResponse.json({ message: 'Anda sudah berteman dengan pengguna ini' }, { status: 409 });
      } else if (existingFriendship.status === 'PENDING') {
        if (existingFriendship.sender_id === senderId) {
          return NextResponse.json({ message: 'Anda sudah mengirim permintaan pertemanan ke pengguna ini' }, { status: 409 });
        } else {
          return NextResponse.json({ message: 'Pengguna ini sudah mengirim permintaan pertemanan kepada Anda. Silakan terima atau tolak permintaannya.' }, { status: 409 });
        }
      }
    }

    const insertRequestStmt = db.prepare(
      'INSERT INTO friendships (sender_id, receiver_id, status) VALUES (?, ?, ?)'
    );
    const info = insertRequestStmt.run(senderId, receiverId, 'PENDING');

    if (info.changes > 0) {
      return NextResponse.json({
        message: 'Permintaan pertemanan berhasil dikirim',
        friendshipId: info.lastInsertRowid,
        status: 'PENDING'
      }, { status: 201 });
    } else {
      return NextResponse.json({ message: 'Gagal mengirim permintaan pertemanan' }, { status: 500 });
    }

  } catch (error) {
    console.error(`Gagal mengirim permintaan pertemanan ke userId: ${params.userId}:`, error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return NextResponse.json({ message: 'Permintaan pertemanan sudah ada atau konflik lainnya.', error: error.message }, { status: 409 });
    }
    return NextResponse.json({ message: 'Gagal mengirim permintaan pertemanan', error: (error as Error).message }, { status: 500 });
  }
}