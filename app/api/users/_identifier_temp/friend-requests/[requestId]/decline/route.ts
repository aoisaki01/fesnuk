// src/app/api/friend-requests/[requestId]/decline/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteParams {
  requestId: string; // ID dari entri di tabel friendships
}

export async function DELETE(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const userId = authenticatedUser.userId; // Pengguna yang login (yang akan menolak)
    const requestId = parseInt(params.requestId, 10);

    if (isNaN(requestId)) {
      return NextResponse.json({ message: 'Request ID tidak valid' }, { status: 400 });
    }

    const db = getDbConnection();

    // 1. Ambil detail permintaan pertemanan
    const friendshipStmt = db.prepare(`
      SELECT id, sender_id, receiver_id, status
      FROM friendships
      WHERE id = ?
    `);
    // @ts-ignore
    const friendship = friendshipStmt.get(requestId) as { id: number; sender_id: number; receiver_id: number; status: string; } | undefined;

    if (!friendship) {
      return NextResponse.json({ message: 'Permintaan pertemanan tidak ditemukan' }, { status: 404 });
    }

    // 2. Validasi: Pastikan pengguna yang login adalah penerima permintaan ini
    if (friendship.receiver_id !== userId) {
      // Alternatif: Jika Anda ingin pengirim juga bisa membatalkan permintaannya,
      // Anda bisa mengubah kondisi ini menjadi:
      // if (friendship.receiver_id !== userId && friendship.sender_id !== userId) {
      // Untuk saat ini, kita hanya izinkan penerima untuk menolak.
      return NextResponse.json({ message: 'Anda tidak berhak melakukan aksi ini pada permintaan pertemanan tersebut' }, { status: 403 }); // Forbidden
    }

    // 3. Validasi: Pastikan status permintaan adalah 'PENDING'
    if (friendship.status !== 'PENDING') {
      return NextResponse.json({ message: `Permintaan pertemanan ini sudah ${friendship.status === 'ACCEPTED' ? 'diterima' : 'tidak lagi pending'}` }, { status: 409 }); // Conflict
    }

    // 4. Hapus entri permintaan pertemanan dari database
    const deleteStmt = db.prepare('DELETE FROM friendships WHERE id = ?');
    const info = deleteStmt.run(requestId);

    if (info.changes > 0) {
      return NextResponse.json({ message: 'Permintaan pertemanan berhasil ditolak (dihapus)' }, { status: 200 });
    } else {
      // Seharusnya tidak terjadi jika semua cek di atas lolos dan requestId valid
      return NextResponse.json({ message: 'Gagal menolak permintaan pertemanan atau permintaan sudah tidak ada' }, { status: 404 }); // Atau 500 jika error server
    }

  } catch (error) {
    console.error(`Gagal menolak permintaan pertemanan requestId: ${params.requestId}:`, error);
    return NextResponse.json({ message: 'Gagal menolak permintaan pertemanan', error: (error as Error).message }, { status: 500 });
  }
}