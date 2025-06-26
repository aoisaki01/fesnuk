// src/app/api/users/[userId]/unblock/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteParams {
  userId: string; // Ini adalah ID pengguna yang akan dicabut blokirnya (blockedUserId)
}

export async function DELETE(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const blockerId = authenticatedUser.userId; // Pengguna yang melakukan pencabutan blokir (dari JWT)
    const blockedUserId = parseInt(params.userId, 10); // Pengguna yang akan dicabut blokirnya (dari URL)

    if (isNaN(blockedUserId)) {
      return NextResponse.json({ message: 'User ID target tidak valid' }, { status: 400 });
    }

    // Pengguna tidak bisa melakukan operasi unblock pada diri sendiri (secara logis tidak ada)
    if (blockerId === blockedUserId) {
      return NextResponse.json({ message: 'Operasi tidak valid' }, { status: 400 });
    }

    const db = getDbConnection();

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
      // Catatan: Membuka blokir biasanya TIDAK secara otomatis mengembalikan status pertemanan.
      // Pengguna harus mengirim permintaan pertemanan lagi jika diinginkan.
      return NextResponse.json({ message: 'Blokir pengguna berhasil dicabut' }, { status: 200 });
    } else {
      // Seharusnya tidak terjadi jika existingBlock ditemukan
      return NextResponse.json({ message: 'Gagal mencabut blokir pengguna' }, { status: 500 });
    }

  } catch (error) {
    console.error(`Gagal mencabut blokir untuk userId: ${params.userId}:`, error);
    return NextResponse.json({ message: 'Gagal mencabut blokir pengguna', error: (error as Error).message }, { status: 500 });
  }
}