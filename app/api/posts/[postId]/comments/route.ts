// src/app/api/posts/[postId]/comments/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils';
import sqlite3 from 'better-sqlite3'; // Pastikan ini diimpor jika digunakan untuk tipe

interface RouteParams {
  postId: string;
}

interface CreateCommentRequestBody {
  content?: string;
  parentCommentId?: number;
}

// Tipe data untuk komentar yang dikembalikan (termasuk info penulis)
interface CommentWithAuthor {
  id: number;
  post_id: number;
  user_id: number;
  parent_comment_id: number | null;
  content: string;
  created_at: string;
  updated_at: string;
  author_username: string;
  author_profile_picture_url: string | null;
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
        // Mencegah notifikasi ke diri sendiri untuk tipe tertentu
        if (type.startsWith('MENTION_') || type === 'REPLY_TO_COMMENT' || type === 'NEW_COMMENT' || type === 'POST_LIKED') {
            if (recipientUserId === actorUserId) {
                console.log(`Notifikasi tidak dibuat: Aksi oleh pengguna sendiri (Recipient: ${recipientUserId}, Actor: ${actorUserId}, Type: ${type})`);
                return;
            }
        }
        const stmt = db.prepare(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, type, target_entity_type, target_entity_id, message)
        VALUES (?, ?, ?, ?, ?, ?)`
        );
        stmt.run(recipientUserId, actorUserId, type, targetEntityType, targetEntityId, message);
        console.log(`Notifikasi (tipe: ${type}) dibuat: To=${recipientUserId}, Actor=${actorUserId}, Target=${targetEntityType}:${targetEntityId}`);
    } catch (error) {
        console.error(`Gagal membuat notifikasi (tipe: ${params.type}):`, error);
    }
}

// Fungsi helper untuk cek blokir
function checkBlockStatus(db: sqlite3.Database, userId1: number, userId2: number): boolean {
  const blockCheckStmt = db.prepare(`
    SELECT id FROM user_blocks
    WHERE (blocker_id = ? AND blocked_user_id = ?) OR (blocker_id = ? AND blocked_user_id = ?)
  `);
  const block = blockCheckStmt.get(userId1, userId2, userId2, userId1);
  return !!block;
}

// Fungsi helper untuk mendapatkan ID pengguna yang di-mention dalam komentar
async function getMentionedUserIdsInComment(db: sqlite3.Database, content: string | null, excludeUserId?: number | null): Promise<number[]> {
  if (!content || content.trim() === '') return [];
  const mentionRegex = /@(\w+)/g;
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
  return [...new Set(userIds)];
}

// Handler untuk POST request - Menambahkan komentar baru
export async function POST(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { postId } = await context.params;

  try {
    const body = await request.json() as CreateCommentRequestBody;
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan.' }, { status: 401 });
    }
    const commenterId = authenticatedUser.userId;
    const commenterUsername = authenticatedUser.username;
    
    const postIdString = postId;
    const postIdNum = parseInt(postIdString, 10);
    if (isNaN(postIdNum)) {
      return NextResponse.json({ message: 'Post ID tidak valid.' }, { status: 400 });
    }

    const { content, parentCommentId } = body;
    const commentContent = content ? content.trim() : '';

    if (commentContent === '') {
      return NextResponse.json({ message: 'Konten komentar tidak boleh kosong.' }, { status: 400 });
    }

    const db = getDbConnection();

    const postStmt = db.prepare('SELECT id, user_id as authorId, visibility_status FROM posts WHERE id = ?');
    const post = postStmt.get(postIdNum) as { id: number; authorId: number; visibility_status: string } | undefined;

    if (!post) return NextResponse.json({ message: 'Postingan tidak ditemukan.' }, { status: 404 });
    if (post.visibility_status !== 'VISIBLE') return NextResponse.json({ message: 'Tidak dapat berkomentar pada postingan ini.'}, {status: 403});
    
    const authorId = post.authorId; // ID pemilik postingan
    if (commenterId !== authorId && checkBlockStatus(db, commenterId, authorId)) {
        return NextResponse.json({ message: 'Tidak dapat berkomentar karena status blokir.' }, { status: 403 });
    }
    
    let parentCommentAuthorId: number | null = null;
    if (parentCommentId) {
      const parentCommentStmt = db.prepare('SELECT id, post_id, user_id FROM comments WHERE id = ?');
      const parentComment = parentCommentStmt.get(parentCommentId) as {id: number, post_id: number, user_id: number} | undefined;
      if (!parentComment) return NextResponse.json({ message: 'Komentar induk tidak ditemukan.' }, { status: 404 });
      if (parentComment.post_id !== postIdNum) return NextResponse.json({ message: 'Komentar induk tidak valid untuk postingan ini.' }, { status: 400 });
      parentCommentAuthorId = parentComment.user_id;
    }

    const insertCommentStmt = db.prepare(
      'INSERT INTO comments (user_id, post_id, parent_comment_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
    );
    const info = insertCommentStmt.run(commenterId, postIdNum, parentCommentId || null, commentContent);

    if (info.changes > 0 && info.lastInsertRowid) {
      const newCommentId = info.lastInsertRowid as number;
      const newCommentFetchStmt = db.prepare<[number], CommentWithAuthor>(`
        SELECT c.id, c.post_id, c.user_id, c.parent_comment_id, c.content, c.created_at, c.updated_at,
               u.username as author_username, u.profile_picture_url as author_profile_picture_url
        FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?`);
      const newComment = newCommentFetchStmt.get(newCommentId);

      // Notifikasi untuk pemilik postingan
      if (authorId !== commenterId) { // Tidak notifikasi jika komentar di post sendiri
        await createNotification(db, {
          recipientUserId: authorId, actorUserId: commenterId, type: 'NEW_COMMENT',
          targetEntityType: 'POST', targetEntityId: postIdNum,
          message: `${commenterUsername || 'Seseorang'} mengomentari postingan Anda.`
        });
      }

      // Notifikasi untuk pemilik komentar yang dibalas
      if (parentCommentId && parentCommentAuthorId && parentCommentAuthorId !== commenterId && parentCommentAuthorId !== authorId) {
        await createNotification(db, {
            recipientUserId: parentCommentAuthorId, actorUserId: commenterId, type: 'REPLY_TO_COMMENT',
            targetEntityType: 'POST', targetEntityId: postIdNum,
            message: `${commenterUsername || 'Seseorang'} membalas komentar Anda.`
        });
      }
      
      // Notifikasi untuk pengguna yang di-mention
      const mentionedUserIds = await getMentionedUserIdsInComment(db, commentContent, commenterId);
      for (const mentionedUserId of mentionedUserIds) {
        if (mentionedUserId !== authorId && mentionedUserId !== parentCommentAuthorId) { 
          await createNotification(db, {
            recipientUserId: mentionedUserId, actorUserId: commenterId, type: 'MENTION_IN_COMMENT',
            targetEntityType: 'POST', targetEntityId: postIdNum,
            message: `${commenterUsername || 'Seseorang'} menyebut Anda dalam sebuah komentar.`
          });
        }
      }

      return NextResponse.json({ message: 'Komentar berhasil ditambahkan', comment: newComment }, { status: 201 });
    } else {
      console.error("API Add Comment: Gagal insert komentar ke DB. Info:", info);
      return NextResponse.json({ message: 'Gagal menambahkan komentar ke database.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`Gagal menambahkan komentar untuk postId ${postId}:`, error);
    return NextResponse.json({ message: 'Gagal memproses penambahan komentar.', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}

// GET handler untuk mengambil komentar
export async function GET(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const { postId } = await context.params;
  try {
    await request.text();
    const authenticatedUser = verifyAuth(request);
    const currentUserId = authenticatedUser ? authenticatedUser.userId : null;

    if (!postId) return NextResponse.json({ message: 'Post ID tidak ada.' }, { status: 400 });
    const postIdNum = parseInt(postId, 10);
    if (isNaN(postIdNum)) return NextResponse.json({ message: 'Post ID tidak valid.' }, { status: 400 });

    const db = getDbConnection();
    const postExistsStmt = db.prepare('SELECT id, user_id as authorId, visibility_status FROM posts WHERE id = ?');
    const post = postExistsStmt.get(postIdNum) as {id: number, authorId: number, visibility_status: string} | undefined;
    if (!post) return NextResponse.json({ message: 'Postingan tidak ditemukan.' }, { status: 404 });
    
    if (post.visibility_status !== 'VISIBLE') {
      if (!currentUserId || currentUserId !== post.authorId) {
        return NextResponse.json({ message: 'Komentar untuk postingan ini tidak dapat ditampilkan.' }, { status: 403 });
      }
    }

    let commentsQuery = `
      SELECT c.id, c.post_id, c.user_id, c.parent_comment_id, c.content, c.created_at, c.updated_at,
             u.username as author_username, COALESCE(u.profile_picture_url, '') as author_profile_picture_url
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ? `;
    const queryParams: any[] = [postIdNum];

    if (currentUserId) {
      commentsQuery += `
            AND c.user_id NOT IN (SELECT blocked_user_id FROM user_blocks WHERE blocker_id = ?)
            AND c.user_id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_user_id = ?) `;
      queryParams.push(currentUserId, currentUserId);
    }
    commentsQuery += ` ORDER BY c.created_at ASC`;

    const commentsStmt = db.prepare(commentsQuery);
    const comments = commentsStmt.all(...queryParams) as CommentWithAuthor[];

    return NextResponse.json(comments, { status: 200 });
  } catch (error: any) {
    console.error(`Gagal mengambil komentar untuk postId ${postId}:`, error);
    if (error.code === 'SQLITE_ERROR' && error.message.includes('no such column')) {
      console.error("DATABASE SCHEMA ERROR: Kolom yang dibutuhkan tidak ada. Harap perbarui skema database Anda.");
      return NextResponse.json({ message: 'Kesalahan database: Skema tabel tidak lengkap.', internalErrorCode: 'DB_SCHEMA_MISSING_COL' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Gagal mengambil komentar.', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}
