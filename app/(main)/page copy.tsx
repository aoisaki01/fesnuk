// src/app/(main)/page.tsx
"use client";

import { useCallback } from 'react'; // useState dan useEffect akan digantikan oleh SWR untuk data feed utama
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite'; // Untuk infinite loading / paginasi
import PostCard from '@/components/Feed/PostCard';
import CreatePostForm from '@/components/Feed/CreatePostForm';

// Tipe data untuk FeedPost (sama seperti sebelumnya)
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
}

// Fungsi fetcher global yang akan digunakan SWR
// Fungsi ini perlu mengambil token dan menyertakannya.
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, {
    headers: {
      ...(token && { 'Authorization': `Bearer ${token}` }),
    },
  });
  if (!res.ok) {
    const errorData = await res.json();
    const error = new Error(errorData.message || 'An error occurred while fetching the data.');
    // Anda bisa menambahkan info tambahan ke objek error di sini jika perlu
    // error.info = errorData;
    // error.status = res.status;
    throw error;
  }
  return res.json();
};

// Fungsi untuk mendapatkan key untuk SWRInfinite (paginasi)
const getKey = (pageIndex: number, previousPageData: any | null): string | null => {
  // `pageIndex` dimulai dari 0
  // `previousPageData` adalah data dari request sebelumnya
  if (previousPageData && !previousPageData.length) return null; // Mencapai akhir
  if (previousPageData && Array.isArray(previousPageData) && previousPageData.length < 10) return null; // Jika API mengembalikan array langsung dan kurang dari limit
  if (previousPageData && previousPageData.posts && previousPageData.posts.length < 10) return null; // Jika API mengembalikan objek {posts:[]} dan kurang dari limit

  return `/api/feed?page=${pageIndex + 1}&limit=10`; // URL API untuk halaman berikutnya
};


export default function HomePage() {
  const {
    data: pagesData, // `data` akan menjadi array dari respons per halaman
    error,
    size, // Jumlah halaman yang sudah di-fetch
    setSize, // Fungsi untuk menambah `size` (memuat halaman berikutnya)
    isLoading, // Kombinasi dari isValidating dan data belum ada
    mutate // Fungsi untuk memicu revalidasi manual
  } = useSWRInfinite<FeedPost[] | { posts: FeedPost[] }>(getKey, fetcher, { // Tipe data bisa array langsung atau objek {posts: []}
    revalidateIfStale: true,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  // Menggabungkan data dari semua halaman menjadi satu array post
  const posts: FeedPost[] = pagesData
    ? pagesData.reduce<FeedPost[]>((acc, page) => {
        const pagePosts = Array.isArray(page) ? page : page.posts; // Sesuaikan dengan struktur API Anda
        return acc.concat(pagePosts || []);
      }, [])
    : [];

  const isLoadingInitialData = !pagesData && !error && isLoading;
  const isLoadingMore = isLoading && size > 1; // Loading saat memuat halaman berikutnya
  const isEmpty = posts.length === 0 && !isLoadingInitialData;
  
  // Cek apakah ada halaman berikutnya berdasarkan data terakhir yang diterima
  // Ini asumsi sederhana, bisa disesuaikan jika API mengembalikan info hasMore/totalPages
  const lastPageData = pagesData && pagesData[pagesData.length - 1];
  const actualLastPagePosts = lastPageData ? (Array.isArray(lastPageData) ? lastPageData : lastPageData.posts) : [];
  const hasMore = actualLastPagePosts ? actualLastPagePosts.length === 10 : false;


  const handlePostCreated = useCallback(() => {
    // Memicu SWR untuk memuat ulang data feed dari awal (halaman pertama)
    // Ini akan membuat data menjadi segar kembali
    setSize(1).then(() => { // Reset ke size 1 untuk memuat halaman pertama
        mutate(); // Memicu revalidasi untuk key yang ada (termasuk halaman pertama)
    });
    // Atau cara yang lebih direct jika hanya ingin revalidasi halaman pertama
    // mutate(getKey(0, null));
    window.scrollTo(0, 0); // Scroll ke atas setelah postingan baru
  }, [mutate, setSize]);


  if (isLoadingInitialData) {
    return <p className="text-center mt-10 text-gray-600 text-lg">Memuat Beranda...</p>;
  }

  if (error && !posts.length) { // Tampilkan error besar jika gagal load awal
    return <p className="text-center text-red-500 mt-10">Error: {error.message}</p>;
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">Beranda</h1>
      
      <div className="mb-8">
        <CreatePostForm onPostCreated={handlePostCreated} />
      </div>

      {isEmpty && (
        <p className="text-center text-gray-500 mt-8">
          Belum ada postingan untuk ditampilkan di beranda Anda. <br />
          Coba buat postingan pertama atau cari teman baru!
        </p>
      )}
      
      {error && posts.length > 0 && <p className="text-center text-red-500 mb-4">Error memuat postingan baru: {error.message}</p>}

      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {isLoadingMore && <p className="text-center mt-4 text-gray-600">Memuat lebih banyak...</p>}
      
      {!isLoadingMore && hasMore && posts.length > 0 && (
        <div className="text-center mt-6 mb-8">
          <button
            onClick={() => setSize(size + 1)} // Memuat halaman berikutnya
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow hover:shadow-lg transition-all duration-150"
          >
            Muat Lebih Banyak
          </button>
        </div>
      )}
      {!hasMore && posts.length > 0 && !isLoadingMore && (
        <p className="text-center text-gray-500 mt-6 mb-8">Anda telah mencapai akhir feed.</p>
      )}
    </div>
  );
}