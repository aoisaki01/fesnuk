// src/app/api/friend-requests/[requestId]/decline/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan path ini benar

interface RouteParams {
  requestId: string; // ID dari entri di tabel friendships
}

export async function DELETE(request: NextRequest, context: { params: Promise<RouteParams> }) {
    const { requestId } = await context.params;

  // "Selesaikan" request sebelum mengakses params (best practice Next.js baru)
  // Untuk DELETE request, body biasanya tidak ada atau tidak dibaca, jadi request.text() cukup.
  try {
    await request.text(); 
  } catch (e) { /* Abaikan error parsing jika tidak ada body */ }

  console.log("DECLINE FRIEND REQUEST API: Full context received:", JSON.stringify({ requestId }, null, 2));
  if (!requestId) {
    console.error("DECLINE FRIEND REQUEST API: FATAL - requestId is missing.");
    return NextResponse.json({ message: 'Parameter requestId tidak ditemukan.' }, { status: 400 });
  }

  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId; // Pengguna yang login (yang akan menolak)
    const requestIdNum = parseInt(requestId, 10);

    if (isNaN(requestIdNum)) {
      return NextResponse.json({ message: 'Request ID tidak valid (bukan angka)' }, { status: 400 });
    }

    const db = getDbConnection();

    // 1. Ambil detail permintaan pertemanan
    const friendshipStmt = db.prepare(
      `SELECT id, sender_id, receiver_id, status FROM friendships WHERE id = ?`
    );
    const friendship = friendshipStmt.get(requestIdNum) as { id: number; sender_id: number; receiver_id: number; status: string; } | undefined;

    if (!friendship) {
      return NextResponse.json({ message: 'Permintaan pertemanan tidak ditemukan' }, { status: 404 });
    }

    // 2. Validasi: Pastikan pengguna yang login adalah PENERIMA permintaan ini
    if (friendship.receiver_id !== loggedInUserId) {
      return NextResponse.json({ message: 'Anda tidak berhak melakukan aksi ini pada permintaan tersebut' }, { status: 403 }); // Forbidden
    }

    // 3. Validasi: Pastikan status permintaan adalah 'PENDING'
    if (friendship.status !== 'PENDING') {
      return NextResponse.json({ message: `Permintaan pertemanan ini sudah ${friendship.status === 'ACCEPTED' ? 'diterima' : 'tidak lagi pending'}` }, { status: 409 }); // Conflict
    }

    // 4. Hapus entri permintaan pertemanan dari database
    // Menolak permintaan sama dengan menghapus record PENDING-nya.
    const deleteStmt = db.prepare('DELETE FROM friendships WHERE id = ? AND receiver_id = ?');
    const info = deleteStmt.run(requestIdNum, loggedInUserId); // Pastikan hanya receiver yg bisa delete PENDING requestnya

    if (info.changes > 0) {
      // Notifikasi ke pengirim bahwa permintaannya ditolak (opsional)
      // await createNotification(db, {
      //   recipientUserId: friendship.sender_id,
      //   actorUserId: loggedInUserId,
      //   type: 'FRIEND_REQUEST_DECLINED',
      //   targetEntityType: 'USER',
      //   targetEntityId: loggedInUserId,
      //   message: `${authenticatedUser.username || 'Seseorang'} telah menolak permintaan pertemanan Anda.`
      // });
      return NextResponse.json({ message: 'Permintaan pertemanan berhasil ditolak' }, { status: 200 });
    } else {
      // Seharusnya tidak terjadi jika semua cek di atas lolos
      return NextResponse.json({ message: 'Gagal menolak permintaan pertemanan atau permintaan sudah tidak ada/valid' }, { status: 404 });
    }

  } catch (error: any) {
    console.error(`Gagal menolak permintaan pertemanan requestId: ${requestId}:`, error);
    return NextResponse.json({ message: 'Gagal memproses permintaan', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}