// src/app/api/profile/change-password/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan path ini benar
import bcrypt from 'bcryptjs';

interface ChangePasswordRequestBody {
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
}

export async function PUT(request: NextRequest) {
  try {
    // "Selesaikan" request dengan membaca body JSON SEBELUM mengakses params (jika ada)
    // atau sebelum melakukan operasi lain yang mungkin bergantung pada request stream.
    // Untuk PUT/POST dengan body JSON, ini adalah praktik yang baik.
    let body: ChangePasswordRequestBody;
    try {
      body = await request.json() as ChangePasswordRequestBody;
    } catch (e) {
      console.error("API Change Password: Gagal parse JSON body:", e);
      return NextResponse.json({ message: 'Format request body tidak valid atau body kosong, pastikan mengirim JSON.' }, { status: 400 });
    }

    const authenticatedUser = verifyAuth(request); // verifyAuth menggunakan objek request asli
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan.' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;

    const { currentPassword, newPassword, confirmNewPassword } = body;

    // 1. Validasi input
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return NextResponse.json({ message: 'Password lama, password baru, dan konfirmasi password baru dibutuhkan.' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ message: 'Password baru minimal harus 6 karakter.' }, { status: 400 });
    }
    if (newPassword !== confirmNewPassword) {
      return NextResponse.json({ message: 'Password baru dan konfirmasi password baru tidak cocok.' }, { status: 400 });
    }
    if (currentPassword === newPassword) {
      return NextResponse.json({ message: 'Password baru tidak boleh sama dengan password lama.' }, { status: 400 });
    }

    const db = getDbConnection();

    // 2. Ambil hash password pengguna saat ini dari database
    const userStmt = db.prepare('SELECT password_hash FROM users WHERE id = ?');
    const user = userStmt.get(loggedInUserId) as { password_hash: string } | undefined;

    if (!user) {
      // Ini seharusnya tidak terjadi jika token valid dan user ada
      console.error(`API Change Password: Pengguna dengan ID ${loggedInUserId} tidak ditemukan di DB meskipun token valid.`);
      return NextResponse.json({ message: 'Pengguna tidak ditemukan.' }, { status: 404 });
    }

    // 3. Verifikasi password lama
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return NextResponse.json({ message: 'Password lama yang Anda masukkan salah.' }, { status: 401 }); // Unauthorized
    }

    // 4. Hash password baru
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // 5. Update password_hash di database
    const updateStmt = db.prepare(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );
    const info = updateStmt.run(newPasswordHash, loggedInUserId);

    if (info.changes > 0) {
      console.log(`Password untuk user ID ${loggedInUserId} berhasil diubah.`);
      // Pertimbangkan untuk invalidasi sesi/token JWT lama di sini jika diperlukan,
      // meskipun untuk ganti password, token yang ada mungkin masih valid sampai kedaluwarsa.
      // Untuk keamanan lebih, Anda bisa meminta pengguna login ulang.
      return NextResponse.json({ message: 'Password berhasil diubah.' }, { status: 200 });
    } else {
      console.error(`API Change Password: Gagal update password di DB untuk user ID ${loggedInUserId}. Info:`, info);
      return NextResponse.json({ message: 'Gagal mengubah password di database.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error pada API ganti password:', error);
    if (error.name === 'SyntaxError' && error.message.toLowerCase().includes('json')) {
        return NextResponse.json({ message: 'Format request body tidak valid.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal memproses perubahan password.', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}
