// src/app/api/livestreams/[postId]/golive/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/authUtils';

interface RouteParams { postId: string; }
interface GoLiveBody { streamPlaybackUrl: string; } // URL dari media server

export async function PUT(request: NextRequest, { params }: { params: RouteParams }) {
    try {
        const authenticatedUser = verifyAuth(request);
        if (!authenticatedUser) return NextResponse.json({ message: 'Akses ditolak' }, { status: 401 });
        
        const postId = parseInt(params.postId, 10);
        if (isNaN(postId)) return NextResponse.json({ message: 'Post ID tidak valid' }, { status: 400 });

        const body = await request.json() as GoLiveBody;
        if (!body.streamPlaybackUrl) {
            return NextResponse.json({ message: 'streamPlaybackUrl dibutuhkan' }, { status: 400 });
        }

        const db = getDbConnection();
        // Pastikan hanya pemilik post yang bisa update status livenya
        const postCheckStmt = db.prepare('SELECT user_id, is_live FROM posts WHERE id = ?');
        const post = postCheckStmt.get(postId) as { user_id: number; is_live: boolean } | undefined;

        if (!post || !post.is_live) return NextResponse.json({ message: 'Postingan live tidak ditemukan' }, { status: 404 });
        if (post.user_id !== authenticatedUser.userId) return NextResponse.json({ message: 'Aksi tidak diizinkan' }, { status: 403 });

        const updateStmt = db.prepare("UPDATE posts SET live_status = 'LIVE', stream_playback_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        const info = updateStmt.run(body.streamPlaybackUrl, postId);

        if (info.changes > 0) {
            return NextResponse.json({ message: 'Stream sekarang LIVE', postId, streamPlaybackUrl: body.streamPlaybackUrl }, { status: 200 });
        }
        return NextResponse.json({ message: 'Gagal update status stream' }, { status: 400 });
    } catch (error: any) { /* ... error handling ... */ }
}