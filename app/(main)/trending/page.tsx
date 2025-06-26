// src/app/(main)/trending/page.tsx
"use client";

import { useCallback, useEffect, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import PostCard from '@/components/Feed/PostCard'; // Asumsi Anda menggunakan PostCard yang sama
// import CreatePostForm from '@/components/Feed/CreatePostForm'; // Mungkin tidak perlu di halaman trending

// Tipe data untuk TrendingPostData (harus cocok dengan API)
interface TrendingPostData {
  id: number;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  is_live?: boolean;
  live_status?: string | null;
  stream_playback_url?: string | null;
  visibility_status?: string | null;
  author_id: number;
  author_username: string;
  author_full_name: string | null;
  author_profile_picture_url: string | null;
  like_count: number;
  comment_count: number;
  is_liked_by_me: boolean;
  trending_score?: number;
}

interface LoggedInUser {
  id: number;
  username: string;
}

// Fungsi fetcher global (bisa diimpor)
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, {
    headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
  });
  if (!res.ok) {
    let errorData; try { errorData = await res.json(); } catch (e) { errorData = { message: `Request gagal ${res.status}` }; }
    const error = new Error(errorData.message || 'Gagal mengambil data.');
    (error as any).status = res.status;
    throw error;
  }
  return res.json();
};

// Fungsi untuk mendapatkan key untuk SWRInfinite (paginasi)
const getKeyTrending = (pageIndex: number, previousPageData: TrendingPostData[] | null): string | null => {
  if (previousPageData && !previousPageData.length) return null;
  if (previousPageData && previousPageData.length < 10) return null; // Asumsi limit 10
  return `/api/posts/trending?page=${pageIndex + 1}&limit=10`;
};

export default function TrendingPage() {
  const [isClient, setIsClient] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);

  useEffect(() => {
    setIsClient(true);
    const userDataString = localStorage.getItem('userData');
    if (userDataString) {
      try { setLoggedInUser(JSON.parse(userDataString)); }
      catch (e) { console.error("Gagal parse user data", e); }
    }
  }, []);

  const {
    data: pagesData,
    error,
    size,
    setSize,
    isLoading,
    mutate // Untuk revalidasi jika diperlukan (misal setelah like/komen dari halaman ini)
  } = useSWRInfinite<TrendingPostData[]>(
    (pageIndex: number, previousPageData: TrendingPostData[] | null) => {
      if (!isClient) return null;
      return getKeyTrending(pageIndex, previousPageData);
    },
    fetcher,
    { revalidateIfStale: true, revalidateOnFocus: true, revalidateOnReconnect: true }
  );

  const trendingPosts: TrendingPostData[] = pagesData ? pagesData.flat() : [];

  const isLoadingInitialData = !pagesData && !error && isLoading && isClient;
  const isLoadingMore = isLoading && (pagesData && pagesData.length > 0) && isClient;
  const isEmpty = trendingPosts.length === 0 && !isLoadingInitialData && !error && isClient;
  const lastPageData = pagesData && pagesData[pagesData.length - 1];
  const hasMore = lastPageData ? lastPageData.length === 10 : (isClient ? true : false);

  // Callback untuk revalidasi jika ada aksi pada PostCard
  const handlePostInteraction = useCallback(() => {
    mutate(); // Revalidasi semua data trending yang ada
  }, [mutate]);


  if (!isClient || isLoadingInitialData) {
    return <p className="text-center mt-10 text-gray-600 text-lg">Memuat Postingan Trending...</p>;
  }

  if (error && !trendingPosts.length) {
    // @ts-ignore
    return <p className="text-center text-red-500 mt-10">Error: {error.message || "Gagal memuat postingan trending."}</p>;
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl"> {/* Sesuaikan max-w jika perlu */}
      <h1 className="text-3xl font-bold mb-8 text-center text-gray-800">Postingan Trending</h1>

      {isEmpty && (
        <p className="text-center text-gray-500 mt-8">
          Belum ada postingan trending untuk ditampilkan saat ini.
        </p>
      )}
      
      {error && trendingPosts.length > 0 && (
         // @ts-ignore
        <p className="text-center text-red-500 mb-4">Error memuat postingan baru: {error.message}</p>
      )}

      <div className="space-y-4">
        {trendingPosts.map((post) => (
          <PostCard
            key={post.id}
            post={{
              ...post,
              content: post.content ?? "",
            }} // Pastikan tipe TrendingPostData kompatibel dengan prop 'post' di PostCard
            loggedInUserId={loggedInUser?.id || null}
            onPostDeleted={handlePostInteraction} // Jika post dihapus, revalidasi trending
            onPostEdited={handlePostInteraction}  // Jika post diedit, revalidasi trending
            onPostReported={handlePostInteraction} // Jika post direport & disembunyikan, revalidasi
          />
        ))}
      </div>

      {isLoadingMore && (
        <div className="flex justify-center items-center mt-4">
          <p className="text-center text-gray-600">Memuat lebih banyak...</p>
        </div>
      )}
      
      {!isLoadingMore && hasMore && trendingPosts.length > 0 && (
        <div className="text-center mt-6 mb-8">
          <button
            onClick={() => setSize(size + 1)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow hover:shadow-lg transition-all duration-150"
            disabled={isLoadingMore}
          >
            Muat Lebih Banyak
          </button>
        </div>
      )}
      {!hasMore && trendingPosts.length > 0 && !isLoadingMore && (
        <p className="text-center text-gray-500 mt-6 mb-8">Anda telah mencapai akhir daftar trending.</p>
      )}
    </div>
  );
}
