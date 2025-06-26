// src/app/(main)/feed/page.tsx
"use client";

import { useCallback, useEffect, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import PostCard from '@/components/Feed/PostCard';
import CreatePostForm from '@/components/Feed/CreatePostForm';

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

interface LoggedInUser {
  id: number;
  username: string;
}

const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, {
    headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
  });
  if (!res.ok) {
    let errorData;
    try {
      errorData = await res.json();
    } catch (e) {
      errorData = { message: `Request failed with status ${res.status}` };
    }
    const error = new Error(errorData.message || 'Gagal mengambil data.');
    // @ts-ignore
    error.status = res.status;
    throw error;
  }
  return res.json(); // Harapannya API /api/posts mengembalikan FeedPost[] per halaman
};

const getKey = (pageIndex: number, previousPageData: FeedPost[] | null): string | null => {
  if (previousPageData && !previousPageData.length) return null;
  if (previousPageData && previousPageData.length < 10) return null;
  return `/api/posts?page=${pageIndex + 1}&limit=10`; // Diubah ke /api/posts untuk feed global
};

export default function FeedPage() {
  const [isClient, setIsClient] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);

  const {
    data: pagesData, // Ekspektasi: FeedPost[][] | undefined
    error,
    size,
    setSize,
    isLoading,
    mutate
  } = useSWRInfinite<FeedPost[]>( // Tipe FeedPost[] adalah tipe untuk SATU HALAMAN
    (pageIndex, previousPageData) => isClient ? getKey(pageIndex, previousPageData) : null,
    fetcher,
    {
      revalidateIfStale: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  useEffect(() => {
    setIsClient(true);
    const userDataString = localStorage.getItem('userData');
    if (userDataString) {
      try {
        setLoggedInUser(JSON.parse(userDataString));
      } catch (e) {
        console.error("Gagal parse user data dari localStorage", e);
      }
    }
  }, []);

  // --- LOGGING DAN PEMROSESAN pagesData ---
  let posts: FeedPost[] = [];
  if (isClient && pagesData) { // Hanya proses jika sudah di client dan pagesData ada
    console.log('------------------------------------');
    console.log('DEBUG: pagesData received:', JSON.parse(JSON.stringify(pagesData))); // Log salinan untuk inspeksi
    console.log('DEBUG: Is pagesData an array?', Array.isArray(pagesData));

    if (Array.isArray(pagesData)) {
      // Coba gabungkan semua array halaman menjadi satu array posts
      // Ini akan berfungsi jika pagesData adalah array dari array (FeedPost[][])
      try {
        posts = pagesData.flat();
        console.log('DEBUG: posts after pagesData.flat():', posts.length, 'items');
      } catch (e) {
        console.error('DEBUG: Error calling pagesData.flat()', e);
        console.error('DEBUG: Structure of pagesData that caused error:', JSON.parse(JSON.stringify(pagesData)));
        // Fallback jika .flat() gagal, mungkin pagesData sudah flat atau strukturnya tidak terduga
        // Jika pagesData adalah array tapi .flat() gagal, coba cek elemennya
        if (pagesData.length > 0 && !Array.isArray(pagesData[0]) && typeof pagesData[0] === 'object') {
          console.warn('DEBUG: pagesData appears to be already flat (FeedPost[]), not FeedPost[][]. Using as is.');
          posts = pagesData as unknown as FeedPost[]; // Asumsikan ini sudah FeedPost[]
        } else {
           console.warn('DEBUG: pagesData structure is unexpected for flat(). Defaulting posts to empty array.');
           posts = []; // Default ke array kosong jika tidak bisa diproses
        }
      }
    } else {
      console.warn('DEBUG: pagesData is defined but not an array. Defaulting posts to empty array.');
      posts = [];
    }
    console.log('------------------------------------');
  }
  // --- AKHIR LOGGING DAN PEMROSESAN ---


  const isLoadingInitialData = !pagesData && !error && isLoading && isClient;
  const isLoadingMore = isLoading && (pagesData && pagesData.length > 0) && isClient;
  const isEmpty = posts.length === 0 && !isLoadingInitialData && !error && isClient;
  
  const lastPageData = pagesData && pagesData[pagesData.length - 1];
  const hasMore = lastPageData ? lastPageData.length === 10 : (isClient ? true : false);

  const handlePostCreated = useCallback(() => {
    setSize(1).then(() => {
        mutate();
    });
    window.scrollTo(0, 0);
  }, [mutate, setSize]);

  const handlePostEditedOrDeleted = useCallback(() => {
    mutate();
  }, [mutate]);

  if (!isClient || isLoadingInitialData) {
    return <p className="text-center mt-10 text-gray-600 text-lg">Memuat Beranda Feed...</p>;
  }

  if (error && !posts.length) {
    // @ts-ignore
    return <p className="text-center text-red-500 mt-10">Error: {error.message || "Gagal memuat feed."}</p>;
  }

  return (
    <>
      <div className="mb-8 max-w-xl mx-auto">
        {isClient && <CreatePostForm onPostCreated={handlePostCreated} />}
      </div>

      {isEmpty && (
        <p className="text-center text-gray-500 mt-8">
          Belum ada postingan untuk ditampilkan. <br />
          Jadilah yang pertama membuat postingan!
        </p>
      )}
      
      {error && posts.length > 0 && (
         // @ts-ignore
        <p className="text-center text-red-500 mb-4">Error memuat postingan baru: {error.message}</p>
      )}

      <div className="space-y-4 max-w-xl mx-auto">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            loggedInUserId={loggedInUser?.id || null}
            onPostDeleted={handlePostEditedOrDeleted}
            onPostEdited={handlePostEditedOrDeleted}
          />
        ))}
      </div>

      {isLoadingMore && (
        <div className="flex justify-center items-center mt-4">
          <p className="text-center text-gray-600">Memuat lebih banyak...</p>
        </div>
      )}
      
      {!isLoadingMore && hasMore && posts.length > 0 && (
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
      {!hasMore && posts.length > 0 && !isLoadingMore && (
        <p className="text-center text-gray-500 mt-6 mb-8">Anda telah mencapai akhir feed.</p>
      )}
    </>
  );
}