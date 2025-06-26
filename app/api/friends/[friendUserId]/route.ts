// src/app/api/friends/[friendUserId]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteParams {
  friendUserId: string; // ID pengguna yang ingin di-unfriend
}

export async function DELETE(request: NextRequest, context: { params: Promise<RouteParams> }) {
    const { friendUserId } = await context.params;
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;
    const friendUserIdToUnfriend = parseInt(friendUserId, 10);

    if (isNaN(friendUserIdToUnfriend)) {
      return NextResponse.json({ message: 'User ID teman tidak valid' }, { status: 400 });
    }

    // 1. Pengguna tidak bisa unfriend diri sendiri
    if (loggedInUserId === friendUserIdToUnfriend) {
      return NextResponse.json({ message: 'Anda tidak bisa membatalkan pertemanan dengan diri sendiri' }, { status: 400 });
    }

    const db = getDbConnection();

    // 2. Cari entri pertemanan yang statusnya 'ACCEPTED' antara loggedInUserId dan friendUserIdToUnfriend
    // Pertemanan bisa (loggedInUserId -> friendUserIdToUnfriend) ATAU (friendUserIdToUnfriend -> loggedInUserId)
    const findFriendshipStmt = db.prepare(`
      SELECT id
      FROM friendships
      WHERE
        ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND status = 'ACCEPTED'
    `);
    const friendshipToDelete = findFriendshipStmt.get(
      loggedInUserId,
      friendUserIdToUnfriend,
      friendUserIdToUnfriend,
      loggedInUserId
    ) as { id: number } | undefined;

    if (!friendshipToDelete) {
      return NextResponse.json({ message: 'Pertemanan tidak ditemukan atau Anda tidak berteman dengan pengguna ini' }, { status: 404 });
    }

    // 3. Hapus entri pertemanan dari database
    const deleteStmt = db.prepare('DELETE FROM friendships WHERE id = ?');
    const info = deleteStmt.run(friendshipToDelete.id);

    if (info.changes > 0) {
      return NextResponse.json({ message: 'Pertemanan berhasil dibatalkan' }, { status: 200 });
    } else {
      // Seharusnya tidak terjadi jika friendshipToDelete ditemukan
      return NextResponse.json({ message: 'Gagal membatalkan pertemanan' }, { status: 500 });
    }

  } catch (error) {
    console.error(`Gagal membatalkan pertemanan dengan userId: ${friendUserId}:`, error);
    return NextResponse.json({ message: 'Gagal membatalkan pertemanan', error: (error as Error).message }, { status: 500 });
  }
}