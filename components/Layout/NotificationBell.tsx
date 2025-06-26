// src/components/Layout/NotificationBell.tsx
"use client";

import { useState, useEffect, useRef } from 'react';
import useSWR, { mutate } from 'swr'; // Impor mutate dari SWR
import Link from 'next/link';
import Image from 'next/image';
import { BellIcon } from '@heroicons/react/24/outline';

// Tipe data untuk Notifikasi (pastikan ini sesuai dengan respons API Anda)
interface NotificationData {
  id: number;
  actor_user_id: number | null;
  actor_username: string | null;
  actor_profile_picture_url: string | null;
  type: string; // e.g., 'FRIEND_REQUEST_RECEIVED', 'POST_LIKED', 'NEW_COMMENT', 'MENTION_IN_POST', 'MENTION_IN_COMMENT', 'REPLY_TO_COMMENT', 'NEW_CHAT_MESSAGE'
  target_entity_type: string | null; // 'POST', 'USER', 'CHAT_ROOM', 'COMMENT' (jika diperlukan)
  target_entity_id: number | null;
  is_read: boolean;
  message: string | null;
  created_at: string;
  // Jika notifikasi adalah untuk komentar atau mention di komentar, dan targetEntityType adalah 'COMMENT',
  // Anda mungkin perlu mengirimkan postId juga dari backend agar bisa membuat link yang benar.
  // Untuk saat ini, kita asumsikan targetEntityType untuk mention di komentar adalah 'POST' dan targetEntityId adalah postId.
}

interface NotificationApiResponse {
    notifications: NotificationData[];
    unreadCount: number;
    // Anda bisa menambahkan currentPage dan totalPages jika API mendukung paginasi penuh
}

// Fungsi fetcher (bisa diimpor jika sudah ada global)
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  // Jika tidak ada token, kembalikan data default agar SWR tidak error terus menerus
  if (!token && url.includes('/api/notifications')) { // Hanya untuk SWR notifikasi
    console.warn("NotificationBell: Tidak ada token, tidak mengambil notifikasi.");
    return { notifications: [], unreadCount: 0 };
  }
  const res = await fetch(url, { headers: { ...(token && { 'Authorization': `Bearer ${token}` }) } });
  if (!res.ok) {
    if (res.status === 401 && url.includes('/api/notifications')) { // Token tidak valid/kedaluwarsa
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('userData');
        // Pertimbangkan untuk tidak redirect keras dari fetcher, biarkan komponen UI menangani
        // if (typeof window !== "undefined") window.location.href = '/login'; 
        console.warn("NotificationBell: Token tidak valid saat fetch notifikasi.");
        return { notifications: [], unreadCount: 0 }; 
    }
    let errorData;
    try { errorData = await res.json(); } 
    catch(e) { errorData = {message: `Request gagal dengan status ${res.status}`}; }
    throw new Error(errorData.message || 'Gagal mengambil notifikasi.');
  }
  return res.json();
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null); // Ref untuk dropdown

  useEffect(() => {
    setIsClient(true);
    // Fungsi untuk menutup dropdown jika diklik di luar
    function handleClickOutside(event: MouseEvent) {
      const bellButton = document.getElementById('notification-bell-button');
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        bellButton && !bellButton.contains(event.target as Node) // Jangan tutup jika klik tombol lonceng lagi
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]); // Hanya bergantung pada isOpen

  const SWR_KEY = isClient ? '/api/notifications?limit=10' : null; // Ambil 10 notifikasi terbaru
  const { data: apiResponse, error, isLoading, mutate: mutateNotifications } = useSWR<NotificationApiResponse>(
    SWR_KEY,
    fetcher,
    { 
        refreshInterval: 15000, // Revalidasi setiap 15 detik (polling sederhana)
        onError: (err) => {
            console.error("SWR Error fetching notifications:", err.message);
        }
    } 
  );

  const notifications = apiResponse?.notifications || [];
  const unreadCount = apiResponse?.unreadCount || 0;

  const handleToggleDropdown = () => {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    // Jika dropdown dibuka dan ada notifikasi belum dibaca, tandai semua sudah dibaca
    if (newIsOpen && unreadCount > 0) {
      markAllAsRead();
    }
  };

  const markNotificationAsRead = async (notificationId: number) => {
    if (!isClient || !SWR_KEY) return;
    const token = localStorage.getItem('jwtToken');
    if (!token) return;

    // Optimistic UI Update
    mutateNotifications((currentData) => {
        if (!currentData) return currentData;
        const alreadyRead = currentData.notifications.find(n => n.id === notificationId)?.is_read;
        const updatedNotifications = currentData.notifications.map(n => 
            n.id === notificationId ? { ...n, is_read: true } : n
        );
        // Kurangi unreadCount hanya jika notifikasi tersebut sebelumnya belum dibaca
        const newUnreadCount = alreadyRead ? currentData.unreadCount : Math.max(0, currentData.unreadCount - 1) ;
        return { ...currentData, notifications: updatedNotifications, unreadCount: newUnreadCount };
    }, false); // false = jangan revalidate dari server dulu

    try {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Gagal update status notifikasi di server");
      // Revalidate setelah server update (opsional jika optimis update sudah cukup)
      mutateNotifications();
    } catch (err) {
      console.error("Gagal menandai notifikasi dibaca:", err);
      mutateNotifications(); // Rollback/revalidate
    }
  };
  
  const markAllAsRead = async () => {
    if (!isClient || unreadCount === 0 || !SWR_KEY) return;
    const token = localStorage.getItem('jwtToken');
    if (!token) return;

    // Optimistic UI Update
    mutateNotifications((currentData) => {
        if (!currentData) return currentData;
        return {
        ...currentData,
        notifications: currentData.notifications.map(n => ({ ...n, is_read: true })),
        unreadCount: 0
        };
    }, false);

    try {
      await fetch(`/api/notifications/mark-all-as-read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      mutateNotifications(); // Revalidate
    } catch (err) {
      console.error("Gagal menandai semua notifikasi dibaca:", err);
      mutateNotifications(); // Rollback/revalidate
    }
  };

  const getNotificationLink = (notification: NotificationData): string => {
    switch (notification.type) {
      case 'POST_LIKED':
      case 'NEW_COMMENT':
      case 'MENTION_IN_POST':
        if (notification.target_entity_type === 'POST' && notification.target_entity_id) {
          return `/post/${notification.target_entity_id}`;
        }
        break;
      case 'MENTION_IN_COMMENT':
      case 'REPLY_TO_COMMENT':
        // Asumsi API notifikasi untuk ini mengirim targetEntityType: 'POST' dan targetEntityId: postId
        if (notification.target_entity_type === 'POST' && notification.target_entity_id) {
          // Untuk mengarahkan ke komentar spesifik, idealnya kita punya ID komentar
          // atau backend API notifikasi mengirimkan URL yang sudah jadi.
          // Untuk saat ini, kita arahkan ke bagian komentar di post tersebut.
          return `/post/${notification.target_entity_id}#comments`; 
        }
        break;
      case 'FRIEND_REQUEST_RECEIVED':
      case 'FRIEND_REQUEST_ACCEPTED':
        // Link ke profil aktor (yang mengirim/menerima permintaan)
        if (notification.actor_username) return `/profile/${notification.actor_username}`;
        if (notification.actor_user_id) return `/profile/${notification.actor_user_id}`; // Fallback jika username tidak ada
        break;
      case 'NEW_CHAT_MESSAGE':
        if (notification.target_entity_type === 'CHAT_ROOM' && notification.target_entity_id) {
          return `/chat/${notification.target_entity_id}`;
        }
        break;
      default:
        console.warn(`Tipe notifikasi tidak dikenal atau target tidak valid di getNotificationLink: Type='${notification.type}', EntityType='${notification.target_entity_type}'`);
        return '/notifications'; // Fallback ke halaman semua notifikasi
    }
    // Fallback jika kondisi di atas tidak terpenuhi
    return '/notifications';
  };


  if (!isClient) return <div className="w-8 h-8"></div>; // Placeholder kecil saat SSR untuk menghindari layout shift

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        id="notification-bell-button" // ID untuk logika klik di luar
        onClick={handleToggleDropdown}
        className="p-2 rounded-full hover:bg-gray-100 focus:outline-none relative"
        aria-label="Notifikasi"
      >
        <BellIcon className="h-6 w-6 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 block h-2.5 w-2.5 transform -translate-y-px translate-x-px rounded-full bg-red-500 ring-2 ring-white"></span>
        )}
      </button>

      {isOpen && (
        <div 
            className="origin-top-right absolute right-0 mt-2 w-80 sm:w-96 max-h-[calc(100vh-120px)] overflow-y-auto rounded-lg shadow-xl bg-white ring-1 ring-black ring-opacity-5 focus:outline-none"
            role="menu" aria-orientation="vertical" tabIndex={-1}
        >
          <div className="py-1" role="none">
            <div className="px-4 py-3 flex justify-between items-center border-b border-gray-200 sticky top-0 bg-white z-10">
                <h3 className="text-sm font-semibold text-gray-900">Notifikasi</h3>
                {notifications.length > 0 && unreadCount > 0 && (
                    <button 
                        onClick={markAllAsRead} 
                        className="text-xs text-blue-600 hover:underline disabled:text-gray-400"
                        disabled={isLoading || unreadCount === 0} // Disable jika sedang loading atau tidak ada yg unread
                    >
                        Tandai semua dibaca
                    </button>
                )}
            </div>
            {isLoading && notifications.length === 0 && <p className="text-xs text-gray-500 px-4 py-10 text-center">Memuat notifikasi...</p>}
            {error && <p className="text-xs text-red-500 px-4 py-10 text-center">Gagal memuat notifikasi.</p>}
            {!isLoading && !error && notifications.length === 0 && (
              <p className="text-xs text-gray-500 px-4 py-10 text-center">Tidak ada notifikasi.</p>
            )}
            {notifications.map((notif) => (
              <Link
                key={notif.id}
                href={getNotificationLink(notif)}
                onClick={() => {
                    if (!notif.is_read) markNotificationAsRead(notif.id);
                    setIsOpen(false); // Selalu tutup dropdown setelah diklik
                }}
                className={`block w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors duration-150 ${!notif.is_read ? 'bg-blue-50' : 'text-gray-700'}`}
                role="menuitem" tabIndex={-1}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    {notif.actor_profile_picture_url ? (
                      <Image src={notif.actor_profile_picture_url} alt={notif.actor_username || 'Aktor'} width={32} height={32} className="rounded-full w-8 h-8 object-cover"/>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-semibold">
                          {notif.actor_username?.substring(0,1).toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`whitespace-normal text-xs sm:text-sm ${!notif.is_read ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                        {notif.message || `${notif.actor_username || 'Seseorang'} melakukan aksi.`}
                    </p>
                    <p className={`text-xs mt-0.5 ${!notif.is_read ? 'text-blue-600' : 'text-gray-400'}`}>
                        {new Date(notif.created_at).toLocaleString('id-ID', {dateStyle:'short', timeStyle:'short', timeZone: 'Asia/Jakarta'})}
                    </p>
                  </div>
                  {!notif.is_read && (
                    <div className="flex-shrink-0 self-center ml-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full inline-block"></span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
            {notifications.length > 0 && ( // Tampilkan link "Lihat Semua" jika ada notifikasi
                <div className="px-4 py-3 border-t border-gray-200 text-center sticky bottom-0 bg-white z-10">
                    <Link href="/notifications" onClick={() => setIsOpen(false)} className="text-xs font-medium text-blue-600 hover:underline">
                        Lihat Semua Notifikasi
                    </Link>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
