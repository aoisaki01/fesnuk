// src/app/(main)/post/[postId]/page.tsx
"use client";

import { useParams, useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import Image from 'next/image';
import Link from 'next/link';
// Pastikan semua hook React yang digunakan diimpor:
import { FormEvent, useState, useEffect, useCallback, useRef, ChangeEvent, KeyboardEvent } from 'react'; // Ditambahkan useRef, ChangeEvent, KeyboardEvent

// Fungsi fetcher (asumsi sudah ada atau didefinisikan global/diimpor)
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, {
    headers: {
      ...(token && { 'Authorization': `Bearer ${token}` }),
    },
  });
  if (!res.ok) {
    let errorData;
    try { errorData = await res.json(); }
    catch (e) { errorData = { message: `Request failed with status ${res.status}` }; }
    const error = new Error(errorData.message || 'Gagal mengambil data.');
    // @ts-ignore
    error.status = res.status;
    throw error;
  }
  return res.json();
};

// Tipe data untuk detail postingan tunggal
interface SinglePostDetail {
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
}

// Tipe data untuk Komentar (dari API /comments)
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

// Tipe data untuk pengguna yang login (minimal)
interface LoggedInUser {
  id: number;
  username: string;
  // tambahkan properti lain jika perlu
}

// Tipe untuk sugesti pengguna (untuk fitur mention)
interface UserSuggestion {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
}


// Komponen untuk satu item komentar
interface CommentItemProps {
  comment: CommentWithAuthor;
  loggedInUserId: number | null;
  onCommentUpdated: () => void;
  onCommentDeleted: (commentId: number) => void;
}

function CommentItem({ comment, loggedInUserId, onCommentUpdated, onCommentDeleted }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCommentContent, setEditedCommentContent] = useState(comment.content);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isOwnComment = loggedInUserId === comment.user_id;

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editedCommentContent.trim() === '') {
      setEditError("Komentar tidak boleh kosong.");
      return;
    }
    setIsSubmittingEdit(true);
    setEditError(null);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setEditError("Aksi gagal: Anda belum login.");
      setIsSubmittingEdit(false);
      return;
    }

    try {
      const response = await fetch(`/api/comments/${comment.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: editedCommentContent }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Gagal mengedit komentar.");
      }
      onCommentUpdated();
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err.message);
      console.error("Error editing comment:", err);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteComment = async () => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus komentar ini?")) {
      return;
    }
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setEditError("Aksi gagal: Anda belum login.");
      return;
    }
    try {
      const response = await fetch(`/api/comments/${comment.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Gagal menghapus komentar.");
      }
      onCommentDeleted(comment.id);
    } catch (err: any) {
      setEditError(err.message);
      console.error("Error deleting comment:", err);
    }
  };

  return (
    <div className="flex items-start space-x-3 pb-3 pt-3 border-b border-gray-100 last:border-b-0">
      <Link href={`/profile/${comment.author_username}`}>
        {comment.author_profile_picture_url ? (
          <Image src={comment.author_profile_picture_url} alt={comment.author_username} width={36} height={36} className="rounded-full object-cover w-9 h-9 sm:w-10 sm:h-10"/>
        ) : (
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm text-white font-bold">
            {comment.author_username?.substring(0,1).toUpperCase()}
          </div>
        )}
      </Link>
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
            <div>
              <Link href={`/profile/${comment.author_username}`} className="font-semibold text-sm text-gray-800 hover:underline">
                {comment.author_username}
              </Link>
              <p className="text-xs text-gray-500 ml-0 sm:ml-2 sm:inline-block block">
                {new Date(comment.created_at).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'})}
                {comment.created_at !== comment.updated_at && <span className="italic text-xs"> (diedit)</span>}
              </p>
            </div>
            {isOwnComment && !isEditing && (
            <div className="text-xs space-x-2 flex-shrink-0">
              <button onClick={() => setIsEditing(true)} className="text-blue-600 hover:underline">Edit</button>
              <button onClick={handleDeleteComment} className="text-red-600 hover:underline">Hapus</button>
            </div>
            )}
        </div>

        {isEditing && isOwnComment ? (
          <form onSubmit={handleEditSubmit} className="mt-2 space-y-2">
            <textarea
              rows={2}
              value={editedCommentContent}
              onChange={(e) => setEditedCommentContent(e.target.value)}
              className="w-full p-2 border text-black border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={isSubmittingEdit}
            />
            {editError && <p className="text-xs text-red-500">{editError}</p>}
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={() => { setIsEditing(false); setEditError(null); setEditedCommentContent(comment.content); }} className="text-xs px-3 py-1.5 border rounded-md hover:bg-gray-100" disabled={isSubmittingEdit}>
                Batal
              </button>
              <button type="submit" className="text-xs px-3 py-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-70" disabled={isSubmittingEdit || editedCommentContent.trim() === ''}>
                {isSubmittingEdit ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-gray-700 text-sm whitespace-pre-wrap mt-1">{comment.content}</p>
        )}
      </div>
    </div>
  );
}


export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.postId as string;

  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [commentContent, setCommentContent] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  // State BARU untuk mention di komentar
  const [mentionQueryComment, setMentionQueryComment] = useState<string | null>(null);
  const [showSuggestionsComment, setShowSuggestionsComment] = useState(false);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const commentSuggestionsRef = useRef<HTMLUListElement>(null);
  const [activeSuggestionIndexComment, setActiveSuggestionIndexComment] = useState(0);


  useEffect(() => {
    setIsClient(true);
    const userDataString = localStorage.getItem('userData');
    if (userDataString) {
      try {
        setLoggedInUser(JSON.parse(userDataString));
      } catch (e) { console.error("Gagal parse user data di PostDetailPage", e); }
    }
  }, []);

  const { data: post, error: postError, isLoading: isLoadingPost, mutate: mutatePost } = useSWR<SinglePostDetail>(
    (postId && isClient) ? `/api/posts/${postId}` : null,
    fetcher
  );

  const { data: commentsData, error: commentsError, isLoading: isLoadingComments, mutate: mutateComments } = useSWR<CommentWithAuthor[]>(
    (postId && isClient) ? `/api/posts/${postId}/comments` : null,
    fetcher
  );
    
  // Hook SWR untuk mengambil sugesti pengguna (untuk mention di komentar)
  const {
    data: userSuggestionsDataComment,
    error: suggestionsErrorComment,
    isLoading: isLoadingSuggestionsComment
  } = useSWR<UserSuggestion[]>(
    (mentionQueryComment && mentionQueryComment.length >= 0 && isClient && showSuggestionsComment) ? `/api/search/users?q=${encodeURIComponent(mentionQueryComment)}&limit=5` : null,
    fetcher,
    { dedupingInterval: 300 }
  );
  const userSuggestionsComment = userSuggestionsDataComment || [];


  const [displayComments, setDisplayComments] = useState<CommentWithAuthor[]>([]);

  useEffect(() => {
    if (commentsData) {
      setDisplayComments(commentsData);
    }
  }, [commentsData]);

  const handleCommentUpdated = useCallback(() => {
    mutateComments();
    mutatePost();
  },[mutateComments, mutatePost]);

  const handleCommentDeleted = useCallback((deletedCommentId: number) => {
    setDisplayComments(prevComments => prevComments.filter(c => c.id !== deletedCommentId));
    // Pertimbangkan optimistic update di sini sebelum mutate, atau serahkan ke SWR
    mutateComments(); // Untuk memastikan konsistensi dengan server
    mutatePost();
  }, [mutateComments, mutatePost]);


  const [isLiking, setIsLiking] = useState(false);

  const handleLikeUnlike = async () => {
    if (isLiking || !post || !isClient) return;
    setIsLiking(true);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      console.error("Anda harus login untuk menyukai postingan.");
      setIsLiking(false);
      // Idealnya, tampilkan pesan ke pengguna atau redirect ke login
      return;
    }

    const originalLiked = post.is_liked_by_me;
    const originalLikesCount = post.like_count;

    // Optimistic update
    mutatePost(
        {
            ...post,
            is_liked_by_me: !post.is_liked_by_me,
            like_count: post.is_liked_by_me ? post.like_count -1 : post.like_count + 1
        },
        false // jangan revalidate dulu
    );

    try {
      const method = originalLiked ? 'DELETE' : 'POST';
      const response = await fetch(`/api/posts/${post.id}/likes`, {
        method: method,
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        // Rollback optimistic update jika gagal
        mutatePost(
            {
                ...post,
                is_liked_by_me: originalLiked,
                like_count: originalLikesCount,
            },
            false
        );
        // throw new Error('Gagal mengubah status like'); // Bisa dilempar untuk ditangani UI
        console.error("Gagal mengubah status like dari server");
      }
      // Revalidate dengan server setelah sukses atau untuk memastikan konsistensi
      mutatePost();
    } catch (error) {
      console.error("Error like/unlike:", error);
      // Rollback optimistic update jika ada network error
      mutatePost(
        {
            ...post,
            is_liked_by_me: originalLiked,
            like_count: originalLikesCount,
        },
        false
      );
      mutatePost(); // Revalidate untuk data terbaru
    } finally {
      setIsLiking(false);
    }
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!commentContent.trim() || !post || !isClient) return;
    setIsSubmittingComment(true);
    setCommentError(null);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setCommentError("Anda harus login untuk berkomentar.");
      setIsSubmittingComment(false);
      return;
    }

    try {
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content: commentContent }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Gagal mengirim komentar');
      }
      setCommentContent(''); // Kosongkan textarea
      setShowSuggestionsComment(false); // Tutup sugesti jika terbuka
      setMentionQueryComment(null); // Reset query mention
      mutateComments();
      mutatePost();
    } catch (err: any) {
      setCommentError(err.message);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Handler untuk perubahan konten textarea komentar (untuk mention)
  const handleCommentContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = event.target.value;
    setCommentContent(newContent);

    const cursorPos = event.target.selectionStart;
    if (cursorPos === null) { setShowSuggestionsComment(false); setMentionQueryComment(null); return; }
    const textBeforeCursor = newContent.substring(0, cursorPos);
    const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');
    const charBeforeAt = lastAtSymbolIndex > 0 ? textBeforeCursor[lastAtSymbolIndex - 1] : ' ';

    if (lastAtSymbolIndex !== -1 && (/\s/.test(charBeforeAt) || lastAtSymbolIndex === 0)) {
      const potentialQuery = textBeforeCursor.substring(lastAtSymbolIndex + 1);
      // Cek apakah setelah query ada spasi, jika iya, jangan tampilkan suggestion
      const textAfterQueryAttempt = newContent.substring(lastAtSymbolIndex + 1);
      if (textAfterQueryAttempt.includes(' ')) {
          const partBeforeSpace = textAfterQueryAttempt.split(' ')[0];
          if(potentialQuery === partBeforeSpace && potentialQuery.length > 0 && !potentialQuery.includes(' ')){
            // ini kasus ketika query sudah selesai diketik dan diikuti spasi
          } else {
            // Jika ada spasi di tengah query, atau setelah query, jangan trigger.
            // Kecuali jika query nya memang valid (tidak ada spasi di tengahnya)
            // dan yang sedang di-query adalah `potentialQuery`
            if (!/\s/.test(potentialQuery)) { // Jika query itu sendiri tidak mengandung spasi
                setMentionQueryComment(potentialQuery);
                setShowSuggestionsComment(true);
                // setActiveSuggestionIndexComment(0); // Dikelola di useEffect
            } else {
                //  Ada spasi di dalam potentialQuery, berarti bukan query valid
                setShowSuggestionsComment(false); setMentionQueryComment(null);
            }
            return;
          }

      }


      if (!/\s/.test(potentialQuery)) { // Query valid jika tidak ada spasi di dalamnya
        setMentionQueryComment(potentialQuery);
        setShowSuggestionsComment(true);
        // setActiveSuggestionIndexComment(0); // Sudah di useEffect
      } else if (potentialQuery.trim().length > 0 && /\s/.test(potentialQuery)) {
        // Jika ada spasi dan itu bukan di akhir (mis. '@user name')
        setShowSuggestionsComment(false); setMentionQueryComment(null);
      } else if (potentialQuery.length === 0 && newContent[cursorPos-1] === '@') {
        setMentionQueryComment(''); setShowSuggestionsComment(true);
        // setActiveSuggestionIndexComment(0); // Sudah di useEffect
      }
       else { // Query tidak valid atau sudah selesai (diikuti spasi)
        setShowSuggestionsComment(false); setMentionQueryComment(null);
      }
    } else { // Tidak ada '@' atau tidak valid posisinya
      setShowSuggestionsComment(false); setMentionQueryComment(null);
    }
  };

  // Handler untuk klik pada sugesti mention di komentar
  const handleCommentSuggestionClick = (usernameToInsert: string) => {
    if (!commentTextareaRef.current) return;
    const currentContent = commentTextareaRef.current.value;
    let cursorPos = commentTextareaRef.current.selectionStart;
    if (cursorPos === null) return;

    let textBeforeCursor = currentContent.substring(0, cursorPos);
    let lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');

    const charBeforeAt = lastAtSymbolIndex > 0 ? textBeforeCursor[lastAtSymbolIndex - 1] : ' ';
    if (lastAtSymbolIndex === -1 || !(/\s/.test(charBeforeAt) || lastAtSymbolIndex === 0)) {
        setShowSuggestionsComment(false); setMentionQueryComment(null); return;
    }
    
    const textBeforeMentionQuery = currentContent.substring(0, lastAtSymbolIndex);
    // Cari query yang sebenarnya sedang aktif untuk tahu berapa panjangnya dan apa teks setelahnya
    const oldQuery = mentionQueryComment || "";
    const textAfterOldQuery = currentContent.substring(lastAtSymbolIndex + 1 + oldQuery.length);

    const newContent = `${textBeforeMentionQuery}@${usernameToInsert} ${textAfterOldQuery.startsWith(' ') ? textAfterOldQuery.substring(1) : textAfterOldQuery}`;
    setCommentContent(newContent);

    const newCursorPos = textBeforeMentionQuery.length + `@${usernameToInsert} `.length;
    setTimeout(() => {
      commentTextareaRef.current?.focus();
      commentTextareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);

    setShowSuggestionsComment(false);
    setMentionQueryComment(null);
  };

  // Handler untuk keydown pada textarea komentar (navigasi mention)
  const handleKeyDownOnCommentTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestionsComment && userSuggestionsComment.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndexComment(prev => (prev + 1) % userSuggestionsComment.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndexComment(prev => (prev - 1 + userSuggestionsComment.length) % userSuggestionsComment.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
         // Hanya trigger jika ada suggestion yang valid (bukan "Tidak ada pengguna")
        if (activeSuggestionIndexComment >= 0 && activeSuggestionIndexComment < userSuggestionsComment.length && userSuggestionsComment[activeSuggestionIndexComment]) {
          e.preventDefault();
          handleCommentSuggestionClick(userSuggestionsComment[activeSuggestionIndexComment].username);
        } else if (e.key === 'Enter' && !e.shiftKey) {
            // Biarkan default Enter (submit form) jika tidak ada suggestion valid
        } else if (e.key === 'Tab') {
            e.preventDefault(); // Selalu prevent default untuk Tab jika suggestions ada
            // Bisa ditambahkan logika fallback jika tidak ada suggestion valid
        }

      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestionsComment(false);
        setMentionQueryComment(null);
      }
    }
  };

  // useEffect untuk menutup sugesti jika klik di luar
  useEffect(() => {
    function handleClickOutsideCommentSuggestions(event: MouseEvent) {
      if (
        commentSuggestionsRef.current && !commentSuggestionsRef.current.contains(event.target as Node) &&
        commentTextareaRef.current && !commentTextareaRef.current.contains(event.target as Node)
      ) {
        setShowSuggestionsComment(false);
      }
    }
    if (showSuggestionsComment) {
      document.addEventListener("mousedown", handleClickOutsideCommentSuggestions);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutsideCommentSuggestions);
    };
  }, [showSuggestionsComment]);

  // useEffect untuk mereset activeSuggestionIndexComment ketika sugesti muncul/berubah
  useEffect(() => {
    if (showSuggestionsComment && userSuggestionsComment.length > 0) {
        setActiveSuggestionIndexComment(0);
    }
  }, [showSuggestionsComment, userSuggestionsComment]);


  if (!isClient || isLoadingPost) {
    return <p className="text-center mt-10 text-gray-600 text-lg">Memuat postingan...</p>;
  }
  
  if (postError) {
    // @ts-ignore
    if (postError.status === 403 || postError.status === 404) {
        // @ts-ignore
      return <div className="text-center mt-10 px-4">
                <h2 className="text-2xl font-semibold text-red-600 mb-2">Akses Ditolak atau Postingan Tidak Ditemukan</h2>
                {/* @ts-ignore */}
                <p className="text-gray-700">{postError.message || "Anda mungkin tidak memiliki izin untuk melihat postingan ini, atau postingan tersebut telah dihapus."}</p>
                <button onClick={() => router.back()} className="mt-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                    Kembali
                </button>
             </div>;
    }
    // @ts-ignore
    return <p className="text-center text-red-500 mt-10">Error memuat postingan: {postError.message}</p>;
  }
  if (!post) {
    return <p className="text-center mt-10">Postingan tidak ditemukan.</p>;
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      {/* Bagian Detail Postingan Utama */}
      <div className="bg-white shadow-lg rounded-xl p-4 sm:p-6 mb-8 border border-gray-200">
        <div className="flex items-center mb-4">
          <Link href={`/profile/${post.author_username}`}>
            {post.author_profile_picture_url ? (
              <Image src={post.author_profile_picture_url} alt={post.author_username} width={48} height={48} className="rounded-full w-12 h-12 mr-3 sm:mr-4 object-cover"/>
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold mr-3 sm:mr-4 text-xl">
                {post.author_username?.substring(0,1).toUpperCase()}
              </div>
            )}
          </Link>
          <div>
            <Link href={`/profile/${post.author_username}`} className="font-bold text-md sm:text-lg text-gray-900 hover:text-blue-700">
              {post.author_full_name || post.author_username}
            </Link>
            <p className="text-xs sm:text-sm text-gray-500">{new Date(post.created_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</p>
            {post.created_at !== post.updated_at && <p className="text-xs text-gray-400 italic">(diedit)</p>}
          </div>
          {isClient && loggedInUser?.id === post.author_id && (
            <div className="ml-auto space-x-2">
              {/* Tombol Edit/Hapus Post (jika diperlukan di sini) */}
            </div>
          )}
        </div>
        <p className="text-gray-800 text-base mb-4 whitespace-pre-wrap leading-relaxed">{post.content}</p>
        {post.image_url && (
          <div className="mb-4 rounded-lg overflow-hidden shadow bg-gray-100">
            <Image src={post.image_url} alt="Post image" width={800} height={600} className="w-full h-auto object-contain max-h-[70vh]" />
          </div>
        )}
        {post.video_url && (
            <div className="mb-4 rounded-lg overflow-hidden shadow bg-black">
                <video src={post.video_url} controls className="w-full h-auto max-h-[70vh] object-contain"></video>
            </div>
        )}

        <div className="flex items-center text-gray-600 text-sm space-x-6 py-3 border-t border-b border-gray-200 mt-4">
          <button onClick={handleLikeUnlike} disabled={isLiking || !isClient || !loggedInUser} className={`flex items-center hover:text-red-600 transition-colors ${post.is_liked_by_me ? 'text-red-500 font-semibold' : 'text-gray-500'} ${!loggedInUser ? 'cursor-not-allowed opacity-60' : ''}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-1.5 ${isLiking && post.is_liked_by_me ? 'animate-ping opacity-0' : ''} ${isLiking && !post.is_liked_by_me ? 'animate-ping' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg>
            {post.like_count} Suka
          </button>
          <div className="flex items-center text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.74 8.74 0 01-4.26-1.056L4.43 17.57A1 1 0 013 16.57V13a8.004 8.004 0 01-1-4.007A8.01 8.01 0 012 9c0-4.418 3.582-8 8-8s8 3.582 8 8zm-3-1a1 1 0 10-2 0v1a1 1 0 102 0v-1zm-4 0a1 1 0 10-2 0v1a1 1 0 102 0v-1zm-4 0a1 1 0 10-2 0v1a1 1 0 102 0v-1z" clipRule="evenodd" /></svg>
            {post.comment_count} Komentar
          </div>
        </div>
      </div>

      {/* Bagian Form Tambah Komentar */}
      {isClient && (
        <div className="bg-white shadow-lg rounded-xl p-4 sm:p-6 mb-8 border border-gray-200">
          <h3 className="text-md font-semibold text-gray-700 mb-3">Tambahkan Komentar Anda</h3>
          <form onSubmit={handleCommentSubmit}>
            <div className="relative"> {/* Wrapper untuk posisi absolut sugesti */}
              <textarea
                ref={commentTextareaRef}
                rows={3}
                className="w-full p-2.5 border text-black border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm placeholder-gray-400"
                placeholder={loggedInUser ? "Tulis komentar Anda... Ketik @ untuk mention..." : "Login untuk berkomentar..."}
                value={commentContent}
                onChange={handleCommentContentChange}
                onKeyDown={handleKeyDownOnCommentTextarea}
                disabled={isSubmittingComment || !loggedInUser}
              />
              {showSuggestionsComment && (
                <ul ref={commentSuggestionsRef} className="absolute z-20 mt-1 w-full bg-white shadow-lg max-h-48 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                  {isLoadingSuggestionsComment && <li className="text-gray-500 px-3 py-2 text-xs">Mencari pengguna...</li>}
                  {/* @ts-ignore */}
                  {suggestionsErrorComment && <li className="text-red-500 px-3 py-2 text-xs">Gagal memuat sugesti: {suggestionsErrorComment.message}</li>}
                  {!isLoadingSuggestionsComment && !suggestionsErrorComment && userSuggestionsComment.length === 0 && mentionQueryComment && mentionQueryComment.length >= 0 && ( // Allow empty query to show "no user"
                    <li className="text-gray-500 px-3 py-2 text-xs">Tidak ada pengguna ditemukan untuk "{mentionQueryComment}".</li>
                  )}
                  {userSuggestionsComment.map((user, index) => (
                    <li
                      key={user.id}
                      onClick={() => handleCommentSuggestionClick(user.username)}
                      onMouseDown={(e) => e.preventDefault()}
                      className={`text-gray-900 cursor-pointer select-none relative py-2 px-3 hover:bg-blue-100 group text-sm ${index === activeSuggestionIndexComment ? 'bg-blue-100' : ''}`}
                    >
                      <div className="flex items-center">
                        {user.profile_picture_url ? (
                          <Image src={user.profile_picture_url} alt={user.username} width={24} height={24} className="w-6 h-6 rounded-full mr-2 object-cover flex-shrink-0"/>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-300 mr-2 flex-shrink-0 flex items-center justify-center text-white text-xs">
                            {user.username.substring(0,1).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium block truncate">{user.full_name || user.username}</span>
                        <span className="ml-1 text-xs text-gray-500 group-hover:text-blue-700">@{user.username}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {commentError && <p className="text-xs text-red-500 mt-1">{commentError}</p>}
            <div className="text-right mt-3">
              <button type="submit" disabled={isSubmittingComment || !commentContent.trim() || !loggedInUser}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
                {isSubmittingComment ? "Mengirim..." : "Kirim Komentar"}
              </button>
            </div>
          </form>
        </div>
      )}


      {/* Bagian Daftar Komentar */}
      <div className="bg-white shadow-lg rounded-xl p-4 sm:p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Komentar ({post.comment_count || 0})</h3>
        {isLoadingComments && isClient && <p className="text-sm text-gray-500">Memuat komentar...</p>}
        {/* @ts-ignore */}
        {commentsError && <p className="text-red-500 text-sm">Gagal memuat komentar: {commentsError.message}</p>}
        
        {isClient && displayComments && displayComments.length > 0 ? (
          <div className="space-y-0"> {/* Mengurangi space-y agar border antar comment item lebih rapat */}
            {displayComments.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                loggedInUserId={loggedInUser?.id || null}
                onCommentUpdated={handleCommentUpdated}
                onCommentDeleted={handleCommentDeleted}
              />
            ))}
          </div>
        ) : (
          !isLoadingComments && isClient && <p className="text-gray-500 text-sm">Belum ada komentar. Jadilah yang pertama!</p>
        )}
        {!isClient && !isLoadingComments && <p className="text-sm text-gray-500">Memuat komentar...</p>}
      </div>
    </div>
  );
}