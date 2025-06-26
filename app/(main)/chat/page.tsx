// src/app/(main)/chat/page.tsx
"use client";

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';

// Tipe data untuk ChatRoom yang diterima dari API GET /api/chat/rooms
interface ChatRoomListData {
  id: number; // Room ID
  last_message_at: string;
  other_user_id: number;
  other_username: string;
  other_profile_picture_url: string | null;
  // Anda bisa menambahkan last_message_preview jika API mengirimkannya nanti
}

// Fungsi fetcher global (bisa diimpor jika sudah ada)
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  if (!token) {
    if (typeof window !== "undefined") (window.location.href = '/login');
    throw new Error('Autentikasi dibutuhkan.');
  }
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    let errorData;
    try {
        errorData = await res.json();
    } catch(e) {
        errorData = { message: `Request gagal dengan status ${res.status}`};
    }
    const error = new Error(errorData.message || 'Gagal mengambil data chat.');
    // @ts-ignore
    error.status = res.status;
    if (res.status === 401) {
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('userData');
        if (typeof window !== "undefined") (window.location.href = '/login');
    }
    throw error;
  }
  return res.json();
};

export default function ChatListPage() {
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // State untuk menandai room mana yang aktif (berguna untuk styling)
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);

  useEffect(() => {
    setIsClient(true);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        router.replace('/login');
    }
    // Cek jika URL memiliki query param untuk membuka chat tertentu
    const roomIdFromQuery = searchParams.get('roomId');
    if (roomIdFromQuery && !isNaN(parseInt(roomIdFromQuery, 10))) {
        setActiveRoomId(parseInt(roomIdFromQuery, 10));
    }
  }, [router, searchParams]);

  const { 
    data: chatRooms, 
    error, 
    isLoading 
  } = useSWR<ChatRoomListData[]>(
    isClient ? '/api/chat/rooms' : null, // Hanya fetch jika sudah di client
    fetcher,
    {
        refreshInterval: 10000, // Revalidasi setiap 10 detik untuk update daftar percakapan
    }
  );

  const handleRoomClick = (roomId: number) => {
    setActiveRoomId(roomId);
    router.push(`/chat/${roomId}`);
  };

  // Tampilan Loading Awal
  if (!isClient || (isLoading && !chatRooms)) {
    return (
      <div className="container mx-auto p-4 pt-6 md:pt-10 max-w-xl">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">Percakapan</h1>
        {/* Skeleton Loader Sederhana */}
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 bg-white rounded-lg shadow-md flex items-center space-x-4 animate-pulse">
              <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                <div className="h-3 bg-gray-300 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Tampilan Error
  if (error) {
    // @ts-ignore
    const errorMessage = error.message || "Gagal memuat daftar percakapan.";
    return (
        <div className="container mx-auto p-4 pt-6 md:pt-10 max-w-xl">
            <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">Percakapan</h1>
            <p className="text-red-500 p-4 bg-red-50 border border-red-200 rounded-lg">Error: {errorMessage}</p>
        </div>
    );
  }

  // Tampilan Utama
  return (
    <div className="container mx-auto p-4 pt-6 md:pt-10 max-w-xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Percakapan Anda</h1>
        {/* Tombol untuk memulai chat baru dari daftar teman bisa ditambahkan di sini */}
        <button onClick={() => router.push('/search/users')} className="text-sm font-medium text-blue-600 hover:underline">
          + Chat Baru
        </button>
      </div>

      {!chatRooms || chatRooms.length === 0 ? (
        <div className="text-center py-16 px-6 bg-white rounded-lg shadow-md border">
            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 5.523-4.477 10-10 10S1 17.523 1 12 5.477 2 12 2s10 4.477 10 10z" /></svg>
            <h3 className="mt-2 text-sm font-semibold text-gray-900">Tidak Ada Percakapan</h3>
            <p className="mt-1 text-sm text-gray-500">Mulai percakapan dari halaman profil teman.</p>
        </div>
      ) : (
        <div className="bg-white shadow-xl rounded-lg border border-gray-200">
          <ul className="divide-y divide-gray-200">
            {chatRooms.map((room) => (
              <li key={room.id} 
                  className={`transition-colors duration-150 ${activeRoomId === room.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <Link href={`/chat/${room.id}`} className="block p-3 sm:p-4 cursor-pointer" onClick={(e) => {
                  e.preventDefault(); // Cegah navigasi default Link
                  handleRoomClick(room.id); // Gunakan router.push agar lebih terkontrol
                }}>
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 relative">
                      {room.other_profile_picture_url ? (
                        <Image
                          src={room.other_profile_picture_url}
                          alt={room.other_username}
                          width={48}
                          height={48}
                          className="rounded-full object-cover w-12 h-12"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold text-lg">
                          {room.other_username?.substring(0, 1).toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {room.other_username}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        Aktivitas terakhir: {new Date(room.last_message_at).toLocaleString('id-ID', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          timeZone: 'Asia/Jakarta'
                        })}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
