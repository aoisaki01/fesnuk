// src/components/Reels/ReelDetailSidebar.tsx
"use client";

import { useState, useEffect, FormEvent } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Image from 'next/image';
import { HeartIcon, ChatBubbleOvalLeftEllipsisIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { HeartIcon as HeartIconOutline } from '@heroicons/react/24/outline';
// Hapus impor renderMentions karena tidak akan digunakan
// import { renderMentions } from '@/lib/utils';

// Tipe data dari props
interface ReelData {
  id: number;
  content: string | null;
  video_url: string;
  author_id: number;
  author_username: string;
  author_full_name: string | null;
  author_profile_picture_url: string | null;
  like_count: number;
  comment_count: number;
  is_liked_by_me: boolean;
}

// Tipe data untuk komentar (dari API /api/posts/[postId]/comments)
interface CommentData {
  id: number;
  content: string;
  created_at: string;
  author_username: string;
  author_profile_picture_url: string | null;
}

interface ReelDetailSidebarProps {
  reel: ReelData | null;
  onInteraction: () => void; // Callback untuk memicu revalidasi di parent
}

// Fungsi fetcher (perlu didefinisikan atau diimpor)
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, { headers: { ...(token && { 'Authorization': `Bearer ${token}` }) } });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || 'Gagal mengambil data.');
  }
  return res.json();
};

export default function ReelDetailSidebar({ reel, onInteraction }: ReelDetailSidebarProps) {
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  
  // State lokal untuk like agar UI responsif
  const [localLikeCount, setLocalLikeCount] = useState(reel?.like_count || 0);
  const [isLikedLocally, setIsLikedLocally] = useState(reel?.is_liked_by_me || false);

  // SWR untuk mengambil komentar untuk reel yang aktif
  const { data: comments, error: commentsError, isLoading: isLoadingComments, mutate: mutateComments } = useSWR<CommentData[]>(
    reel ? `/api/posts/${reel.id}/comments` : null,
    fetcher
  );

  // Sinkronkan state lokal saat prop 'reel' berubah
  useEffect(() => {
    if (reel) {
      setLocalLikeCount(reel.like_count);
      setIsLikedLocally(reel.is_liked_by_me);
    }
  }, [reel]);


  if (!reel) {
    return (
      <div className="h-full bg-white rounded-r-2xl border-l border-gray-200 flex flex-col justify-center items-center text-gray-400">
        <p>Detail akan muncul di sini</p>
      </div>
    );
  }

  const handleLike = async () => {
    const token = localStorage.getItem('jwtToken');
    if (!token) return;

    const originalLikedState = isLikedLocally;
    const originalLikeCount = localLikeCount;
    setIsLikedLocally(!originalLikedState);
    setLocalLikeCount(originalLikedState ? localLikeCount - 1 : localLikeCount + 1);

    try {
      const method = originalLikedState ? 'DELETE' : 'POST';
      const response = await fetch(`/api/posts/${reel.id}/likes`, {
        method, headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        setIsLikedLocally(originalLikedState);
        setLocalLikeCount(originalLikeCount);
      } else {
        onInteraction(); // Panggil callback untuk revalidasi data reel di parent
      }
    } catch (error) {
      setIsLikedLocally(originalLikedState);
      setLocalLikeCount(originalLikeCount);
    }
  };

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setIsSubmittingComment(true);
    const token = localStorage.getItem('jwtToken');
    if (!token) return;

    try {
        await fetch(`/api/posts/${reel.id}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content: newComment })
        });
        setNewComment('');
        mutateComments(); // Revalidasi komentar
        onInteraction(); // Revalidasi data reel di parent (untuk comment_count)
    } catch (error) {
        console.error("Gagal mengirim komentar:", error);
    } finally {
        setIsSubmittingComment(false);
    }
  };

  return (
    <div className="h-full text-black bg-white rounded-r-2xl border-l border-gray-200 flex flex-col">
      {/* Header Penulis */}
      <div className="p-4 text-black border-b flex justify-between items-center">
        <Link href={`/profile/${reel.author_username}`} className="flex text-black items-center gap-3">
          {reel.author_profile_picture_url ? (
            <Image src={reel.author_profile_picture_url} alt={reel.author_username} width={40} height={40} className="rounded-full text-black object-cover"/>
          ) : (
            <div className="w-10 text-black h-10 rounded-full bg-gray-300 flex items-center justify-center text-lg font-semibold ">
                {reel.author_username.substring(0,1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-black text-sm">{reel.author_username}</p>
            <p className="text-xs text-black">{reel.author_full_name}</p>
          </div>
        </Link>
        {/* Tombol Follow bisa ditambahkan di sini */}
      </div>

      {/* Caption */}
      {reel.content && (
        <div className="p-4 text-sm text-black border-b">
          {/* PERUBAHAN: Tampilkan teks caption apa adanya */}
          <p className="whitespace-pre-wrap">{reel.content}</p>
        </div>
      )}

      {/* Info Like & Komen */}
      <div className="p-4 border-b flex items-center gap-4">
          <button onClick={handleLike} className="flex items-center gap-1.5 text-black">
            {isLikedLocally ? <HeartIcon className="w-6 h-6 text-red-500"/> : <HeartIconOutline className="w-6 h-6"/>}
            <span className="text-sm font-semibold">{localLikeCount}</span>
          </button>
          <div className="flex items-center gap-1.5 text-gray-600">
            <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6"/>
            <span className="text-sm font-semibold">{reel.comment_count}</span>
          </div>
      </div>

      {/* Daftar Komentar */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {commentsError && <p className="text-xs text-red-500">Gagal memuat komentar.</p>}
        {!comments && isLoadingComments && <p className="text-xs text-gray-500">Memuat komentar...</p>}
        {comments?.map(comment => (
            <div key={comment.id} className="flex items-start gap-2.5">
                <Link href={`/profile/${comment.author_username}`}>
                    <Image src={comment.author_profile_picture_url || '/placeholder-avatar.png'} alt={comment.author_username} width={28} height={28} className="rounded-full object-cover"/>
                </Link>
                <div>
                    <p className="text-xs">
                        <Link href={`/profile/${comment.author_username}`} className="font-semibold mr-1">{comment.author_username}</Link>
                        {/* PERUBAHAN: Tampilkan teks komentar apa adanya */}
                        <span className="whitespace-pre-wrap">{comment.content}</span>
                    </p>
                </div>
            </div>
        ))}
      </div>

      {/* Form Tambah Komentar */}
      <div className="p-4 border-t bg-gray-50">
        <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
            <input 
                type="text"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Tambahkan komentar..."
                className="flex-1 bg-gray-100 text-black border-gray-200 rounded-full px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <button type="submit" disabled={isSubmittingComment || !newComment.trim()} className="p-2 text-blue-600 disabled:text-gray-400">
                <PaperAirplaneIcon className="w-6 h-6"/>
            </button>
        </form>
      </div>
    </div>
  );
}
