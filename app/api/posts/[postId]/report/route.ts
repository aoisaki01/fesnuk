// src/app/api/posts/[postId]/report/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan path ini benar

interface RouteParams {
  postId: string;
}

// Interface untuk body request jika Anda mengirimkan 'reason' sebagai JSON
interface ReportRequestBody {
  reason?: string;
}

const MAX_REPORTS_TO_HIDE = 5; // Jumlah laporan sebelum postingan disembunyikan

export async function POST(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const routeParams = await context.params;
  let reason: string | null = null;
  try {
    const body = await request.json() as ReportRequestBody;
    if (body.reason && typeof body.reason === 'string') {
        reason = body.reason.trim() || null;
    }
  } catch (e) {
    console.log("Tidak ada 'reason' dalam body request atau body bukan JSON untuk report.");
  }

  if (!routeParams || !routeParams.postId) {
      console.error("API Report Post: postId tidak ditemukan di parameter rute.");
      return NextResponse.json({ message: 'Post ID tidak valid atau tidak ada di parameter rute.' }, { status: 400 });
  }
  const postIdString = routeParams.postId;

  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan.' }, { status: 401 });
    }
    const reporterUserId = authenticatedUser.userId;
    
    const postId = parseInt(postIdString, 10);
    if (isNaN(postId)) {
      return NextResponse.json({ message: 'Post ID tidak valid (bukan angka).' }, { status: 400 });
    }

    const db = getDbConnection();

    // 1. Cek apakah postingan ada dan statusnya masih 'VISIBLE'
    const postStmt = db.prepare("SELECT id, user_id, visibility_status FROM posts WHERE id = ?");
    const post = postStmt.get(postId) as { id: number; user_id: number; visibility_status: string } | undefined;

    if (!post) {
      return NextResponse.json({ message: 'Postingan tidak ditemukan.' }, { status: 404 });
    }
    if (post.visibility_status !== 'VISIBLE') {
        // Jika sudah HIDDEN_BY_REPORTS atau status lain yang tidak bisa dilaporkan lagi
        return NextResponse.json({ message: 'Postingan ini tidak dapat dilaporkan saat ini.' }, { status: 409 });
    }

    // 2. Pengguna tidak bisa melaporkan postingannya sendiri
    if (post.user_id === reporterUserId) {
      return NextResponse.json({ message: 'Anda tidak bisa melaporkan postingan Anda sendiri.' }, { status: 400 });
    }

    // Mulai transaksi
    db.exec('BEGIN TRANSACTION');

    try {
      // 3. Cek apakah pengguna sudah pernah melaporkan postingan ini
      const existingReportStmt = db.prepare('SELECT id FROM post_reports WHERE post_id = ? AND reporter_user_id = ?');
      const existingReport = existingReportStmt.get(postId, reporterUserId);

      if (existingReport) {
        db.exec('ROLLBACK');
        return NextResponse.json({ message: 'Anda sudah melaporkan postingan ini.' }, { status: 409 }); // Conflict
      }

      // 4. Masukkan laporan baru
      const insertReportStmt = db.prepare(
        'INSERT INTO post_reports (post_id, reporter_user_id, reason) VALUES (?, ?, ?)'
      );
      insertReportStmt.run(postId, reporterUserId, reason);

      // 5. Hitung jumlah laporan unik untuk postingan ini
      const countReportsStmt = db.prepare('SELECT COUNT(DISTINCT reporter_user_id) as reportCount FROM post_reports WHERE post_id = ?');
      const reportResult = countReportsStmt.get(postId) as { reportCount: number };
      const currentReportCount = reportResult ? reportResult.reportCount : 0;

      console.log(`Post ID ${postId} sekarang memiliki ${currentReportCount} laporan unik.`);

      // 6. Jika jumlah laporan mencapai batas, sembunyikan postingan
      let postHidden = false;
      if (currentReportCount >= MAX_REPORTS_TO_HIDE) {
        const hidePostStmt = db.prepare("UPDATE posts SET visibility_status = 'HIDDEN_BY_REPORTS', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND visibility_status = 'VISIBLE'");
        const hideInfo = hidePostStmt.run(postId);
        if (hideInfo.changes > 0) {
            console.log(`Post ID ${postId} disembunyikan karena mencapai ${MAX_REPORTS_TO_HIDE} laporan.`);
            postHidden = true;
        }
      }

      db.exec('COMMIT');
      return NextResponse.json({ 
        message: 'Postingan berhasil dilaporkan.', 
        currentReportCount,
        postHidden 
      }, { status: 201 });

    } catch (transactionError: any) {
      db.exec('ROLLBACK');
      console.error(`Error dalam transaksi pelaporan untuk post ID ${postId}:`, transactionError);
      // Periksa apakah errornya adalah 'no such table: post_reports'
      if (transactionError.code === 'SQLITE_ERROR' && transactionError.message.includes('no such table: post_reports')) {
        return NextResponse.json({ message: 'Fitur laporan belum siap: tabel laporan tidak ditemukan. Hubungi admin.' }, { status: 500 });
      }
      throw transactionError; // Lemparkan lagi agar ditangkap oleh catch luar
    }

  } catch (error: any) {
    console.error(`Gagal melaporkan postingan postId ${routeParams?.postId}:`, error);
    // Jika error karena parsing JSON gagal (misalnya dari await request.json())
    if (error instanceof SyntaxError && error.message.toLowerCase().includes('json')) {
        // Ini sudah ditangani di atas, tapi sebagai fallback
        return NextResponse.json({ message: 'Format body request tidak valid jika mengirimkan reason.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal memproses laporan.', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}