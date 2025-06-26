// src/app/api/users/[identifier]/friend-count/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';

interface RouteParams {
  identifier: string;
}

export async function GET(request: NextRequest, context: { params: Promise<RouteParams> }) {
  const params = await context.params;
  try {
    await request.text(); // "Selesaikan" request sebelum mengakses params

    const identifier = params.identifier;
    let userIdToQuery: number | null = null;
    const db = getDbConnection();

    if (!isNaN(parseInt(identifier, 10))) {
      userIdToQuery = parseInt(identifier, 10);
    } else {
      const userStmt = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
      const user = userStmt.get(identifier) as { id: number } | undefined;
      if (user) {
        userIdToQuery = user.id;
      }
    }

    if (userIdToQuery === null) {
      return NextResponse.json({ message: 'Pengguna tidak ditemukan dari identifier' }, { status: 404 });
    }

    const stmt = db.prepare(`
      SELECT COUNT(*) as friendCount
      FROM friendships
      WHERE (sender_id = ? OR receiver_id = ?) AND status = 'ACCEPTED'
    `);
    const result = stmt.get(userIdToQuery, userIdToQuery) as { friendCount: number } | undefined;
    const friendCount = result ? result.friendCount : 0;

    return NextResponse.json({ friendCount }, { status: 200 });

  } catch (error: any) {
    console.error(`Gagal mengambil jumlah teman untuk identifier ${params?.identifier}:`, error);
    return NextResponse.json({ message: 'Gagal mengambil jumlah teman', error: error.message }, { status: 500 });
  }
}