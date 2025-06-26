// src/components/Reels/ReelCard.tsx
"use client";

import { useState, useRef, useEffect, forwardRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HeartIcon, ChatBubbleOvalLeftEllipsisIcon, ShareIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';

// Tipe data Reel dari props
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

interface ReelCardProps {
  reel: ReelData;
}

const ReelCard = forwardRef<HTMLDivElement, ReelCardProps>(({ reel }, ref) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // State untuk mengontrol volume
  
  // State untuk interaksi, sama seperti di PostCard
  const [currentLikes, setCurrentLikes] = useState(reel.like_count);
  const [isLiked, setIsLiked] = useState(reel.is_liked_by_me);

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  // Fungsi untuk menaikkan/menurunkan volume
  const toggleMute = () => {
    if (videoRef.current) {
        const currentlyMuted = !isMuted;
        videoRef.current.muted = currentlyMuted;
        setIsMuted(currentlyMuted);
    }
  };

  // Logika untuk auto-play saat masuk viewport
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          videoElement.play().catch(e => console.error("Autoplay gagal:", e));
          setIsPlaying(true);
        } else {
          videoElement.pause();
          setIsPlaying(false);
        }
      },
      { threshold: 0.5 } // Anggap video "terlihat" jika 50% masuk viewport
    );

    observer.observe(videoElement);
    return () => observer.disconnect();
  }, []);

  const handleLike = async () => {
    const token = localStorage.getItem('jwtToken');
    if (!token) return; // Atau tampilkan pesan login

    const originalLikedState = isLiked;
    const originalLikeCount = currentLikes;

    // Optimistic Update
    setIsLiked(!originalLikedState);
    setCurrentLikes(originalLikedState ? currentLikes - 1 : currentLikes + 1);

    try {
      const method = originalLikedState ? 'DELETE' : 'POST';
      const response = await fetch(`/api/posts/${reel.id}/likes`, {
        method,
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        // Rollback jika gagal
        setIsLiked(originalLikedState);
        setCurrentLikes(originalLikeCount);
      } else {
        const data = await response.json();
        setCurrentLikes(data.totalLikes); // Update dengan data dari server
      }
    } catch (error) {
      // Rollback jika gagal
      setIsLiked(originalLikedState);
      setCurrentLikes(originalLikeCount);
      console.error("Gagal like/unlike reel:", error);
    }
  };

  return (
    // Container utama: Penuh di mobile, background hitam di desktop
    <div ref={ref} className="h-full w-full relative snap-start flex items-center justify-center lg:bg-black">
      
      {/* ===== DESKTOP LAYOUT WRAPPER ===== */}
      {/* Wrapper ini mengatur layout berdampingan di desktop */}
      <div className="w-full h-full lg:h-auto lg:w-auto lg:flex lg:flex-row lg:items-start lg:gap-4">

        {/* --- Video Container (Kiri di Desktop) --- */}
        {/* Di desktop, container ini membatasi ukuran video dan memberinya sudut membulat */}
        <div className="relative w-full h-full lg:w-auto lg:h-[calc(100vh-120px)] lg:max-h-[85vh] lg:rounded-2xl overflow-hidden bg-white">
          <video
            ref={videoRef}
            onClick={togglePlay}
            loop
            playsInline // Penting untuk autoplay di beberapa browser mobile
            muted={isMuted} // Menggunakan state untuk mengontrol volume
            src={reel.video_url}
            // Objek 'cover' di mobile, 'contain' di desktop agar video utuh
            className="w-full h-full object-cover lg:object-contain"
          />

          {/* Tombol Volume (Tetap di atas video) */}
          <div className="absolute top-4 right-4 z-10">
              <button onClick={toggleMute} className="p-2 bg-black/40 hover:bg-black/60 rounded-full transition-colors">
                  {isMuted ? (
                      <SpeakerXMarkIcon className="w-6 h-6 text-white" />
                  ) : (
                      <SpeakerWaveIcon className="w-6 h-6 text-white" />
                  )}
              </button>
          </div>

          {/* --- Info & Caption (Overlay di Mobile, Tersembunyi di Desktop) --- */}
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white bg-gradient-to-t from-black/60 to-transparent lg:hidden">
            <Link href={`/profile/${reel.author_username}`} className="flex items-center gap-2 mb-2">
              {reel.author_profile_picture_url ? (
                  <Image src={reel.author_profile_picture_url} alt={reel.author_username} width={40} height={40} className="rounded-full object-cover w-10 h-10 border-2 border-white"/>
              ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center text-lg">{reel.author_username.substring(0,1).toUpperCase()}</div>
              )}
              <p className="font-semibold text-sm">{reel.author_username}</p>
            </Link>
            {reel.content && <p className="text-sm">{reel.content}</p>}
          </div>
        </div>

        {/* --- Kolom Aksi (Kanan di Desktop) --- */}
        <div className="
          absolute right-2 bottom-20 flex flex-col items-center gap-4 z-10
          lg:static lg:h-full lg:justify-end lg:bottom-auto lg:right-auto lg:pb-4
        ">
          {/* Info & Caption (Tampil di atas tombol aksi HANYA di Desktop) */}
          <div className="hidden lg:block w-full text-white mb-auto p-4 bg-gray-900/50 rounded-lg">
             <Link href={`/profile/${reel.author_username}`} className="flex items-center gap-3 mb-3">
              {reel.author_profile_picture_url ? (
                  <Image src={reel.author_profile_picture_url} alt={reel.author_username} width={48} height={48} className="rounded-full object-cover w-10 h-10"/>
              ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-xl">{reel.author_username.substring(0,1).toUpperCase()}</div>
              )}
              <div>
                <p className="font-semibold text-base">{reel.author_username}</p>
                {reel.author_full_name && <p className="text-sm text-gray-300">{reel.author_full_name}</p>}
              </div>
            </Link>
            {reel.content && <p className="text-sm text-gray-200 mt-2">{reel.content}</p>}
          </div>

          {/* Tombol Like */}
          <div className="flex flex-col items-center">
            {/* Tombol di mobile punya background, di desktop transparan */}
            <button onClick={handleLike} className="p-3 bg-black/30 lg:bg-gray-700/80 rounded-full lg:hover:bg-gray-600 transition-colors">
              {isLiked ? (
                <HeartIconSolid className="w-7 h-7 text-red-500"/>
              ) : (
                <HeartIcon className="w-7 h-7 text-white"/>
              )}
            </button>
            <span className="text-xs font-semibold text-white mt-1">{currentLikes}</span>
          </div>
          
          {/* Tombol Komentar */}
          <div className="flex flex-col items-center">
            <Link href={`/post/${reel.id}`} className="p-3 bg-black/30 lg:bg-gray-700/80 rounded-full lg:hover:bg-gray-600 transition-colors">
              <ChatBubbleOvalLeftEllipsisIcon className="w-7 h-7 text-white"/>
            </Link>
            <span className="text-xs font-semibold text-white mt-1">{reel.comment_count}</span>
          </div>

          {/* Tombol Share */}
          <div className="flex flex-col items-center">
            <button className="p-3 bg-black/30 lg:bg-gray-700/80 rounded-full lg:hover:bg-gray-600 transition-colors">
              <ShareIcon className="w-7 h-7 text-white"/>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
});

ReelCard.displayName = "ReelCard";
export default ReelCard;