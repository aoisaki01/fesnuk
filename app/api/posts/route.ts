// src/app/api/posts/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sqlite3 from 'better-sqlite3'; // Impor tipe Database

// Matikan bodyParser bawaan Next.js agar request.formData() bisa bekerja
export const config = {
  api: {
    bodyParser: false,
  },
};

// Tipe data untuk Post yang dikembalikan
interface PostData {
  id: number;
  user_id: number;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  is_live?: boolean;
  live_status?: string | null;
  stream_playback_url?: string | null;
  visibility_status?: string | null;
  author_username?: string;
  author_profile_picture_url?: string | null;
  like_count?: number;
  comment_count?: number;
  is_liked_by_me?: boolean;
}

// Fungsi helper untuk membuat notifikasi
async function createNotification(db: sqlite3.Database, params: {
  recipientUserId: number;
  actorUserId?: number | null;
  type: string;
  targetEntityType?: string | null;
  targetEntityId?: number | null;
  message?: string | null;
}) {
    try {
        const { recipientUserId, actorUserId = null, type, targetEntityType = null, targetEntityId = null, message = null } = params;
        const stmt = db.prepare(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, type, target_entity_type, target_entity_id, message)
        VALUES (?, ?, ?, ?, ?, ?)`
        );
        stmt.run(recipientUserId, actorUserId, type, targetEntityType, targetEntityId, message);
        console.log(`Notifikasi (MENTION/POST) dibuat: To=${recipientUserId}, Type=${type}, Actor=${actorUserId}, Target=${targetEntityType}:${targetEntityId}`);
    } catch (error) {
        console.error('Gagal membuat notifikasi (MENTION/POST):', error);
    }
}

// Fungsi helper untuk mendapatkan ID pengguna yang di-mention dalam postingan
async function getMentionedUserIdsInPost(db: sqlite3.Database, content: string | null, excludeUserId?: number | null): Promise<number[]> {
  if (!content || content.trim() === '') return [];
  
  const mentionRegex = /@(\w+)/g; // \w+ = alphanumeric dan underscore
  const mentionedUsernames = new Set<string>();
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentionedUsernames.add(match[1].toLowerCase());
  }

  if (mentionedUsernames.size === 0) return [];

  const userIds: number[] = [];
  for (const username of mentionedUsernames) {
    const userStmt = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?');
    const user = userStmt.get(username) as { id: number } | undefined;
    if (user && (excludeUserId ? user.id !== excludeUserId : true)) {
      userIds.push(user.id);
    }
  }
  return [...new Set(userIds)]; // Pastikan ID unik
}


// Handler untuk POST request - Membuat postingan baru DENGAN UPLOAD GAMBAR/VIDEO dan NOTIFIKASI MENTION
export async function POST(request: NextRequest) {
  try {
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Token tidak valid atau tidak ada' }, { status: 401 });
    }
    const userId = authenticatedUser.userId;
    const usernameActor = authenticatedUser.username; 

    const db = getDbConnection(); 

    const userCheckStmt = db.prepare('SELECT id FROM users WHERE id = ?');
    const userExists = userCheckStmt.get(userId) as { id: number } | undefined;

    if (!userExists) {
        console.error(`API /api/posts: Pengguna dengan ID ${userId} (dari token) tidak ditemukan di tabel users.`);
        return NextResponse.json({ message: 'Error: Pengguna terkait tidak valid atau sesi tidak sinkron.' }, { status: 400 });
    }

    const data = await request.formData();

    const content = data.get('content') as string | null;
    const mediaFile = data.get('mediaFile') as File | null;

    if ((!content || content.trim() === '') && !mediaFile) {
      return NextResponse.json({ message: 'Konten postingan atau file media tidak boleh kosong.' }, { status: 400 });
    }
    if (mediaFile === null && (!content || content.trim() === '')) {
        return NextResponse.json({ message: 'Konten postingan tidak boleh kosong jika tidak ada media yang diunggah.' }, { status: 400 });
    }

    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let savedMediaUrl: string | null = null;

    if (mediaFile) {
      const isImage = mediaFile.type.startsWith('image/');
      const isVideo = mediaFile.type.startsWith('video/');
      if (!isImage && !isVideo) {
        return NextResponse.json({ message: 'Tipe file tidak didukung. Harap unggah file gambar atau video.' }, { status: 400 });
      }
      const fileBuffer = Buffer.from(await mediaFile.arrayBuffer());
      const fileExtension = path.extname(mediaFile.name);
      const uniqueFilename = `${uuidv4()}${fileExtension}`;
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'posts');
      const filePath = path.join(uploadDir, uniqueFilename);
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(filePath, fileBuffer);
      savedMediaUrl = `/uploads/posts/${uniqueFilename}`;
      if (isImage) imageUrl = savedMediaUrl;
      else if (isVideo) videoUrl = savedMediaUrl;
    }
    
    const postContent = content ? content.trim() : '';
    
    // Pastikan visibility_status ada di tabel posts Anda
     const insertStmt = db.prepare(
      "INSERT INTO posts (user_id, content, image_url, video_url, created_at, updated_at, visibility_status) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'VISIBLE')" // Perhatikan 'VISIBLE' dengan kutip tunggal
    );
    const info = insertStmt.run(userId, postContent, imageUrl, videoUrl);

    if (info.changes > 0 && info.lastInsertRowid) {
      const newPostId = info.lastInsertRowid as number;
      const newPostStmt = db.prepare<[number], PostData>(`
        SELECT p.id, p.user_id, p.content, p.image_url, p.video_url, p.created_at, p.updated_at,
               p.is_live, p.live_status, p.stream_playback_url, p.visibility_status,
               u.username as author_username, u.profile_picture_url as author_profile_picture_url
        FROM posts p JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `);
      const newPost = newPostStmt.get(newPostId);

      // --- PROSES MENTIONS DAN KIRIM NOTIFIKASI ---
      if (postContent) { 
        const mentionedUserIds = await getMentionedUserIdsInPost(db, postContent, userId);
        for (const mentionedUserId of mentionedUserIds) {
          if (mentionedUserId !== userId) { 
            await createNotification(db, {
              recipientUserId: mentionedUserId,
              actorUserId: userId,
              type: 'MENTION_IN_POST',
              targetEntityType: 'POST',
              targetEntityId: newPostId,
              message: `${usernameActor || 'Seseorang'} menyebut Anda dalam sebuah postingan.`
            });
          }
        }
      }
      // --- AKHIR PROSES MENTIONS ---

      return NextResponse.json({ message: 'Postingan berhasil dibuat', post: newPost }, { status: 201 });
    } else {
      if (savedMediaUrl) {
        try {
            const fullPathToDelete = path.join(process.cwd(), 'public', savedMediaUrl);
            await fs.unlink(fullPathToDelete);
            console.log(`File ${savedMediaUrl} dihapus karena gagal simpan post ke DB.`);
        } catch (cleanupError) {
            console.error(`Gagal menghapus file ${savedMediaUrl} setelah error DB:`, cleanupError);
        }
      }
      console.error("API /api/posts: Gagal insert postingan ke DB. Info:", info);
      return NextResponse.json({ message: 'Gagal menyimpan postingan ke database' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error saat membuat postingan dengan upload:', error);
    if (error.name === 'SyntaxError' && error.message.toLowerCase().includes('json')) {
        return NextResponse.json({ message: 'Format request body tidak valid atau body kosong, pastikan mengirim JSON.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal membuat postingan', error: error.message }, { status: 500 });
  }
}


// GET Handler (untuk mengambil semua postingan)
export async function GET(request: NextRequest) {
  try {
    await request.text(); 

    const db = getDbConnection();
    const loggedInUser = verifyAuth(request);
    const loggedInUserId = loggedInUser ? loggedInUser.userId : null;
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    let postsQuery = `
      SELECT
        p.id, p.content, p.image_url, p.video_url, p.created_at, p.updated_at,
        p.is_live, p.live_status, p.stream_playback_url, 
        p.visibility_status,
        u.id as author_id, u.username as author_username,
        COALESCE(u.full_name, '') as author_full_name,
        u.profile_picture_url as author_profile_picture_url,
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
        ${loggedInUserId ? ", EXISTS(SELECT 1 FROM likes l_me WHERE l_me.post_id = p.id AND l_me.user_id = ?)" : ", FALSE"} as is_liked_by_me
      FROM posts p
      JOIN users u ON p.user_id = u.id
    `;
    const queryParams: any[] = [];
    if (loggedInUserId) {
      queryParams.push(loggedInUserId); 
    }

    let whereClauses: string[] = ["(p.visibility_status IS NULL OR p.visibility_status = 'VISIBLE')"]; 
    if (loggedInUserId) {
      whereClauses.push(`p.user_id NOT IN (SELECT blocked_user_id FROM user_blocks WHERE blocker_id = ?)`);
      queryParams.push(loggedInUserId);
      whereClauses.push(`p.user_id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_user_id = ?)`);
      queryParams.push(loggedInUserId);
    }

    postsQuery += " WHERE " + whereClauses.join(" AND ");
    
    postsQuery += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const postsStmt = db.prepare(postsQuery);
    const posts = postsStmt.all(...queryParams) as PostData[];
    return NextResponse.json(posts, { status: 200 });
  } catch (error: any) {
    console.error('Gagal mengambil semua postingan:', error);
    return NextResponse.json({ message: 'Gagal mengambil semua postingan', error: error.message }, { status: 500 });
  }
}
