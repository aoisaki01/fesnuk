// src/app/api/users/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises'; // Untuk operasi file system
import path from 'path';   // Untuk manipulasi path
import { v4 as uuidv4 } from 'uuid'; // Untuk nama file unik (pastikan sudah diinstal)

// Matikan bodyParser bawaan Next.js agar formData bisa bekerja
export const config = {
  api: {
    bodyParser: false,
  },
};

// Tipe data (interface UserSafeDataForRegister bisa digunakan kembali)
interface UserSafeDataForRegister {
  id: number;
  username: string;
  email: string;
  fullName: string | null;
  profilePictureUrl: string | null; // Ini akan diisi dengan URL file yang diupload
  bio: string | null;
  createdAt: string;
}

// Handler untuk GET request - Mengambil semua pengguna (tetap sama)
export async function GET(request: NextRequest) { /* ... kode GET Anda ... */ }

// Handler untuk POST request - Membuat pengguna baru DENGAN UPLOAD FOTO PROFIL
export async function POST(request: NextRequest) {
  try {
    const data = await request.formData(); // Menggunakan formData bawaan Next.js

    const username = data.get('username') as string | null;
    const email = data.get('email') as string | null;
    const password = data.get('password') as string | null;
    const fullName = data.get('fullName') as string | null; // Bisa string kosong dari form
    const bio = data.get('bio') as string | null;         // Bisa string kosong dari form
    const profilePictureFile = data.get('profilePictureFile') as File | null; // Nama field dari frontend

    // Validasi input dasar
    if (!username || !email || !password) {
      return NextResponse.json({ message: 'Username, email, dan password dibutuhkan.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ message: 'Password minimal harus 6 karakter.' }, { status: 400 });
    }
    // highlight-start
    // Validasi foto profil WAJIB diunggah
    if (!profilePictureFile) {
      return NextResponse.json({ message: 'Foto profil wajib diunggah.' }, { status: 400 });
    }
    if (!profilePictureFile.type.startsWith('image/')) {
        return NextResponse.json({ message: 'Tipe file foto profil tidak valid. Harap unggah file gambar.' }, { status: 400 });
    }
    // Anda bisa menambahkan validasi ukuran file di sini
    // if (profilePictureFile.size > 2 * 1024 * 1024) { // Contoh: maks 2MB
    //   return NextResponse.json({ message: 'Ukuran foto profil maksimal 2MB.' }, { status: 400 });
    // }
    // highlight-end

    const db = getDbConnection();

    const existingUserStmt = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)');
    const existingUser = existingUserStmt.get(username, email); // Username & email sudah pasti string karena validasi di atas

    if (existingUser) {
      return NextResponse.json({ message: 'email sudah digunakan.' }, { status: 409 });
    }

    // Proses upload foto profil
    // highlight-start
    let profilePictureUrlDb: string | null = null;
    if (profilePictureFile) {
      const fileBuffer = Buffer.from(await profilePictureFile.arrayBuffer());
      const fileExtension = path.extname(profilePictureFile.name);
      const uniqueFilename = `${uuidv4()}${fileExtension}`;
      
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
      const filePath = path.join(uploadDir, uniqueFilename);

      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(filePath, fileBuffer);

      profilePictureUrlDb = `/uploads/avatars/${uniqueFilename}`; // Path publik
      console.log(`Foto profil ${profilePictureFile.name} diunggah ke ${profilePictureUrlDb}`);
    }
    // highlight-end

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const finalFullName = fullName && fullName.trim() !== '' ? fullName.trim() : null;
    const finalBio = bio && bio.trim() !== '' ? bio.trim() : null;

    const insertStmt = db.prepare(
      'INSERT INTO users (username, email, password_hash, full_name, profile_picture_url, bio) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = insertStmt.run(
        username, 
        email, 
        passwordHash, 
        finalFullName, 
        profilePictureUrlDb, // Gunakan URL dari file yang diupload
        finalBio
    );

    if (info.changes > 0 && info.lastInsertRowid) {
      const newUserId = info.lastInsertRowid as number;
      const newUserStmt = db.prepare(`
        SELECT id, username, email, 
               COALESCE(full_name, NULL) as fullName, 
               profile_picture_url as profilePictureUrl, 
               COALESCE(bio, NULL) as bio, 
               created_at AS createdAt 
        FROM users WHERE id = ?
      `);
      const newUser = newUserStmt.get(newUserId) as UserSafeDataForRegister | undefined;
      
      return NextResponse.json({ message: 'Pengguna berhasil dibuat', user: newUser }, { status: 201 });
    } else {
      // Jika gagal simpan ke DB tapi file sudah terupload, idealnya file dihapus.
      if (profilePictureUrlDb) {
        try {
            const fullPathToDelete = path.join(process.cwd(), 'public', profilePictureUrlDb);
            await fs.unlink(fullPathToDelete);
            console.log(`File avatar ${profilePictureUrlDb} dihapus karena gagal simpan user ke DB.`);
        } catch (cleanupError) {
            console.error(`Gagal menghapus file avatar ${profilePictureUrlDb} setelah error DB:`, cleanupError);
        }
      }
      return NextResponse.json({ message: 'Gagal membuat pengguna di database.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Registration API error (with file upload):', error);
    if (error.message?.includes("Unexpected end of JSON input") || error.name === "SyntaxError" || error.message?.includes("JSON at position")) {
        // Ini seharusnya tidak terjadi jika kita menggunakan request.formData(), tapi sebagai jaga-jaga
        return NextResponse.json({ message: 'Format request tidak valid.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal membuat pengguna', error: error.message }, { status: 500 });
  }
}