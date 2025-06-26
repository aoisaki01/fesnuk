// src/app/api/profile/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/authUtils';
import fs from 'fs/promises'; // Untuk operasi file system
import path from 'path';   // Untuk manipulasi path
import { v4 as uuidv4 } from 'uuid'; // Untuk nama file unik

// Matikan bodyParser bawaan Next.js agar formData bisa bekerja
export const config = {
  api: {
    bodyParser: false,
  },
};

// Tipe data untuk profil pengguna yang dikembalikan (sama seperti GET)
interface UserProfileData {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  profile_picture_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

// GET Handler (dari Canvas #28, tetap sama)
export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;
    const db = getDbConnection();
    const userStmt = db.prepare<[number], UserProfileData>(`
      SELECT id, username, email,
             COALESCE(full_name, NULL) as full_name,
             profile_picture_url,
             COALESCE(bio, NULL) as bio,
             created_at, updated_at
      FROM users WHERE id = ?
    `);
    const userProfile = userStmt.get(loggedInUserId);
    if (!userProfile) return NextResponse.json({ message: 'Pengguna tidak ditemukan' }, { status: 404 });
    return NextResponse.json(userProfile, { status: 200 });
  } catch (error: any) { /* ... error handling ... */ }
}


// Handler untuk PUT request - Memperbarui profil pengguna yang login DENGAN UPLOAD FOTO
export async function PUT(request: NextRequest) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan' }, { status: 401 });
    }
    const loggedInUserId = authenticatedUser.userId;

    const data = await request.formData(); // Menggunakan formData

    const fullName = data.get('fullName') as string | null;
    const bio = data.get('bio') as string | null;
    const profilePictureFile = data.get('profilePictureFile') as File | null; // Nama field dari frontend

    const db = getDbConnection();
    
    // Ambil data user saat ini untuk mendapatkan URL foto lama jika ada penggantian
    const currentUserStmt = db.prepare('SELECT profile_picture_url FROM users WHERE id = ?');
    const currentUserData = currentUserStmt.get(loggedInUserId) as { profile_picture_url: string | null } | undefined;

    const fieldsToUpdate: { [key: string]: string | null } = {};
    const paramsForUpdateQuery: (string | null | number)[] = [];
    let newProfilePictureUrlDb: string | null = null;

    // Proses upload foto profil baru jika ada
    if (profilePictureFile) {
      if (!profilePictureFile.type.startsWith('image/')) {
        return NextResponse.json({ message: 'Tipe file foto profil tidak valid. Harap unggah file gambar.' }, { status: 400 });
      }
      // Tambahkan validasi ukuran jika perlu

      // Hapus foto lama jika ada dan merupakan file lokal (bukan URL eksternal)
      if (currentUserData?.profile_picture_url && currentUserData.profile_picture_url.startsWith('/uploads/avatars/')) {
        try {
          const oldFilePath = path.join(process.cwd(), 'public', currentUserData.profile_picture_url);
          await fs.unlink(oldFilePath);
          console.log(`Foto profil lama ${currentUserData.profile_picture_url} dihapus.`);
        } catch (e: any) {
          // Abaikan jika file tidak ada, mungkin sudah dihapus atau URL tidak valid
          if (e.code !== 'ENOENT') {
            console.error("Gagal menghapus foto profil lama:", e);
          }
        }
      }

      const fileBuffer = Buffer.from(await profilePictureFile.arrayBuffer());
      const fileExtension = path.extname(profilePictureFile.name);
      const uniqueFilename = `${uuidv4()}${fileExtension}`;
      
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
      const filePath = path.join(uploadDir, uniqueFilename);

      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(filePath, fileBuffer);

      newProfilePictureUrlDb = `/uploads/avatars/${uniqueFilename}`;
      fieldsToUpdate.profile_picture_url = newProfilePictureUrlDb;
      console.log(`Foto profil baru diunggah ke ${newProfilePictureUrlDb}`);
    }

    // Tambahkan field lain yang diupdate (jika dikirim dari frontend)
    if (fullName !== null) { // Anggap string kosong berarti ingin mengosongkan nama, null jika tidak diubah
        fieldsToUpdate.full_name = fullName.trim() === '' ? null : fullName.trim();
    }
    if (bio !== null) {
        fieldsToUpdate.bio = bio.trim() === '' ? null : bio.trim();
    }


    if (Object.keys(fieldsToUpdate).length === 0) {
      return NextResponse.json({ message: 'Tidak ada data yang dikirim untuk diperbarui' }, { status: 400 });
    }

    const setClauses = Object.keys(fieldsToUpdate).map(key => `${key} = ?`).join(', ');
    Object.values(fieldsToUpdate).forEach(value => paramsForUpdateQuery.push(value));

    paramsForUpdateQuery.push(loggedInUserId); // Untuk klausa WHERE

    const updateQuery = `UPDATE users SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    const updateStmt = db.prepare(updateQuery);
    const info = updateStmt.run(...paramsForUpdateQuery);

    if (info.changes > 0) {
      const updatedUserStmt = db.prepare<[number], UserProfileData>(`
        SELECT id, username, email, COALESCE(full_name, NULL) as full_name, 
               profile_picture_url, COALESCE(bio, NULL) as bio, created_at, updated_at
        FROM users WHERE id = ?
      `);
      const updatedUserProfile = updatedUserStmt.get(loggedInUserId);
      return NextResponse.json({ message: 'Profil berhasil diperbarui', user: updatedUserProfile }, { status: 200 });
    } else {
      // Jika tidak ada perubahan, mungkin data yang dikirim sama dengan yang sudah ada
      // atau user tidak ditemukan (seharusnya tidak mungkin karena ada authenticatedUser)
      // Kembalikan data user saat ini jika tidak ada perubahan
      const currentUserProfile = db.prepare<[number], UserProfileData>(`SELECT id, username, email, COALESCE(full_name, NULL) as full_name, profile_picture_url, COALESCE(bio, NULL) as bio, created_at, updated_at FROM users WHERE id = ?`).get(loggedInUserId);
      return NextResponse.json({ message: 'Tidak ada data yang diubah atau data sama dengan sebelumnya', user: currentUserProfile }, { status: 200 });
    }

  } catch (error: any) {
    console.error('Gagal memperbarui profil:', error);
    return NextResponse.json({ message: 'Gagal memperbarui profil', error: error.message }, { status: 500 });
  }
}