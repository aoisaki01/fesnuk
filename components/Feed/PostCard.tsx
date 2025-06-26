// src/components/Feed/PostCard.tsx
"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, FormEvent } from 'react';

// Tipe data untuk props PostCard
interface FeedPost {
  id: number;
  content: string;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  author_id: number;
  author_username: string;
  author_full_name: string | null;
  author_profile_picture_url: string | null;
  like_count: number;
  comment_count: number;
  is_liked_by_me: boolean;
  visibility_status?: string | null;
}

interface PostCardProps {
  post: FeedPost;
  loggedInUserId?: number | null;
  onPostDeleted?: (postId: number) => void;
  onPostEdited?: (updatedPost: FeedPost) => void;
  onPostReported?: (postId: number, isHidden: boolean) => void;
}

export default function PostCard({ post, loggedInUserId, onPostDeleted, onPostEdited, onPostReported }: PostCardProps) {
  const [currentLikes, setCurrentLikes] = useState(post.like_count);
  const [isLikedByCurrentUser, setIsLikedByCurrentUser] = useState(post.is_liked_by_me);
  const [isLiking, setIsLiking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(post.content);
  const [editedImageUrl, setEditedImageUrl] = useState(post.image_url || '');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [isReporting, setIsReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [hasReportedThisSession, setHasReportedThisSession] = useState(false);

  useEffect(() => {
    setCurrentLikes(post.like_count);
    setIsLikedByCurrentUser(post.is_liked_by_me);
    setEditedContent(post.content);
    setEditedImageUrl(post.image_url || '');
    setHasReportedThisSession(false); 
    setReportMessage(null);
  }, [post]);

  const handleLikeUnlike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    setError(null);
    setReportMessage(null);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setError("Aksi gagal: Anda belum login.");
      setIsLiking(false);
      return;
    }
    try {
      const method = isLikedByCurrentUser ? 'DELETE' : 'POST';
      const response = await fetch(`/api/posts/${post.id}/likes`, {
        method: method,
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Gagal like/unlike');
      }
      const result = await response.json();
      setCurrentLikes(result.totalLikes);
      setIsLikedByCurrentUser(!isLikedByCurrentUser);
      if (onPostEdited) {
        onPostEdited({
          ...post,
          like_count: result.totalLikes,
          is_liked_by_me: !isLikedByCurrentUser,
        });
      }
    } catch (err: any) {
      setError(err.message);
      console.error("Error like/unlike:", err);
    } finally {
      setIsLiking(false);
    }
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editedContent.trim() === '') {
      setError("Konten tidak boleh kosong.");
      return;
    }
    setIsSubmittingEdit(true);
    setError(null);
    setReportMessage(null);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setError("Aksi gagal: Anda belum login.");
      setIsSubmittingEdit(false);
      return;
    }
    try {
      const bodyToUpdate: { content: string; imageUrl?: string | null } = { // Hanya content dan imageUrl
        content: editedContent,
      };
      if (editedImageUrl !== (post.image_url || '')) { 
        bodyToUpdate.imageUrl = editedImageUrl.trim() === '' ? null : editedImageUrl.trim();
      }

      const response = await fetch(`/api/posts/${post.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyToUpdate),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Gagal mengedit postingan.');
      }
      if (onPostEdited && data.post) {
        onPostEdited(data.post); 
      }
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message);
      console.error("Error editing post:", err);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeletePost = async () => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus postingan ini?")) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    setReportMessage(null);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setError("Aksi gagal: Anda belum login.");
      setIsDeleting(false);
      return;
    }
    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        let errorData;
        try { errorData = await response.json(); } catch (e) { errorData = { message: `Gagal menghapus postingan (${response.statusText})` };}
        throw new Error(errorData.message || 'Gagal menghapus postingan.');
      }
      if (onPostDeleted) {
        onPostDeleted(post.id);
      }
    } catch (err: any) {
      setError(err.message);
      console.error("Error deleting post:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const isOwnPost = loggedInUserId === post.author_id;

  const handleReportPost = async () => {
    if (!loggedInUserId) { setReportMessage("Anda harus login untuk melaporkan."); return; }
    if (isOwnPost) { setReportMessage("Anda tidak bisa melaporkan postingan sendiri."); return; }
    if (hasReportedThisSession) { setReportMessage("Anda sudah melaporkan postingan ini."); return; }

    const reasonPrompt = prompt("Masukkan alasan laporan Anda (opsional):");
    if (reasonPrompt === null) return; 

    setIsReporting(true);
    setReportMessage(null);
    setError(null);
    const token = localStorage.getItem('jwtToken');

    try {
      const body: { reason?: string } = {};
      if (reasonPrompt.trim() !== '') body.reason = reasonPrompt.trim();

      const response = await fetch(`/api/posts/${post.id}/report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) setHasReportedThisSession(true);
        throw new Error(data.message || 'Gagal melaporkan postingan.');
      }
      
      setReportMessage(data.message || 'Postingan berhasil dilaporkan. Terima kasih.');
      setHasReportedThisSession(true);

      if (onPostReported) {
        onPostReported(post.id, data.postHidden || false);
      }
    } catch (err: any) {
      setReportMessage(err.message);
      console.error("Error reporting post:", err);
    } finally {
      setIsReporting(false);
    }
  };

  // --- PERBAIKAN UTAMA DI SINI ---
  return ( 
    <div className="bg-white shadow-md rounded-lg p-4 sm:p-6 border border-gray-200">
      <div className="flex items-center mb-4">
        <Link href={`/profile/${post.author_username}`} className="flex-shrink-0 mr-3">
          {post.author_profile_picture_url ? (
            <Image 
                src={post.author_profile_picture_url} 
                alt={post.author_username || 'User Avatar'} 
                width={40} height={40} 
                className="rounded-full object-cover w-10 h-10"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold text-sm">
              {post.author_username?.substring(0, 1).toUpperCase() || '?'}
            </div>
          )}
        </Link>
        <div className="flex-grow">
          <Link href={`/profile/${post.author_username}`} className="font-semibold text-gray-800 hover:underline">
            {post.author_full_name || post.author_username}
          </Link>
          <p className="text-xs text-gray-500">
            {new Date(post.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })}
            {post.updated_at && post.created_at !== post.updated_at && 
             (new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 1000 * 60) && 
                <span className="italic text-xs"> 
                  {' '}(diedit {new Date(post.updated_at).toLocaleString('id-ID', { timeStyle: 'short', timeZone: 'Asia/Jakarta' })})
                </span>
            }
          </p>
        </div>
        <div className="relative space-x-2 flex-shrink-0">
            {isOwnPost && !isEditing && (
                <>
                    <button onClick={() => setIsEditing(true)} className="text-xs text-blue-600 hover:text-blue-800 p-1" disabled={isDeleting || isReporting}>Edit</button>
                    <button onClick={handleDeletePost} className="text-xs text-red-600 hover:text-red-800 p-1" disabled={isDeleting || isSubmittingEdit || isReporting}>
                        {isDeleting ? '...' : 'Hapus'}
                    </button>
                </>
            )}
            {!isOwnPost && loggedInUserId && (
                <button 
                    onClick={handleReportPost} 
                    className={`text-xs p-1 ${hasReportedThisSession ? 'text-gray-400 cursor-not-allowed' : 'text-orange-600 hover:text-orange-800'}`}
                    disabled={isReporting || hasReportedThisSession}
                    title={hasReportedThisSession ? "Anda sudah melaporkan postingan ini" : "Laporkan postingan ini"}
                >
                    {isReporting ? '...' : (hasReportedThisSession ? 'Dilaporkan' : 'Laporkan')}
                </button>
            )}
        </div>
      </div>

      {isEditing && isOwnPost ? (
        <form onSubmit={handleEditSubmit} className="mb-3 space-y-3">
          <div>
            <label htmlFor={`edit-content-${post.id}`} className="sr-only">Edit konten</label>
            <textarea
              id={`edit-content-${post.id}`}
              rows={3}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full text-black p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              disabled={isSubmittingEdit}
            />
          </div>
          <div>
            <label htmlFor={`edit-image-url-${post.id}`} className="block text-xs font-medium text-gray-500 mb-1">URL Gambar (kosongkan untuk hapus)</label>
            {/* <input
              id={`edit-image-url-${post.id}`}
              type="url"
              placeholder="URL Gambar baru (opsional)"
              value={editedImageUrl}
              onChange={(e) => setEditedImageUrl(e.target.value)}
              className="w-full p-2 text-black border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              disabled={isSubmittingEdit}
            /> */}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end space-x-2">
            <button type="button" onClick={() => { setIsEditing(false); setError(null); setEditedContent(post.content); setEditedImageUrl(post.image_url || '');}} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 border rounded-md" disabled={isSubmittingEdit}>
              Batal
            </button>
            <button type="submit" className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-70" disabled={isSubmittingEdit || editedContent.trim() === ''}>
              {isSubmittingEdit ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      ) : (
        <>
          {post.content && post.content.trim() !== '' && (
            <p className="text-gray-700 mb-4 whitespace-pre-wrap leading-relaxed">{post.content}</p>
          )}
          {post.image_url && (
            <div className="mb-4 rounded-lg overflow-hidden border">
              <Image 
                src={post.image_url} 
                alt="Gambar postingan" 
                width={700}
                height={500}
                className="object-contain w-full max-h-[500px] bg-gray-100"
                priority={false}
              />
            </div>
          )}
          {post.video_url && (
            <div className="mb-4 rounded-lg overflow-hidden border bg-black">
              <video 
                controls 
                src={post.video_url} 
                className="w-full max-h-[500px] object-contain"
              >
                Browser Anda tidak mendukung tag video.
              </video>
            </div>
          )}
        </>
      )}
      
      {reportMessage && !isEditing && <p className={`text-xs mt-1 mb-2 ${reportMessage.includes('Gagal') || reportMessage.includes('tidak bisa') || reportMessage.includes('harus login') ? 'text-red-500' : 'text-green-600'}`}>{reportMessage}</p>}
      {error && !isEditing && !reportMessage && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <div className="flex items-center text-gray-600 text-sm space-x-6 pt-3 border-t border-gray-200 mt-4">
        <button
          onClick={handleLikeUnlike}
          disabled={isLiking}
          className={`flex items-center hover:text-red-600 transition-colors duration-150 ${isLikedByCurrentUser ? 'text-red-500 font-semibold' : 'text-gray-500'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-1.5 ${isLiking ? 'animate-ping' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg>
          {currentLikes} Suka
        </button>
        <Link href={`/post/${post.id}#comments`} className="flex items-center hover:text-blue-600 transition-colors duration-150">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.74 8.74 0 01-4.26-1.056L4.43 17.57A1 1 0 013 16.57V13a8.004 8.004 0 01-1-4.007A8.01 8.01 0 012 9c0-4.418 3.582-8 8-8s8 3.582 8 8zm-3-1a1 1 0 10-2 0v1a1 1 0 102 0v-1zm-4 0a1 1 0 10-2 0v1a1 1 0 102 0v-1zm-4 0a1 1 0 10-2 0v1a1 1 0 102 0v-1z" clipRule="evenodd" /></svg>
          {post.comment_count} Komentar
        </Link>
      </div>
    </div>
  );
}