// src/app/api/chat/rooms/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/authUtils';

// Tipe untuk body request saat memulai chat
interface CreateOrGetChatRoomBody {
  targetUserId: number;
}

// Tipe data untuk respons
interface ChatRoomData {
  id: number; // Room ID
  user1_id: number;
  user2_id: number;
  created_at: string;
  last_message_at: string;
  // Informasi pengguna lain dalam percakapan
  other_user_id: number;
  other_username: string;
  other_profile_picture_url: string | null;
  // Anda bisa menambahkan last_message_preview jika API diperbarui untuk ini
}

// Handler untuk POST request - Memulai atau mendapatkan ruang chat 1-on-1
export async function POST(request: NextRequest) {
  try {
    let body: CreateOrGetChatRoomBody;
    try {
      body = await request.json() as CreateOrGetChatRoomBody;
    } catch (e) {
      return NextResponse.json({ message: 'Format request body tidak valid atau body kosong.' }, { status: 400 });
    }
    
    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) return NextResponse.json({ message: 'Akses ditolak.' }, { status: 401 });
    
    const currentUserId = authenticatedUser.userId;
    const targetUserId = body.targetUserId;

    if (!targetUserId || typeof targetUserId !== 'number') {
      return NextResponse.json({ message: 'targetUserId dibutuhkan dan harus berupa angka.' }, { status: 400 });
    }
    if (currentUserId === targetUserId) {
      return NextResponse.json({ message: 'Tidak bisa membuat ruang chat dengan diri sendiri.' }, { status: 400 });
    }

    const db = getDbConnection();
    const targetUserStmt = db.prepare('SELECT id, username, profile_picture_url FROM users WHERE id = ?');
    const targetUser = targetUserStmt.get(targetUserId) as { id: number; username: string; profile_picture_url: string | null } | undefined;
    if (!targetUser) {
        return NextResponse.json({ message: 'Pengguna target tidak ditemukan.' }, { status: 404 });
    }

    const user1Id = Math.min(currentUserId, targetUserId);
    const user2Id = Math.max(currentUserId, targetUserId);

    db.exec('BEGIN IMMEDIATE TRANSACTION');
    let chatRoomId: number | null = null;
    let roomForResponse: any = null;
    let isNewRoom = false;

    try {
        const findRoomStmt = db.prepare('SELECT * FROM chat_rooms WHERE user1_id = ? AND user2_id = ?');
        roomForResponse = findRoomStmt.get(user1Id, user2Id);

        if (roomForResponse) {
            chatRoomId = roomForResponse.id;
        } else {
            const insertRoomStmt = db.prepare('INSERT INTO chat_rooms (user1_id, user2_id, created_at, last_message_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
            const info = insertRoomStmt.run(user1Id, user2Id);
            if (info.changes > 0 && info.lastInsertRowid) {
                isNewRoom = true;
                chatRoomId = info.lastInsertRowid as number;
                const newRoomStmt = db.prepare('SELECT * FROM chat_rooms WHERE id = ?');
                roomForResponse = newRoomStmt.get(chatRoomId);
            } else {
                throw new Error('Gagal membuat ruang chat baru di database.');
            }
        }
        db.exec('COMMIT');
    } catch (e: any) {
        console.error("Error dalam transaksi DB /chat/rooms:", e.message);
        db.exec('ROLLBACK');
        throw e; 
    }

    if (!chatRoomId || !roomForResponse) {
        return NextResponse.json({ message: 'Gagal mendapatkan atau membuat ruang chat.' }, { status: 500 });
    }
    
    const responseData: ChatRoomData = {
        id: roomForResponse.id,
        user1_id: roomForResponse.user1_id,
        user2_id: roomForResponse.user2_id,
        created_at: roomForResponse.created_at,
        last_message_at: roomForResponse.last_message_at,
        other_user_id: targetUser.id,
        other_username: targetUser.username,
        other_profile_picture_url: targetUser.profile_picture_url,
    };

    return NextResponse.json(responseData, { status: isNewRoom ? 201 : 200 });

  } catch (error: any) {
    console.error('Error pada API get/create chat room:', error);
    return NextResponse.json({ message: 'Gagal memproses permintaan ruang chat.', error: error.message }, { status: 500 });
  }
}


// Handler untuk GET request - Mengambil daftar ruang chat pengguna
export async function GET(request: NextRequest) {
  try {
    await request.text(); // Untuk Next.js baru, "selesaikan" request sebelum akses searchParams

    const authenticatedUser = verifyAuth(request);
    if (!authenticatedUser) {
      return NextResponse.json({ message: 'Akses ditolak: Autentikasi dibutuhkan.' }, { status: 401 });
    }
    const currentUserId = authenticatedUser.userId;

    const db = getDbConnection();

    // Query untuk mengambil semua ruang chat di mana pengguna terlibat,
    // beserta informasi pengguna lain di ruang chat tersebut.
    const sqlQuery = `
      SELECT
        cr.id,
        cr.user1_id,
        cr.user2_id,
        cr.created_at,
        cr.last_message_at,
        CASE
          WHEN cr.user1_id = ? THEN u2.id
          ELSE u1.id
        END AS other_user_id,
        CASE
          WHEN cr.user1_id = ? THEN u2.username
          ELSE u1.username
        END AS other_username,
        CASE
          WHEN cr.user1_id = ? THEN u2.profile_picture_url
          ELSE u1.profile_picture_url
        END AS other_profile_picture_url
      FROM chat_rooms cr
      JOIN users u1 ON cr.user1_id = u1.id
      JOIN users u2 ON cr.user2_id = u2.id
      WHERE cr.user1_id = ? OR cr.user2_id = ?
      ORDER BY cr.last_message_at DESC
    `;
    
    const roomsStmt = db.prepare<[number, number, number, number, number], ChatRoomData>(sqlQuery);
    
    const chatRooms = roomsStmt.all(
        currentUserId, // Untuk CASE other_user_id
        currentUserId, // Untuk CASE other_username
        currentUserId, // Untuk CASE other_profile_picture_url
        currentUserId, // Untuk WHERE cr.user1_id = ?
        currentUserId  // Untuk WHERE cr.user2_id = ?
    );

    return NextResponse.json(chatRooms, { status: 200 });

  } catch (error: any) {
    console.error('Error mengambil daftar ruang chat:', error);
    return NextResponse.json({ message: 'Gagal mengambil daftar percakapan.', error: error.message }, { status: 500 });
  }
}
