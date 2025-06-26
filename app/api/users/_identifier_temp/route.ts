// src/app/api/users/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Sesuaikan path jika lib Anda ada di luar src
import bcrypt from 'bcryptjs';

// Tipe data untuk request body saat membuat user baru
interface CreateUserRequestBody {
  username?: string;
  email?: string;
  password?: string;
  fullName?: string | null; // Diperbarui agar bisa null
  profilePictureUrl?: string | null; // Diperbarui agar bisa null
  bio?: string | null; // Diperbarui agar bisa null
}

// Tipe data untuk pengguna yang dikembalikan (aman, tanpa password hash)
interface UserSafeDataForRegister {
  id: number;
  username: string;
  email: string;
  fullName: string | null;
  profilePictureUrl: string | null;
  bio: string | null;
  createdAt: string;
}

// Handler untuk GET request - Mengambil semua pengguna (opsional, bisa dihapus jika tidak perlu)
export async function GET(request: NextRequest) {
  try {
    const db = getDbConnection();
    // Ambil semua pengguna, tapi jangan sertakan password_hash
    const stmt = db.prepare(`
      SELECT id, username, email, 
             COALESCE(full_name, NULL) as fullName, 
             COALESCE(profile_picture_url, NULL) as profilePictureUrl, 
             COALESCE(bio, NULL) as bio, 
             created_at AS createdAt, 
             updated_at AS updatedAt 
      FROM users
    `);
    const users = stmt.all();

    return NextResponse.json(users, { status: 200 });
  } catch (error: any) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ message: 'Gagal mengambil data pengguna', error: error.message }, { status: 500 });
  }
}

// Handler untuk POST request - Membuat pengguna baru (Registrasi)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreateUserRequestBody;
    const { username, email, password, fullName = null, profilePictureUrl = null, bio = null } = body;

    // Validasi input dasar
    if (!username || !email || !password) {
      return NextResponse.json({ message: 'Username, email, dan password dibutuhkan' }, { status: 400 });
    }
    if (password.length < 6) { // Contoh validasi panjang password
        return NextResponse.json({ message: 'Password minimal harus 6 karakter' }, { status: 400 });
    }

    const db = getDbConnection();

    // Cek apakah username atau email sudah ada
    const existingUserStmt = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    // @ts-ignore
    const existingUser = existingUserStmt.get(username, email);

    if (existingUser) {
      console.log(`Registration attempt failed: Username or email already exists for ${username}/${email}`);
      return NextResponse.json({ message: 'Username atau email sudah digunakan' }, { status: 409 }); // 409 Conflict
    }

    // Hash password sebelum disimpan
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Simpan pengguna baru ke database
    const insertStmt = db.prepare(
      'INSERT INTO users (username, email, password_hash, full_name, profile_picture_url, bio) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = insertStmt.run(username, email, passwordHash, fullName, profilePictureUrl, bio);

    if (info.changes > 0 && info.lastInsertRowid) {
      const newUserId = info.lastInsertRowid as number;
      // Mengambil data pengguna yang baru saja dibuat (tanpa password_hash)
      const newUserStmt = db.prepare(`
        SELECT id, username, email, 
               COALESCE(full_name, NULL) as fullName, 
               COALESCE(profile_picture_url, NULL) as profilePictureUrl, 
               COALESCE(bio, NULL) as bio, 
               created_at AS createdAt 
        FROM users WHERE id = ?
      `);
      // @ts-ignore
      const newUser = newUserStmt.get(newUserId) as UserSafeDataForRegister | undefined;
      
      console.log(`User ${username} registered successfully with ID ${newUserId}.`);
      return NextResponse.json({ message: 'Pengguna berhasil dibuat', user: newUser }, { status: 201 });
    } else {
      console.error('Failed to insert new user into database, no changes or lastInsertRowid missing.');
      return NextResponse.json({ message: 'Gagal membuat pengguna, tidak ada baris yang ditambahkan' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Registration API error:', error);
    if (error.message.includes('UNIQUE constraint failed')) { // Error spesifik dari SQLite
        return NextResponse.json({ message: 'Username atau email sudah ada (Constraint).', error: error.message }, { status: 409 });
    }
    if (error.message.includes("Unexpected end of JSON input") || error.name === "SyntaxError") {
        return NextResponse.json({ message: 'Format request body tidak valid, pastikan mengirim JSON.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal membuat pengguna', error: error.message }, { status: 500 });
  }
}