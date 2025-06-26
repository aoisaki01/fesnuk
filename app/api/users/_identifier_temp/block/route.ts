// src/app/api/users/[userId]/block/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteParams {
  userId: string; // Ini adalah ID pengguna yang akan diblokir (blockedUserId)
}

export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const blockerId = authenticatedUser.userId; // Pengguna yang melakukan blokir (dari JWT)
    const blockedUserId = parseInt(params.userId, 10); // Pengguna yang akan diblokir (dari URL)

    if (isNaN(blockedUserId)) {
      return NextResponse.json({ message: 'User ID target tidak valid' }, { status: 400 });
    }

    // 1. Pengguna tidak bisa memblokir diri sendiri
    if (blockerId === blockedUserId) {
      return NextResponse.json({ message: 'Anda tidak bisa memblokir diri sendiri' }, { status: 400 });
    }

    const db = getDbConnection();

    // 2. Cek apakah pengguna target (yang akan diblokir) ada
    const targetUserStmt = db.prepare('SELECT id FROM users WHERE id = ?');
    const targetUser = targetUserStmt.get(blockedUserId);
    if (!targetUser) {
      return NextResponse.json({ message: 'Pengguna target tidak ditemukan' }, { status: 404 });
    }

    // 3. Cek apakah sudah ada blokir sebelumnya
    const existingBlockStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
    const existingBlock = existingBlockStmt.get(blockerId, blockedUserId);

    if (existingBlock) {
      return NextResponse.json({ message: 'Anda sudah memblokir pengguna ini' }, { status: 409 }); // Conflict
    }

    // 4. Tambahkan entri blokir ke database
    const insertBlockStmt = db.prepare(
      'INSERT INTO user_blocks (blocker_id, blocked_user_id) VALUES (?, ?)'
    );
    const info = insertBlockStmt.run(blockerId, blockedUserId);

    if (info.changes > 0) {
      // 5. (PENTING) Putus pertemanan yang sudah ada (jika ada)
      // Pertemanan bisa (blocker -> blocked) ATAU (blocked -> blocker)
      const terminateFriendshipStmt = db.prepare(`
        DELETE FROM friendships
        WHERE
          ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
          AND status = 'ACCEPTED'
      `);
      terminateFriendshipStmt.run(blockerId, blockedUserId, blockedUserId, blockerId);
      // Anda mungkin juga ingin menghapus permintaan pertemanan PENDING antara mereka.
      const terminatePendingRequestsStmt = db.prepare(`
        DELETE FROM friendships
        WHERE
          ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
          AND status = 'PENDING'
      `);
      terminatePendingRequestsStmt.run(blockerId, blockedUserId, blockedUserId, blockerId);


      return NextResponse.json({
        message: 'Pengguna berhasil diblokir',
        blockId: info.lastInsertRowid
      }, { status: 201 });
    } else {
      return NextResponse.json({ message: 'Gagal memblokir pengguna' }, { status: 500 });
    }

  } catch (error) {
    console.error(`Gagal memblokir userId: ${params.userId}:`, error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        // Seharusnya sudah ditangani oleh pengecekan existingBlock di atas
        return NextResponse.json({ message: 'Anda sudah memblokir pengguna ini (UNIQUE constraint).', error: error.message }, { status: 409 });
    }
    return NextResponse.json({ message: 'Gagal memblokir pengguna', error: (error as Error).message }, { status: 500 });
  }
}