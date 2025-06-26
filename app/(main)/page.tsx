// src/app/(main)/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import PostCard from '@/components/Feed/PostCard'; // Sesuaikan path jika perlu
import CreatePostForm from '@/components/Feed/CreatePostForm'; // Sesuaikan path jika perlu
// Tidak lagi menggunakan getCookie untuk contoh ini

// Tipe data untuk FeedPost (pastikan ini ada dan sesuai dengan API Anda)
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

export default function HomePage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false); // State khusus untuk load more
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchFeedPosts = useCallback(async (pageNum: number, isInitialLoad = false) => {
    if (isInitialLoad) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const token = localStorage.getItem('jwtToken'); // Mengambil token dari localStorage

      // Untuk initial load, token mungkin penting. Untuk load more, mungkin tidak apa jika token sementara hilang,
      // tergantung kebijakan API Anda untuk /api/feed jika tanpa token.
      if (!token && isInitialLoad) {
        setError("Sesi Anda mungkin telah berakhir. Silakan login kembali.");
        setIsLoading(false);
        setIsLoadingMore(false);
        setPosts([]);
        setHasMore(false);
        // Opsional: Arahkan ke halaman login
        // import { useRouter } from 'next/navigation';
        // const router = useRouter();
        // router.push('/login');
        return;
      }
      
      const response = await fetch(`/api/feed?page=${pageNum}&limit=10`, {
        headers: {
          // Hanya kirim Authorization header jika token ada
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Gagal mengambil feed: ${response.status}`);
      }
      const data = await response.json();
      // Asumsi API /api/feed mengembalikan array postingan secara langsung,
      // atau objek dengan properti `posts` seperti: { posts: [], currentPage: 1, totalPages: 5 }
      // Sesuaikan baris berikut dengan struktur respons API Anda yang sebenarnya.
      const fetchedPosts: FeedPost[] = Array.isArray(data) ? data : (data.posts || []);


      setPosts(prevPosts => pageNum === 1 ? fetchedPosts : [...prevPosts, ...fetchedPosts]);
      // Logika hasMore mungkin perlu disesuaikan jika API mengembalikan totalPages atau info serupa
      setHasMore(fetchedPosts.length === 10); // Asumsi limit 10, jika kurang berarti halaman terakhir

    } catch (err: any) {
      setError(err.message);
      console.error("Error fetching feed posts:", err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []); // useCallback tanpa dependensi jika tidak ada state luar yang berubah & mempengaruhi fungsi ini

  useEffect(() => {
    fetchFeedPosts(1, true); // Ambil halaman pertama saat komponen dimuat, tandai sebagai initialLoad
  }, [fetchFeedPosts]);

  const loadMorePosts = () => {
    if (hasMore && !isLoading && !isLoadingMore) { // Pastikan tidak sedang loading apapun
      const nextPage = page + 1;
      setPage(nextPage);
      fetchFeedPosts(nextPage, false); // Fetch halaman berikutnya, bukan initial load
    }
  };

  const handlePostCreated = () => {
    // Reset ke halaman 1 dan fetch ulang untuk menampilkan postingan baru di atas.
    // Ini akan membuat `useEffect` di atas (jika dependensinya diatur dengan benar)
    // atau kita panggil fetchFeedPosts secara manual.
    setPage(1); // Reset state halaman
    // Panggil fetchFeedPosts(1, true) untuk memuat ulang dari awal sebagai initial load
    // Membersihkan posts sebelumnya agar pengguna melihat efek refresh
    setPosts([]);
    fetchFeedPosts(1, true);
  };

  if (isLoading && posts.length === 0) { // Hanya tampilkan loading besar jika ini load awal & belum ada post
    return <p className="text-center mt-10 text-gray-600 text-lg">Memuat Beranda...</p>;
  }

  if (error && posts.length === 0) { // Hanya tampilkan error besar jika ini load awal & gagal
    return <p className="text-center text-red-500 mt-10">Error: {error}</p>;
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl"> {/* Batasi lebar untuk tampilan feed yang lebih baik */}
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">Beranda</h1>
      
      <div className="mb-8">
        <CreatePostForm onPostCreated={handlePostCreated} />
      </div>

      {posts.length === 0 && !isLoading && !error && (
        <p className="text-center text-gray-500 mt-8">
          Belum ada postingan untuk ditampilkan di beranda Anda. <br />
          Coba buat postingan pertama atau cari teman baru!
        </p>
      )}
      
      {/* Tampilkan error di atas list jika terjadi saat load more atau setelah ada post */}
      {error && posts.length > 0 && <p className="text-center text-red-500 mb-4">Error memuat postingan baru: {error}</p>}


      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {isLoadingMore && <p className="text-center mt-4 text-gray-600">Memuat lebih banyak...</p>}
      
      {!isLoadingMore && hasMore && posts.length > 0 && (
        <div className="text-center mt-6 mb-8">
          <button
            onClick={loadMorePosts}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow hover:shadow-lg transition-all duration-150 disabled:opacity-70"
            disabled={isLoadingMore}
          >
            Muat Lebih Banyak
          </button>
        </div>
      )}
      {!hasMore && posts.length > 0 && (
        <p className="text-center text-gray-500 mt-6 mb-8">Anda telah mencapai akhir feed.</p>
      )}
    </div>
  );
}