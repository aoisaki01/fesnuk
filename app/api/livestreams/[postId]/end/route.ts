// src/app/api/livestreams/[postId]/end/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/authUtils';

interface RouteParams { postId: string; }

export async function PUT(request: NextRequest, { params }: { params: RouteParams }) {
    try {
        const authenticatedUser = verifyAuth(request);
        if (!authenticatedUser) return NextResponse.json({ message: 'Akses ditolak' }, { status: 401 });
        
        const postId = parseInt(params.postId, 10);
        if (isNaN(postId)) return NextResponse.json({ message: 'Post ID tidak valid' }, { status: 400 });

        const db = getDbConnection();
        // Pastikan hanya pemilik post yang bisa mengakhiri livenya
        const postCheckStmt = db.prepare('SELECT user_id, is_live, live_status FROM posts WHERE id = ?');
        const post = postCheckStmt.get(postId) as { user_id: number; is_live: boolean; live_status: string } | undefined;

        if (!post || !post.is_live) return NextResponse.json({ message: 'Postingan live tidak ditemukan' }, { status: 404 });
        if (post.user_id !== authenticatedUser.userId) return NextResponse.json({ message: 'Aksi tidak diizinkan' }, { status: 403 });
        if (post.live_status === 'ENDED') return NextResponse.json({ message: 'Stream sudah berakhir' }, { status: 409 });


        const updateStmt = db.prepare("UPDATE posts SET live_status = 'ENDED', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        // is_live bisa dipertimbangkan untuk di-set false di sini atau dibiarkan true untuk histori
        const info = updateStmt.run(postId);

        if (info.changes > 0) {
            return NextResponse.json({ message: 'Sesi live stream berakhir', postId }, { status: 200 });
        }
        return NextResponse.json({ message: 'Gagal mengakhiri stream' }, { status: 400 });
    } catch (error: any) { /* ... error handling ... */ }
}