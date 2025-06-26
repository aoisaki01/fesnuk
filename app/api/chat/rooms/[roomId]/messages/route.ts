// src/app/api/chat/rooms/[roomId]/messages/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db'; // Pastikan path ini benar
import { verifyAuth, AuthenticatedUserPayload } from '@/lib/authUtils'; // Pastikan path ini benar
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Matikan bodyParser bawaan Next.js agar request.formData() bisa bekerja
export const config = {
  api: {
    bodyParser: false,
  },
};

interface RouteParams {
  roomId: string;
}

// Tipe data untuk pesan chat yang dikembalikan
interface ChatMessageData {
  id: number;
  chat_room_id: number;
  sender_id: number;
  message_content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
  sender_username?: string;
  sender_profile_picture_url?: string | null;
}

// Fungsi helper untuk membuat notifikasi (pastikan definisi atau impornya ada)
async function createNotification(db: ReturnType<typeof getDbConnection>, params: { 
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
        console.log(`Notifikasi (NEW_CHAT_MESSAGE) dibuat: To=${recipientUserId}, Type=${type}, Actor=${actorUserId}, Target=${targetEntityType}:${targetEntityId}`);
    } catch (error) {
        console.error('Gagal membuat notifikasi (NEW_CHAT_MESSAGE):', error);
    }
}

// Handler untuk POST request - Mengirim pesan baru DENGAN ATTACHMENT
export async function POST(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const data = await request.formData(); 

    if (!params || !params.roomId) {
        console.error("API Send Message: roomId tidak ditemukan di parameter rute.");
        return NextResponse.json({ message: 'Room ID tidak ditemukan di parameter rute.' }, { status: 400 });
    }
    const roomIdString = params.roomId;

    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan.' }, { status: 401 });
    }
    const senderId = authenticatedUser.userId;
    const senderUsername = authenticatedUser.username; // Untuk pesan notifikasi

    const chatRoomId = parseInt(roomIdString, 10);
    if (isNaN(chatRoomId)) {
      return NextResponse.json({ message: 'Room ID tidak valid (bukan angka).' }, { status: 400 });
    }

    const messageContentRaw = data.get('messageContent') as string | null;
    const attachmentFile = data.get('attachmentFile') as File | null;
    const messageContent = messageContentRaw ? messageContentRaw.trim() : null;

    if (!messageContent && !attachmentFile) {
      return NextResponse.json({ message: 'Pesan atau lampiran tidak boleh kosong.' }, { status: 400 });
    }

    const db = getDbConnection();

    const roomCheckStmt = db.prepare(
      'SELECT id, user1_id, user2_id FROM chat_rooms WHERE id = ? AND (user1_id = ? OR user2_id = ?)'
    );
    const room = roomCheckStmt.get(chatRoomId, senderId, senderId) as { id: number; user1_id: number; user2_id: number } | undefined;

    if (!room) {
      return NextResponse.json({ message: 'Ruang chat tidak ditemukan atau Anda tidak memiliki akses ke ruang ini.' }, { status: 403 });
    }

    let attachmentUrlDb: string | null = null;
    let attachmentTypeDb: string | null = null;
    let savedAttachmentPath: string | null = null;

    if (attachmentFile) {
      // ... (logika upload file sama seperti di Canvas #138) ...
      const isImage = attachmentFile.type.startsWith('image/');
      const isVideo = attachmentFile.type.startsWith('video/');
      if (!isImage && !isVideo) {
        return NextResponse.json({ message: 'Tipe file lampiran tidak didukung (hanya gambar/video untuk saat ini).' }, { status: 400 });
      }
      const fileBuffer = Buffer.from(await attachmentFile.arrayBuffer());
      const fileExtension = path.extname(attachmentFile.name);
      const uniqueFilename = `${uuidv4()}${fileExtension}`;
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'chat_attachments', roomIdString);
      const filePath = path.join(uploadDir, uniqueFilename);
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(filePath, fileBuffer);
      savedAttachmentPath = filePath;
      attachmentUrlDb = `/uploads/chat_attachments/${roomIdString}/${uniqueFilename}`;
      attachmentTypeDb = isImage ? 'image' : 'video';
    }

    const insertMsgStmt = db.prepare(
      `INSERT INTO chat_messages (chat_room_id, sender_id, message_content, attachment_url, attachment_type, created_at) 
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    );
    const info = insertMsgStmt.run(chatRoomId, senderId, messageContent, attachmentUrlDb, attachmentTypeDb);

    if (info.changes > 0 && info.lastInsertRowid) {
      const newMessageId = info.lastInsertRowid as number;
      const newMessageStmt = db.prepare<[number], ChatMessageData>(`
        SELECT cm.*, u.username as sender_username, u.profile_picture_url as sender_profile_picture_url
        FROM chat_messages cm JOIN users u ON cm.sender_id = u.id WHERE cm.id = ?`);
      const newMessage = newMessageStmt.get(newMessageId);
      
      // highlight-start
      // Buat notifikasi untuk pengguna lain di ruang chat
      const recipientId = room.user1_id === senderId ? room.user2_id : room.user1_id;
      // Pastikan tidak mengirim notifikasi ke diri sendiri jika ada logika group chat di masa depan
      if (recipientId !== senderId) { 
        await createNotification(db, { 
          recipientUserId: recipientId, 
          actorUserId: senderId, 
          type: 'NEW_CHAT_MESSAGE', // Tipe notifikasi yang jelas
          targetEntityType: 'CHAT_ROOM', // Entitas target adalah ruang chat
          targetEntityId: chatRoomId,    // ID ruang chat
          // Pesan notifikasi bisa lebih spesifik jika ada message_content
          message: `${senderUsername || 'Seseorang'} mengirimi Anda ${attachmentFile ? `lampiran (${attachmentTypeDb})` : 'pesan baru'}.`
        });
      }
      // highlight-end

      return NextResponse.json({ message: 'Pesan berhasil terkirim', chatMessage: newMessage }, { status: 201 });
    } else {
      // ... (cleanup file jika gagal insert DB) ...
      return NextResponse.json({ message: 'Gagal mengirim pesan ke database.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`Error mengirim pesan ke room ${params?.roomId}:`, error);
    return NextResponse.json({ message: 'Gagal memproses pesan.', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}

// Handler untuk GET request - Mengambil pesan dari sebuah ruang chat
export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    await request.text(); 

    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) return NextResponse.json({ message: 'Akses ditolak' }, { status: 401 });
    const currentUserId = authenticatedUser.userId;

    if (!params || !params.roomId) return NextResponse.json({ message: 'Room ID tidak ada' }, { status: 400 });
    const chatRoomId = parseInt(params.roomId, 10);
    if (isNaN(chatRoomId)) return NextResponse.json({ message: 'Room ID tidak valid' }, { status: 400 });
    
    const db = getDbConnection();
    const roomCheckStmt = db.prepare('SELECT id FROM chat_rooms WHERE id = ? AND (user1_id = ? OR user2_id = ?)');
    if (!roomCheckStmt.get(chatRoomId, currentUserId, currentUserId)) return NextResponse.json({ message: 'Ruang chat tidak ditemukan atau akses ditolak' }, { status: 403 });
    
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    const messagesStmt = db.prepare<unknown[], ChatMessageData>(`
      SELECT
        cm.id, cm.chat_room_id, cm.sender_id, cm.message_content, 
        cm.attachment_url, cm.attachment_type, cm.created_at,
        u.username AS sender_username, u.profile_picture_url AS sender_profile_picture_url
      FROM chat_messages cm JOIN users u ON cm.sender_id = u.id
      WHERE cm.chat_room_id = ? ORDER BY cm.created_at DESC LIMIT ? OFFSET ?`);
    const messagesFromDb = messagesStmt.all(chatRoomId, limit, offset);
    
    return NextResponse.json(messagesFromDb.reverse(), { status: 200 });

  } catch (error: any) {
    console.error(`Error mengambil pesan dari room ${params?.roomId}:`, error);
    if (error.code === 'SQLITE_ERROR' && error.message.includes('no such column')) {
        console.error("DATABASE SCHEMA ERROR: Kolom yang dibutuhkan tidak ada di tabel chat_messages. Harap perbarui skema database Anda.");
        return NextResponse.json({ message: 'Kesalahan database: Skema tabel pesan tidak lengkap.', internalErrorCode: 'DB_SCHEMA_MSG_MISSING_COL' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Gagal mengambil pesan.', error: error.message ? error.message : 'Unknown server error' }, { status: 500 });
  }
}
