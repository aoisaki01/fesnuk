// src/app/api/users/[identifier]/unblock/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan path ini benar

interface RouteParams {
  identifier: string; // Ini adalah ID atau username pengguna yang akan dicabut blokirnya
}

export async function DELETE(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const params = await context.params;
  try {
    // "Selesaikan" request sebelum mengakses params
    await request.text();

    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const blockerId = authenticatedUser.userId; // Pengguna yang melakukan pencabutan blokir (dari JWT)
    const { identifier: blockedUserIdentifier } = params;

    if (!blockedUserIdentifier) {
        return NextResponse.json({ message: 'Identifier pengguna target tidak boleh kosong' }, { status: 400 });
    }

    const db = getDbConnection();

    // Dapatkan ID numerik dari blockedUserIdentifier
    let blockedUserId: number;
    const userStmt = db.prepare('SELECT id FROM users WHERE id = ? OR LOWER(username) = LOWER(?)');
    const targetUserObj = userStmt.get(
        isNaN(parseInt(blockedUserIdentifier, 10)) ? -1 : parseInt(blockedUserIdentifier, 10),
        blockedUserIdentifier.toLowerCase()
    ) as { id: number } | undefined;

    if (!targetUserObj) {
      return NextResponse.json({ message: 'Pengguna target tidak ditemukan' }, { status: 404 });
    }
    blockedUserId = targetUserObj.id;

    // Pengguna tidak bisa melakukan operasi unblock pada diri sendiri (secara logis tidak ada blokirnya)
    if (blockerId === blockedUserId) {
      return NextResponse.json({ message: 'Operasi tidak valid' }, { status: 400 });
    }

    // 1. Cari entri blokir di database
    const findBlockStmt = db.prepare(
      'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?'
    );
    const existingBlock = findBlockStmt.get(blockerId, blockedUserId) as { id: number } | undefined;

    if (!existingBlock) {
      return NextResponse.json({ message: 'Pengguna ini tidak Anda blokir atau blokir tidak ditemukan' }, { status: 404 });
    }

    // 2. Hapus entri blokir dari database
    const deleteBlockStmt = db.prepare('DELETE FROM user_blocks WHERE id = ?');
    const info = deleteBlockStmt.run(existingBlock.id);

    if (info.changes > 0) {
      return NextResponse.json({ message: 'Blokir pengguna berhasil dicabut' }, { status: 200 });
    } else {
      // Seharusnya tidak terjadi jika existingBlock ditemukan
      return NextResponse.json({ message: 'Gagal mencabut blokir pengguna di database' }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`Gagal mencabut blokir untuk identifier ${params?.identifier}:`, error);
    return NextResponse.json({ message: 'Gagal memproses pencabutan blokir', error: error.message }, { status: 500 });
  }
}