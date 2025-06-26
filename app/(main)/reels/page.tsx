// src/app/(main)/reels/page.tsx
"use client";

import { useEffect, useState, useRef, forwardRef, FormEvent, useCallback } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import Link from 'next/link';
import Image from 'next/image';
import { useInView } from 'react-intersection-observer';
import { 
  HeartIcon as HeartIconOutline, 
  ChatBubbleOvalLeftEllipsisIcon as CommentIconOutline, 
  ShareIcon as ShareIconOutline, 
  SpeakerWaveIcon, 
  SpeakerXMarkIcon, 
  PlayIcon 
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid, PaperAirplaneIcon } from '@heroicons/react/24/solid';

// --- Tipe Data ---
interface ReelData {
  id: number;
  content: string | null;
  video_url: string;
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
interface CommentData {
  id: number;
  content: string;
  created_at: string;
  author_username: string;
  author_profile_picture_url: string | null;
}
interface LoggedInUser { id: number; username: string; }

// --- Fungsi Fetcher ---
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, { headers: { ...(token && { 'Authorization': `Bearer ${token}` }) } });
  if (!res.ok) {
    const error = new Error('Gagal mengambil data.');
    throw error;
  }
  return res.json();
};

// --- Komponen ReelCard (Video Player + Tombol Aksi Mobile) ---
interface ReelCardProps {
  reel: ReelData;
  onInView: () => void;
  isMuted: boolean;
  toggleMute: (e: React.MouseEvent) => void;
  onInteraction: () => void; // Callback untuk revalidasi
  loggedInUserId: number | null;
}

const ReelCard = forwardRef<HTMLDivElement, ReelCardProps>(({ reel, onInView, isMuted, toggleMute, onInteraction, loggedInUserId }, ref) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [isLikedLocally, setIsLikedLocally] = useState(reel.is_liked_by_me);
  const [localLikeCount, setLocalLikeCount] = useState(reel.like_count);

  useEffect(() => {
    setIsLikedLocally(reel.is_liked_by_me);
    setLocalLikeCount(reel.like_count);
  }, [reel.is_liked_by_me, reel.like_count]);

  const { ref: intersectionRef, inView } = useInView({ threshold: 0.7 });

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (inView) {
        onInView();
        video.play().catch(e => console.error("Autoplay gagal:", e));
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    }
  }, [inView, reel, onInView]);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) videoRef.current.play(); else videoRef.current.pause();
      setIsPlaying(!videoRef.current.paused);
    }
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!loggedInUserId) { alert("Silakan login untuk menyukai video."); return; }

    const originalLikedState = isLikedLocally;
    const originalLikeCount = localLikeCount;
    setIsLikedLocally(!originalLikedState);
    setLocalLikeCount(originalLikedState ? localLikeCount - 1 : localLikeCount + 1);

    try {
      const token = localStorage.getItem('jwtToken');
      const method = originalLikedState ? 'DELETE' : 'POST';
      const response = await fetch(`/api/posts/${reel.id}/likes`, { method, headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) { // Jika gagal, kembalikan state
        setIsLikedLocally(originalLikedState);
        setLocalLikeCount(originalLikeCount);
      }
      onInteraction(); // Panggil revalidasi di parent
    } catch (error) {
      setIsLikedLocally(originalLikedState);
      setLocalLikeCount(originalLikeCount);
      console.error("Gagal like/unlike reel:", error);
    }
  };

  const setRefs = useCallback((node: HTMLDivElement) => {
    // @ts-ignore
    if (typeof ref === 'function') { ref(node); } else if (ref) { ref.current = node; }
    intersectionRef(node);
  }, [ref, intersectionRef]);

  return (
    <div ref={setRefs} className="h-full w-full relative snap-start flex items-center justify-center bg-black">
      <video ref={videoRef} onClick={togglePlayPause} loop playsInline muted={isMuted} src={reel.video_url} className="w-full h-full object-contain" />
      
      {!isPlaying && <div className="absolute inset-0 flex justify-center items-center pointer-events-none"><PlayIcon className="w-20 h-20 text-white/50" /></div>}
      
      <div className="absolute top-4 right-4 z-10"><button onClick={toggleMute} className="p-2 bg-black/40 rounded-full">{isMuted ? <SpeakerXMarkIcon className="w-6 h-6 text-white" /> : <SpeakerWaveIcon className="w-6 h-6 text-white" />}</button></div>

      <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 text-white bg-gradient-to-t from-black/70 to-transparent flex justify-between items-end">
        {/* Info Pengguna & Caption */}
        <div className="flex-1 min-w-0 pr-10">
          <Link href={`/profile/${reel.author_username}`} className="flex items-center gap-2 mb-2 w-fit">
            {reel.author_profile_picture_url ? <Image src={reel.author_profile_picture_url} alt={reel.author_username} width={40} height={40} className="rounded-full object-cover w-10 h-10 w-10 h-10 w-10 h-10"/> : <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center text-lg">{reel.author_username.substring(0,1).toUpperCase()}</div>}
            <p className="font-semibold text-white text-sm">{reel.author_username}</p>
          </Link>
          {reel.content && <p className="text-sm whitespace-pre-wrap">{reel.content}</p>}
        </div>

        {/* Tombol Aksi di Samping (untuk semua ukuran layar) */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center">
            <button onClick={handleLike} className="p-3 bg-black/40 rounded-full">
              {isLikedLocally ? <HeartIconSolid className="w-7 h-7 text-red-500"/> : <HeartIconOutline className="w-7 h-7 text-white"/>}
            </button>
            <span className="text-xs font-semibold text-white mt-1">{localLikeCount}</span>
          </div>
          <div className="flex flex-col items-center">
            <Link href={`/post/${reel.id}`} className="p-3 bg-black/40 rounded-full">
              <CommentIconOutline className="w-7 h-7 text-white"/>
            </Link>
            <span className="text-xs font-semibold text-white mt-1">{reel.comment_count}</span>
          </div>
          <div className="flex flex-col items-center">
            <button className="p-3 bg-black/40 rounded-full"><ShareIconOutline className="w-7 h-7 text-white"/></button>
          </div>
        </div>
      </div>
    </div>
  );
});
ReelCard.displayName = "ReelCard";

// --- Komponen ReelDetailSidebar (Hanya untuk Desktop) ---
interface ReelDetailSidebarProps { 
  reel: ReelData | null; 
  loggedInUserId: number | null;
  onInteraction: () => void;
}
function ReelDetailSidebar({ reel, loggedInUserId, onInteraction }: ReelDetailSidebarProps) {
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const { data: comments, error: commentsError, isLoading: isLoadingComments, mutate: mutateComments } = useSWR<CommentData[]>(
    reel ? `/api/posts/${reel.id}/comments` : null, fetcher
  );

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault(); if (!newComment.trim() || !reel) return; setIsSubmittingComment(true);
    const token = localStorage.getItem('jwtToken'); if (!token) return;
    try {
      await fetch(`/api/posts/${reel.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ content: newComment })});
      setNewComment(''); mutateComments();
    } catch (error) { console.error("Gagal mengirim komentar:", error); } 
    finally { setIsSubmittingComment(false); }
  };
  
  if (!reel) {
    return <div className="h-full bg-white rounded-r-lg border-l border-gray-200 flex flex-col justify-center items-center text-gray-400 p-4 text-center"><p>Pilih atau scroll video di sebelah kiri untuk melihat detail & komentar.</p></div>;
  }
  
  return (
    <div className="h-full bg-white rounded-r-lg border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
        <Link href={`/profile/${reel.author_username}`} className="flex items-center gap-3">
          {reel.author_profile_picture_url ? <Image src={reel.author_profile_picture_url} alt={reel.author_username} width={40} height={40} className="rounded-full object-cover w-10 h-10"/> : <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center font-semibold text-white">{reel.author_username.substring(0,1).toUpperCase()}</div>}
          <div><p className="font-semibold text-black text-sm">{reel.author_username}</p><p className="text-xs text-gray-500">{reel.author_full_name}</p></div>
        </Link>
      </div>

      <div className="flex-grow overflow-y-auto text-black p-4 space-y-4 no-scrollbar">
        {commentsError && <p className="text-xs text-red-500">Gagal memuat komentar.</p>}
        {!comments && isLoadingComments && <p className="text-xs text-gray-500">Memuat komentar...</p>}
        {comments?.map(comment => (
          <div key={comment.id} className="flex items-start gap-2.5">
            <Link href={`/profile/${comment.author_username}`}><Image src={comment.author_profile_picture_url || '/placeholder-avatar.png'} alt={comment.author_username} width={28} height={28} className="rounded-full object-cover w-10 h-10 w-10 h-10"/></Link>
            <div><p className="text-xs"><Link href={`/profile/${comment.author_username}`} className="font-semibold mr-1">{comment.author_username}</Link><span className="whitespace-pre-wrap">{comment.content}</span></p></div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t bg-gray-50 flex-shrink-0">
        <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
            <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Tambahkan komentar..." className="flex-1 bg-gray-100 text-black border-gray-200 rounded-full px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"/>
            <button type="submit" disabled={isSubmittingComment || !newComment.trim()} className="p-2 text-blue-600 disabled:text-gray-400"><PaperAirplaneIcon className="w-6 h-6"/></button>
        </form>
      </div>
    </div>
  );
}

// --- Halaman Reels Utama ---
const getKey = (pageIndex: number, previousPageData: ReelData[] | null): string | null => {
  if (previousPageData && !previousPageData.length) return null;
  return `/api/reels?page=${pageIndex + 1}&limit=3`;
};

export default function ReelsPage() {
  const [isClient, setIsClient] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [isMuted, setIsMuted] = useState(true);

  const { data, error, size, setSize, isLoading, mutate } = useSWRInfinite<ReelData[]>(
    (...args) => isClient ? getKey(...args) : null, fetcher
  );

  const reels = data ? data.flat() : [];
  const [activeReel, setActiveReel] = useState<ReelData | null>(null);
  const { ref: loadMoreRef, inView } = useInView({ threshold: 0.5 }); 

  useEffect(() => {
    setIsClient(true);
    const userData = localStorage.getItem('userData');
    if (userData) { try { setLoggedInUser(JSON.parse(userData)); } catch(e) { console.error("Error parsing user data", e); }}
  }, []);

  useEffect(() => { if (!activeReel && reels.length > 0) setActiveReel(reels[0]); }, [reels, activeReel]);
  useEffect(() => { if (inView && !isLoading) setSize(size + 1); }, [inView, isLoading, setSize]);
  
  const handleInteraction = () => { mutate(); };
  const toggleGlobalMute = (e: React.MouseEvent) => { e.stopPropagation(); setIsMuted(!isMuted); };
  
  if (!isClient) return <div className="flex justify-center items-center h-[calc(100vh-8rem)] w-full bg-gray-100"><p className="text-gray-500">Memuat Reels...</p></div>;

  return (
    <div className="flex justify-center w-full bg-gray-100 py-4 px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8 w-full max-w-7xl h-[calc(100vh-8rem)] min-h-[600px] max-h-[880px]">
            <div className="flex-1 flex justify-center items-center h-full">
                <div className="relative h-full w-full max-w-[420px] bg-black rounded-2xl shadow-lg overflow-hidden">
                    <div className="h-full w-full snap-y snap-mandatory overflow-y-scroll overflow-x-hidden no-scrollbar">
                        {reels.map((reel, index) => (
                            <ReelCard 
                                key={`${reel.id}-${index}`}
                                reel={reel}
                                onInView={() => setActiveReel(reel)}
                                isMuted={isMuted}
                                toggleMute={toggleGlobalMute}
                                ref={index === reels.length - 1 ? loadMoreRef : null}
                                loggedInUserId={loggedInUser?.id || null}
                                onInteraction={handleInteraction}
                            />
                        ))}
                        {isLoading && reels.length > 0 && (
                            <div className="h-20 w-full flex justify-center items-center snap-start text-white">
                                <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            </div>
                        )}
                        {!isLoading && <div ref={loadMoreRef} className="h-1 w-full"></div>}
                        {error && !isLoading && <div className="h-full w-full flex justify-center items-center snap-start text-white p-4 text-center">Gagal memuat Reels.</div>}
                        {!isLoading && reels.length === 0 && <div className="h-full w-full flex justify-center items-center snap-start text-white p-4 text-center">Belum ada Reels untuk ditampilkan.</div>}
                    </div>
                </div>
            </div>
            <div className="hidden md:block w-[350px] lg:w-[400px] xl:w-[450px] h-full flex-shrink-0">
               <ReelDetailSidebar reel={activeReel} loggedInUserId={loggedInUser?.id || null} onInteraction={handleInteraction}/>
            </div>
        </div>
    </div>
  );
}
