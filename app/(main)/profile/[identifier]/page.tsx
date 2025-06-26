// src/app/(main)/profile/[identifier]/page.tsx
"use client";

import { useParams, useRouter } from 'next/navigation';
import useSWR, { mutate as globalMutate } from 'swr';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, FormEvent, useCallback } from 'react';
import PostCard from '@/components/Feed/PostCard'; // Sesuaikan path

// Tipe data (pastikan UserProfileData menyertakan friendship_status dan friendship_id jika ada)
interface UserProfileData {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
  bio: string | null;
  created_at: string;
  posts: UserPost[];
  friendship_status?: 'NOT_FRIENDS' | 'FRIENDS' | 'PENDING_SENT_BY_VIEWER' | 'PENDING_RECEIVED_BY_VIEWER' | 'SELF' | 'BLOCKED_BY_PROFILE_USER' | 'PROFILE_USER_BLOCKED_BY_VIEWER';
  friendship_id?: number | null;
}
interface UserPost {
  id: number;
  content: string;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  like_count: number;
  comment_count: number;
  is_liked_by_me: boolean;
  author_id: number; // Ditambahkan untuk konsistensi
  author_username: string; // Ditambahkan
  author_full_name: string | null; // Ditambahkan
  author_profile_picture_url: string | null; // Ditambahkan
}
interface LoggedInUser { id: number; username: string;}

const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, {
    headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
  });
  if (!res.ok) {
    const errorData = await res.json();
    const error = new Error(errorData.message || 'Gagal mengambil data.');
    // @ts-ignore
    error.status = res.status;
    throw error;
  }
  return res.json();
};


export default function UserProfilePage() {
  const params = useParams();
  const identifier = params.identifier as string;
  const router = useRouter();

  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [actionLoading, setActionLoading] = useState(false); // Akan digunakan untuk semua aksi (friend, block, chat)
  const [actionError, setActionError] = useState<string | null>(null);
  // const [isStartingChat, setIsStartingChat] = useState(false); // Dikelola oleh actionLoading

  useEffect(() => {
    setIsClient(true);
    const userDataString = localStorage.getItem('userData');
    if (userDataString) {
      try {
        setLoggedInUser(JSON.parse(userDataString));
      } catch (e) { console.error("Gagal parse user data di UserProfilePage", e); }
    }
  }, []);

  const { data: profileData, error: profileError, isLoading: isLoadingProfile, mutate: mutateProfile } = useSWR<UserProfileData>(
    (identifier && isClient) ? `/api/users/${identifier}` : null,
    fetcher,
    {
        // onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
        //     // Jangan retry jika 403 (mungkin karena diblokir) atau 404
        //     if (error.status === 403 || error.status === 404) return;
        //     // Batasi retry
        //     if (retryCount >= 3) return;
        //     // Retry setelah 5 detik
        //     setTimeout(() => revalidate({ retryCount }), 5000);
        // }
    }
  );

  const { data: friendCountData, error: friendCountError } = useSWR<{ friendCount: number }>(
    (profileData?.id && isClient) ? `/api/users/${profileData.id}/friend-count` : null,
    fetcher
  );

  const handlePostActionOnProfile = useCallback(() => {
    if (identifier && isClient) {
      mutateProfile();
    }
  }, [identifier, isClient, mutateProfile]);

  const handleFriendAction = async (
    actionType: 'SEND_REQUEST' | 'CANCEL_REQUEST' | 'ACCEPT_REQUEST' | 'DECLINE_REQUEST' | 'UNFRIEND'
  ) => {
    if (!profileData || !loggedInUser) return;
    setActionLoading(true);
    setActionError(null);
    // setIsStartingChat(false); // Tidak relevan di sini
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setActionError("Anda harus login untuk melakukan aksi ini.");
      setActionLoading(false);
      return;
    }

    let url = '';
    let method: 'POST' | 'PUT' | 'DELETE' = 'POST';
    try {
      switch (actionType) {
        case 'SEND_REQUEST':
          url = `/api/users/${profileData.id}/friend-requests`; method = 'POST'; break;
        case 'CANCEL_REQUEST':
          if (!profileData.friendship_id) throw new Error("ID Pertemanan tidak ada untuk cancel.");
          url = `/api/friend-requests/${profileData.friendship_id}/cancel`; method = 'DELETE'; break;
        case 'ACCEPT_REQUEST':
          if (!profileData.friendship_id) throw new Error("ID Pertemanan tidak ada untuk accept.");
          url = `/api/friend-requests/${profileData.friendship_id}/accept`; method = 'PUT'; break;
        case 'DECLINE_REQUEST':
          if (!profileData.friendship_id) throw new Error("ID Pertemanan tidak ada untuk decline.");
          url = `/api/friend-requests/${profileData.friendship_id}/decline`; method = 'DELETE'; break;
        case 'UNFRIEND':
          url = `/api/friends/${profileData.id}`; method = 'DELETE'; break;
        default: throw new Error("Aksi pertemanan tidak dikenal.");
      }
      const response = await fetch(url, { method, headers: { 'Authorization': `Bearer ${token}` }});
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.message || `Gagal ${actionType}`);
      mutateProfile(); // Revalidasi data profil untuk update UI
      if (profileData?.id) {
        globalMutate(`/api/users/${profileData.id}/friend-count`); // Revalidasi jumlah teman
      }
    } catch (err: any) { setActionError(err.message); console.error(`Error ${actionType}:`, err);
    } finally { setActionLoading(false); }
  };

  // Fungsi untuk memblokir pengguna
  const handleBlockUser = async () => {
    if (!profileData || !loggedInUser || loggedInUser.id === profileData.id) return;
    if (!window.confirm(`Apakah Anda yakin ingin memblokir ${profileData.username}? Pengguna ini tidak akan bisa melihat profil Anda dan Anda tidak akan melihat postingan mereka.`)) return;

    setActionLoading(true);
    setActionError(null);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setActionError("Anda harus login untuk melakukan aksi ini.");
      setActionLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/users/${identifier || profileData.id}/block`, { // Gunakan identifier dari route params jika ada, atau id
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.message || 'Gagal memblokir pengguna.');
      setActionError(null); // Bersihkan error sebelumnya jika ada
      alert(responseData.message || 'Pengguna berhasil diblokir.'); // Pesan sukses
      mutateProfile(); // Revalidasi data profil untuk update UI
      // Anda mungkin ingin mengarahkan pengguna atau mengubah tampilan secara drastis
    } catch (err: any) {
      setActionError(err.message);
      console.error("Error blocking user:", err);
    } finally {
      setActionLoading(false);
    }
  };

  // Fungsi untuk membuka blokir pengguna
  const handleUnblockUser = async () => {
    if (!profileData || !loggedInUser || loggedInUser.id === profileData.id) return;
    if (!window.confirm(`Apakah Anda yakin ingin membuka blokir ${profileData.username}?`)) return;

    setActionLoading(true);
    setActionError(null);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setActionError("Anda harus login untuk melakukan aksi ini.");
      setActionLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/users/${identifier || profileData.id}/unblock`, { // Gunakan identifier dari route params jika ada, atau id
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.message || 'Gagal membuka blokir pengguna.');
      setActionError(null); // Bersihkan error sebelumnya jika ada
      alert(responseData.message || 'Blokir pengguna berhasil dibuka.'); // Pesan sukses
      mutateProfile(); // Revalidasi data profil untuk update UI
    } catch (err: any) {
      setActionError(err.message);
      console.error("Error unblocking user:", err);
    } finally {
      setActionLoading(false);
    }
  };


  const handleStartChat = async () => {
    if (!profileData || !loggedInUser || loggedInUser.id === profileData.id) return;
    // Pengecekan status blokir sebelum memulai chat
    if (profileData.friendship_status === 'BLOCKED_BY_PROFILE_USER' || profileData.friendship_status === 'PROFILE_USER_BLOCKED_BY_VIEWER') {
        setActionError("Tidak bisa memulai chat karena status blokir.");
        return;
    }

    setActionLoading(true); // Gunakan actionLoading yang sama
    setActionError(null);
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setActionError("Anda harus login untuk memulai chat.");
      setActionLoading(false);
      return;
    }
    try {
      const response = await fetch('/api/chat/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId: profileData.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Gagal memulai percakapan.');
      if (data.id) router.push(`/chat/${data.id}`); // Arahkan ke ruang chat
      else throw new Error('ID ruang chat tidak diterima dari server.');
    } catch (err: any) { setActionError(err.message); console.error("Error starting chat:", err);
    } finally { setActionLoading(false); } // Reset loading
  };

  if (!isClient || isLoadingProfile) {
    return <p className="text-center mt-10 text-gray-600 text-lg">Memuat profil...</p>;
  }
  // @ts-ignore
  if (profileError) {
    // @ts-ignore
    const status = profileError.status;
    // @ts-ignore
    const message = profileError.message;
    if (status === 403) return <p className="text-center text-red-500 mt-10">{message || "Profil ini tidak dapat diakses karena Anda diblokir atau memblokir pengguna ini."}</p>;
    if (status === 404) return <p className="text-center text-gray-500 mt-10">Profil pengguna tidak ditemukan.</p>;
    return <p className="text-center text-red-500 mt-10">Error: {message || "Gagal memuat profil."}</p>;
  }
  if (!profileData) {
    return <p className="text-center text-gray-500 mt-10">Profil pengguna tidak ditemukan.</p>;
  }

  // Tombol Aksi Utama (Pertemanan, Blokir, Buka Blokir)
  const renderActionButtons = () => {
    if (!loggedInUser || loggedInUser.id === profileData.id) return null; // Tidak ada aksi untuk diri sendiri

    // Jika viewer memblokir pengguna ini
    if (profileData.friendship_status === 'PROFILE_USER_BLOCKED_BY_VIEWER') {
      return (
        <button
          onClick={handleUnblockUser}
          className="px-4 py-2 text-sm font-medium rounded-md bg-yellow-500 hover:bg-yellow-600 text-white transition-colors disabled:opacity-70"
          disabled={actionLoading}
        >
          {actionLoading ? 'Memproses...' : 'Buka Blokir'}
        </button>
      );
    }
    // Jika tidak, tampilkan tombol pertemanan dan tombol blokir (jika belum diblokir)
    // Tombol blokir akan selalu ada selama bukan profil sendiri dan belum diblokir oleh viewer
    return (
      <>
        {renderFriendshipButton()}
        <button
          onClick={handleBlockUser}
          className="px-4 py-2 text-sm font-medium rounded-md bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-70"
          disabled={actionLoading}
        >
          {actionLoading ? 'Memproses...' : 'Blokir Pengguna'}
        </button>
      </>
    );
  };


  const renderFriendshipButton = () => {
    // Fungsi ini hanya untuk tombol pertemanan, tombol blokir/unblock ditangani oleh renderActionButtons
    if (!loggedInUser || loggedInUser.id === profileData.id || profileData.friendship_status === 'SELF') return null;
    if (profileData.friendship_status === 'PROFILE_USER_BLOCKED_BY_VIEWER') return null; // Sudah ditangani oleh renderActionButtons

    let buttonText = "Tambah Teman";
    let onClickAction = () => handleFriendAction('SEND_REQUEST');
    let buttonClasses = "bg-blue-500 hover:bg-blue-600 text-white";
    let isDisabled = actionLoading;

    switch (profileData.friendship_status) {
        case 'FRIENDS':
            buttonText = "Teman";
            buttonClasses = "bg-gray-200 hover:bg-gray-300 text-gray-700";
            onClickAction = async () => { if(window.confirm(`Yakin hapus pertemanan dengan ${profileData.username}?`)) await handleFriendAction('UNFRIEND');};
            break;
        case 'PENDING_SENT_BY_VIEWER':
            buttonText = "Batal Kirim"; // Diubah agar bisa cancel
            buttonClasses = "bg-yellow-400 hover:bg-yellow-500 text-gray-800";
            onClickAction = () => handleFriendAction('CANCEL_REQUEST');
            break;
        case 'PENDING_RECEIVED_BY_VIEWER':
            return ( // Tombol Terima & Tolak sebagai grup
            <div className="flex space-x-2">
                <button onClick={() => handleFriendAction('ACCEPT_REQUEST')} className="px-3 py-1.5 text-sm font-medium rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors" disabled={actionLoading}>{actionLoading ? '...' : 'Terima'}</button>
                <button onClick={() => handleFriendAction('DECLINE_REQUEST')} className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-300 hover:bg-gray-400 text-gray-800 transition-colors" disabled={actionLoading}>{actionLoading ? '...' : 'Tolak'}</button>
            </div>
            );
        case 'NOT_FRIENDS':
            // Default sudah diatur (Tambah Teman)
            break;
    }
    return <button onClick={onClickAction} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${buttonClasses} disabled:opacity-70`} disabled={isDisabled}>{actionLoading ? 'Memproses...' : buttonText}</button>;
  };

  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 mb-8 border border-gray-200">
        <div className="flex flex-col sm:flex-row items-center sm:items-start">
          {profileData.profile_picture_url ? (
            <Image src={profileData.profile_picture_url} alt={profileData.username || 'Foto Profil'} width={128} height={128} className="rounded-full object-cover w-24 h-24 sm:w-32 sm:h-32 border-4 border-white shadow-md flex-shrink-0"/>
          ) : (
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gray-400 flex items-center justify-center text-white text-4xl font-bold mb-4 sm:mb-0 flex-shrink-0">
              {profileData.username ? profileData.username.substring(0, 1).toUpperCase() : '?'}
            </div>
          )}
          <div className="mt-4 sm:mt-0 sm:ml-6 flex-grow text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{profileData.full_name || profileData.username}</h1>
            <p className="text-md text-gray-500">@{profileData.username || 'username tidak tersedia'}</p>
            {friendCountData && typeof friendCountData.friendCount === 'number' && profileData.id !== loggedInUser?.id && (
                <p className="text-sm text-gray-600 mt-1">
                    {friendCountData.friendCount} Teman
                </p>
            )}
            {friendCountError && <p className="text-xs text-red-400">Gagal memuat jumlah teman.</p>}
            {profileData.bio && <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{profileData.bio}</p>}
            <p className="text-xs text-gray-400 mt-3">
              Bergabung: {profileData.created_at ? new Date(profileData.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long' }) : 'Tidak diketahui'}
            </p>
            <div className="mt-5 flex flex-col sm:flex-row flex-wrap gap-3 items-center justify-center sm:justify-start">
                {isClient && renderActionButtons()} {/* Tombol utama untuk blokir/unblokir dan pertemanan */}

                {/* Tombol Kirim Pesan, hanya jika tidak diblokir dan bukan diri sendiri */}
                {isClient && loggedInUser && profileData && loggedInUser.id !== profileData.id &&
                 profileData.friendship_status !== 'BLOCKED_BY_PROFILE_USER' &&
                 profileData.friendship_status !== 'PROFILE_USER_BLOCKED_BY_VIEWER' && (
                  <button
                    onClick={handleStartChat}
                    disabled={actionLoading} // Gunakan actionLoading yang sama
                    className="px-4 py-2 text-sm font-medium rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-70"
                  >
                    {actionLoading ? 'Memproses...' : 'Kirim Pesan'}
                  </button>
                )}
                {actionError && <p className="text-xs text-red-500 w-full mt-1 sm:mt-0 sm:ml-2 text-center sm:text-left">{actionError}</p>}
                {isClient && loggedInUser?.id === profileData.id && (
                    <Link href="/profile/edit" className="px-4 py-2 text-sm font-medium bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">
                        Edit Profil Saya
                    </Link>
                )}
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-6">
        Postingan oleh {profileData.username || 'Pengguna Ini'}
      </h2>
      {profileData.posts && profileData.posts.length > 0 ? (
        <div className="space-y-6">
          {profileData.posts.map(post => (
            <PostCard
              key={post.id}
              post={{
                ...post,
                // Pastikan semua field yang dibutuhkan PostCard tersedia di `post` dari `profileData.posts`
                // Jika UserPost berbeda dari FeedPost, lakukan mapping di sini atau pastikan API mengirim data yang konsisten.
                // Untuk contoh ini, kita asumsikan UserPost sudah memiliki field yang dibutuhkan atau PostCard bisa menanganinya.
                author_id: post.author_id || profileData.id, // Fallback jika author_id tidak ada di post object
                author_username: post.author_username || profileData.username,
                author_full_name: post.author_full_name || profileData.full_name,
                author_profile_picture_url: post.author_profile_picture_url || profileData.profile_picture_url,

              }}
              loggedInUserId={loggedInUser?.id || null}
              onPostDeleted={handlePostActionOnProfile}
              onPostEdited={handlePostActionOnProfile}
              onPostReported={(postId, isHidden) => {
                // Jika postingan disembunyikan setelah dilaporkan, revalidasi profil
                if (isHidden) mutateProfile();
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-center py-8">Pengguna ini belum memiliki postingan.</p>
      )}
    </div>
  );
}