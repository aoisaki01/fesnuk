// src/app/(main)/search/users/page.tsx
"use client";

// Tidak perlu 'export const dynamic = "force-dynamic";' karena
// penggunaan hooks seperti useSearchParams sudah membuatnya dinamis.
export const dynamic = "force-dynamic";
import { useState, useEffect, FormEvent, Suspense } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';

// Tipe data untuk hasil pencarian pengguna (harus cocok dengan API)
interface UserSearchResult {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
}

// Fungsi fetcher yang lebih sederhana. SWR hanya akan berjalan di client.
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, {
    headers: {
      ...(token && { 'Authorization': `Bearer ${token}` }),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Terjadi kesalahan jaringan.' }));
    const error = new Error(errorData.message || 'Gagal melakukan pencarian.');
    // @ts-ignore
    error.status = res.status;
    throw error;
  }
  return res.json();
};

function SearchComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Ambil query dari URL sebagai nilai awal
  const initialQuery = searchParams.get('q') || '';

  // State untuk input teks yang dikontrol
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  // State untuk query yang benar-benar di-submit untuk memicu fetch
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);

  // SWR untuk mengambil hasil pencarian pengguna
  // Hanya fetch jika submittedQuery ada dan panjangnya >= 2
  const canFetch = submittedQuery.trim().length >= 2;
  const { 
    data: users, // Langsung gunakan data dari SWR
    error, 
    isLoading 
  } = useSWR<UserSearchResult[]>(
    canFetch ? `/api/search/users?q=${encodeURIComponent(submittedQuery)}` : null,
    fetcher
  );

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = searchQuery.trim();
    setSubmittedQuery(trimmedQuery); // Selalu update submittedQuery
    
    // Update URL agar bisa di-bookmark/share
    if (trimmedQuery.length >= 2) {
      router.push(`/search/users?q=${encodeURIComponent(trimmedQuery)}`);
    } else {
      router.push(`/search/users`); // Hapus query dari URL jika tidak valid
    }
  };

  // Efek untuk menyinkronkan state input jika URL berubah (misal: tombol back/forward)
  useEffect(() => {
    setSearchQuery(initialQuery);
    setSubmittedQuery(initialQuery);
  }, [initialQuery]);

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
          disabled={isLoading}
        >
          {isLoading ? '...' : 'Cari'}
        </button>
      </form>

      {/* Menampilkan Status Pencarian */}
      <div className="text-center">
        {isLoading && <p className="text-gray-600">Mencari pengguna...</p>}
        {error && <p className="text-red-500">Error: {error.message}</p>}
        
        {/* Pesan "Tidak ada hasil" ditampilkan jika pencarian sudah selesai dan hasilnya kosong */}
        {!isLoading && !error && canFetch && users && users.length === 0 && (
          <p className="text-gray-500">Tidak ada pengguna ditemukan untuk "{submittedQuery}".</p>
        )}
      </div>

      {/* Menampilkan Hasil Pencarian */}
      {users && users.length > 0 && (
        <div className="space-y-3 mt-4">
          <h2 className="text-xl font-semibold text-gray-700 text-left">Hasil Pencarian:</h2>
          {users.map((user) => (
            <Link
              href={`/profile/${user.username}`}
              key={user.id}
              className="block p-4 bg-white shadow-md rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  <Image
                    src={user.profile_picture_url || '/default-avatar.png'} // Sediakan gambar fallback
                    alt={user.username}
                    width={48}
                    height={48}
                    className="rounded-full object-cover w-12 h-12"
                    onError={(e) => { e.currentTarget.src = '/default-avatar.png'; }} // Fallback jika gambar gagal dimuat
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {user.full_name || user.username}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    @{user.username}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Bungkus komponen utama dengan Suspense
// Ini adalah praktik terbaik untuk menangani hook seperti useSearchParams
export default function SearchUsersPage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-4 pt-6 md:pt-10 max-w-2xl"><p className="text-center text-gray-600">Memuat halaman pencarian...</p></div>}>
      <SearchComponent />
    </Suspense>
  );
}
