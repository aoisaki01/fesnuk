// src/app/(main)/search/users/page.tsx
"use client";

import { useState, useEffect, FormEvent } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation'; // useSearchParams untuk membaca query URL

// Tipe data untuk hasil pencarian pengguna (harus cocok dengan API)
interface UserSearchResult {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
}

// Fungsi fetcher global (bisa diimpor jika sudah ada)
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken'); // Kirim token untuk konteks filter blokir
  const res = await fetch(url, {
    headers: {
      ...(token && { 'Authorization': `Bearer ${token}` }),
    },
  });
  if (!res.ok) {
    const errorData = await res.json();
    const error = new Error(errorData.message || 'Gagal melakukan pencarian.');
    // @ts-ignore
    error.status = res.status;
    throw error;
  }
  return res.json();
};

export default function SearchUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams(); // Hook untuk mendapatkan query params dari URL

  const initialQuery = searchParams.get('q') || ''; // Ambil query awal dari URL
  const [searchQuery, setSearchQuery] = useState(initialQuery); // State untuk input teks
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery); // State untuk query yang di-submit ke SWR

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Jika ada query awal dari URL, langsung set sebagai submittedQuery
    if (initialQuery) {
        setSubmittedQuery(initialQuery);
    }
  }, [initialQuery]);


  // SWR untuk mengambil hasil pencarian pengguna
  // Hanya fetch jika sudah di client, dan submittedQuery ada dan panjangnya >= 2
  const canFetch = isClient && submittedQuery && submittedQuery.trim().length >= 2;
  const { 
    data: users, 
    error, 
    isLoading 
  } = useSWR<UserSearchResult[]>(
    canFetch ? `/api/search/users?q=${encodeURIComponent(submittedQuery)}` : null,
    fetcher
  );

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length >= 2) {
      setSubmittedQuery(trimmedQuery);
      // Update URL dengan query pencarian baru agar bisa di-bookmark/share
      router.push(`/search/users?q=${encodeURIComponent(trimmedQuery)}`);
    } else {
      // Reset hasil jika query kurang dari 2 karakter atau kosong
      setSubmittedQuery('');
      setUsersClient([]); // Kosongkan hasil pencarian di client
      router.push(`/search/users`); // Hapus query dari URL
    }
  };
  
  // State lokal untuk users agar bisa direset saat query kosong
  const [usersClient, setUsersClient] = useState<UserSearchResult[]>([]);
  useEffect(() => {
    if (users) {
        setUsersClient(users);
    } else if (!submittedQuery || submittedQuery.trim().length < 2) {
        setUsersClient([]); // Kosongkan jika query tidak valid
    }
  }, [users, submittedQuery]);


  if (!isClient) {
    return <div className="container mx-auto p-4 pt-6 md:pt-10 max-w-2xl"><p className="text-center text-gray-600">Memuat halaman pencarian...</p></div>;
  }

  return (
    <div className="container mx-auto p-4 pt-6 md:pt-10 max-w-2xl">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">Cari Pengguna</h1>

      <form onSubmit={handleSearchSubmit} className="mb-8 flex gap-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Ketik nama atau username..."
          className="flex-grow text-black px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
        <button
          type="submit"
          className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70"
          disabled={isLoading || searchQuery.trim().length < 2}
        >
          Cari
        </button>
      </form>

      {isLoading && <p className="text-center text-gray-600">Mencari pengguna...</p>}
      {error && <p className="text-center text-red-500">Error: {error.message}</p>}
      
      {!isLoading && !error && submittedQuery && submittedQuery.trim().length >= 2 && usersClient.length === 0 && (
        <p className="text-center text-gray-500">Tidak ada pengguna ditemukan untuk "{submittedQuery}".</p>
      )}

      {!isLoading && usersClient.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-700">Hasil Pencarian:</h2>
          {usersClient.map((user) => (
            <Link
              href={`/profile/${user.username}`} // Mengarah ke halaman profil pengguna
              key={user.id}
              className="block p-4 bg-white shadow-md rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  {user.profile_picture_url ? (
                    <Image
                      src={user.profile_picture_url}
                      alt={user.username}
                      width={48}
                      height={48}
                      className="rounded-full object-cover w-12 h-12"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold text-lg">
                      {user.username?.substring(0, 1).toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {user.full_name || user.username}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    @{user.username}
                  </p>
                </div>
                {/* Tambahkan tombol aksi (misal "Tambah Teman") di sini jika perlu,
                    memerlukan pengecekan status pertemanan.
                */}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
