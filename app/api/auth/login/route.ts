// src/app/api/auth/login/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ke db.ts benar
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';

interface LoginRequestBody {
  emailOrUsername?: string;
  password?: string;
}

// Tipe data untuk pengguna yang akan dikirim kembali (aman, tanpa password hash)
interface UserSafeData {
  id: number;
  username: string;
  email: string;
  fullName?: string | null;
  profilePictureUrl?: string | null;
  bio?: string | null;
  createdAt: string; // Biasanya string ISO dari DATETIME
  updatedAt: string;
}

// SANGAT PENTING: Simpan secret ini di environment variable (.env) di aplikasi produksi!
// Jangan pernah hardcode secret di kode produksi.
const JWT_SECRET: string = process.env.JWT_SECRET || 'your-very-strong-secret-key-for-development-sosmed';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '1d'; // Token berlaku selama 1 hari, bisa disesuaikan

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as LoginRequestBody;
    const { emailOrUsername, password } = body;

    // 1. Validasi input
    if (!emailOrUsername || !password) {
      return NextResponse.json({ message: 'Email/username dan password dibutuhkan' }, { status: 400 });
    }

    const db = getDbConnection();

    // 2. Cari pengguna berdasarkan email atau username
    const stmt = db.prepare(`
      SELECT id, username, email, password_hash AS passwordHash,
             COALESCE(full_name, NULL) as fullName,
             COALESCE(profile_picture_url, NULL) as profilePictureUrl,
             COALESCE(bio, NULL) as bio,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM users
      WHERE email = ? OR username = ?
    `);
    // @ts-ignore - better-sqlite3 mungkin tidak secara otomatis mengetik hasil get() dengan baik
    const user = stmt.get(emailOrUsername, emailOrUsername) as (UserSafeData & { passwordHash: string }) | undefined;

    if (!user) {
      console.log(`Login attempt failed: User not found for ${emailOrUsername}`);
      return NextResponse.json({ message: 'Kredensial tidak valid: Pengguna tidak ditemukan' }, { status: 401 }); // Unauthorized
    }

    // 3. Bandingkan password yang diberikan dengan hash password di database
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      console.log(`Login attempt failed: Invalid password for user ${user.username}`);
      return NextResponse.json({ message: 'Kredensial tidak valid: Password salah' }, { status: 401 }); // Unauthorized
    }

    // 4. Jika login berhasil, siapkan data pengguna yang aman dan buat token JWT
    const { passwordHash, ...userSafeData } = user; // Hapus passwordHash dari objek user

    const tokenPayload = {
      userId: userSafeData.id,
      username: userSafeData.username,
      email: userSafeData.email,
      // Anda bisa menambahkan role atau data non-sensitif lain di sini jika perlu
    };

    const signOptions: SignOptions = { expiresIn: JWT_EXPIRES_IN as any };
    const token = jwt.sign(tokenPayload, JWT_SECRET, signOptions);

    console.log(`User ${user.username} logged in successfully.`);
    return NextResponse.json({
      message: 'Login berhasil',
      user: userSafeData,
      token: token,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Login API error:', error);
    // Tangani error spesifik JWT jika ada
    if (error instanceof jwt.JsonWebTokenError) {
        return NextResponse.json({ message: 'Gagal memproses sesi login', error: error.message }, { status: 500 });
    }
    if (error.message.includes("Unexpected end of JSON input") || error.name === "SyntaxError") {
        return NextResponse.json({ message: 'Format request body tidak valid, pastikan mengirim JSON.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Terjadi kesalahan pada server saat proses login', error: error.message }, { status: 500 });
  }
}