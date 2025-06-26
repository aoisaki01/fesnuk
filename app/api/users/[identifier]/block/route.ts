// src/app/api/users/[identifier]/block/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan path ini benar

interface RouteParams {
  identifier: string; // Ini adalah ID atau username pengguna yang akan diblokir
}

export async function POST(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const params = await context.params;
  try {
    // "Selesaikan" request sebelum mengakses params
    // Untuk POST ini, kita tidak mengharapkan body JSON, jadi request.text() cukup.
    await request.text();

    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const blockerId = authenticatedUser.userId; // Pengguna yang melakukan blokir (dari JWT)
    const { identifier: blockedUserIdentifier } = params;

    if (!blockedUserIdentifier) {
        return NextResponse.json({ message: 'Identifier pengguna target tidak boleh kosong' }, { status: 400 });
    }

    const db = getDbConnection();

    // Dapatkan ID numerik dari blockedUserIdentifier
    let blockedUserId: number;
    const userStmt = db.prepare('SELECT id FROM users WHERE id = ? OR LOWER(username) = LOWER(?)');
    const targetUserObj = userStmt.get(
        isNaN(parseInt(blockedUserIdentifier, 10)) ? -1 : parseInt(blockedUserIdentifier, 10), // Coba parse sebagai ID
        blockedUserIdentifier.toLowerCase() // Coba sebagai username
    ) as { id: number } | undefined;

    if (!targetUserObj) {
      return NextResponse.json({ message: 'Pengguna target tidak ditemukan' }, { status: 404 });
    }
    blockedUserId = targetUserObj.id;

    // 1. Pengguna tidak bisa memblokir diri sendiri
    if (blockerId === blockedUserId) {
      return NextResponse.json({ message: 'Anda tidak bisa memblokir diri sendiri' }, { status: 400 });
    }

    // 2. Cek apakah sudah ada blokir sebelumnya
    const existingBlockStmt = db.prepare('SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?');
    const existingBlock = existingBlockStmt.get(blockerId, blockedUserId);

    if (existingBlock) {
      return NextResponse.json({ message: 'Anda sudah memblokir pengguna ini' }, { status: 409 }); // Conflict
    }

    // 3. Tambahkan entri blokir ke database
    // Mulai transaksi untuk memastikan konsistensi data
    db.exec('BEGIN TRANSACTION');
    try {
        const insertBlockStmt = db.prepare(
            'INSERT INTO user_blocks (blocker_id, blocked_user_id) VALUES (?, ?)'
        );
        const info = insertBlockStmt.run(blockerId, blockedUserId);

        if (info.changes > 0) {
            // 4. Putus pertemanan yang sudah ada (jika ada)
            const terminateFriendshipStmt = db.prepare(`
                DELETE FROM friendships
                WHERE
                ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                AND status = 'ACCEPTED'
            `);
            terminateFriendshipStmt.run(blockerId, blockedUserId, blockedUserId, blockerId);

            // Hapus juga permintaan pertemanan PENDING antara mereka.
            const terminatePendingRequestsStmt = db.prepare(`
                DELETE FROM friendships
                WHERE
                ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                AND status = 'PENDING'
            `);
            terminatePendingRequestsStmt.run(blockerId, blockedUserId, blockedUserId, blockerId);

            db.exec('COMMIT');
            return NextResponse.json({
                message: 'Pengguna berhasil diblokir',
                blockId: info.lastInsertRowid
            }, { status: 201 }); // 201 Created
        } else {
            db.exec('ROLLBACK');
            return NextResponse.json({ message: 'Gagal memblokir pengguna di database' }, { status: 500 });
        }
    } catch (transactionError: any) {
        db.exec('ROLLBACK');
        console.error(`Error dalam transaksi blokir untuk target ${blockedUserIdentifier}:`, transactionError);
        return NextResponse.json({ message: 'Gagal memblokir pengguna karena error transaksi', error: transactionError.message }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`Gagal memblokir pengguna dengan identifier ${params?.identifier}:`, error);
    return NextResponse.json({ message: 'Gagal memproses permintaan blokir', error: error.message }, { status: 500 });
  }
}