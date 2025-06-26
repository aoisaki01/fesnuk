// src/app/api/friend-requests/[requestId]/accept/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';

interface RouteParams {
  requestId: string; // ID dari entri di tabel friendships
}

export async function PUT(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const userId = authenticatedUser.userId; // Pengguna yang login (yang akan menerima)
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
      return NextResponse.json({ message: 'Anda tidak berhak melakukan aksi ini pada permintaan pertemanan tersebut' }, { status: 403 }); // Forbidden
    }

    // 3. Validasi: Pastikan status permintaan adalah 'PENDING'
    if (friendship.status !== 'PENDING') {
      return NextResponse.json({ message: `Permintaan pertemanan ini sudah ${friendship.status === 'ACCEPTED' ? 'diterima' : 'tidak lagi pending'}` }, { status: 409 }); // Conflict
    }

    // 4. Update status permintaan menjadi 'ACCEPTED'
    // Perhatikan kolom 'updated_at' akan diupdate otomatis oleh trigger jika sudah disetup
    const updateStmt = db.prepare(
      "UPDATE friendships SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    );
    const info = updateStmt.run(requestId);

    if (info.changes > 0) {
      return NextResponse.json({ message: 'Permintaan pertemanan berhasil diterima' }, { status: 200 });
    } else {
      // Seharusnya tidak terjadi jika semua cek di atas lolos
      return NextResponse.json({ message: 'Gagal menerima permintaan pertemanan' }, { status: 500 });
    }

  } catch (error) {
    console.error(`Gagal menerima permintaan pertemanan requestId: ${params.requestId}:`, error);
    return NextResponse.json({ message: 'Gagal menerima permintaan pertemanan', error: (error as Error).message }, { status: 500 });
  }
}