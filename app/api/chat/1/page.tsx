// src/app/(main)/chat/[roomId]/page.tsx
"use client";

import { useParams, useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr'; // Import mutate untuk revalidasi
import { useEffect, useState, FormEvent, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// Tipe data untuk ChatMessage (sesuaikan dengan API Anda)
interface ChatMessageData {
  id: number;
  chat_room_id: number;
  sender_id: number;
  message_content: string;
  created_at: string;
  sender_username?: string;
  sender_profile_picture_url?: string | null;
}

// Tipe data untuk pengguna yang login (minimal)
interface LoggedInUser {
  id: number;
  username: string;
  // tambahkan properti lain jika perlu
}

// Fungsi fetcher global (bisa diimpor jika sudah ada)
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  if (!token) throw new Error('Autentikasi dibutuhkan.');
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const errorData = await res.json();
    const error = new Error(errorData.message || 'Gagal mengambil data.');
    // @ts-ignore
    error.status = res.status;
    if (res.status === 401 || res.status === 403) {
        // Handle redirect jika token tidak valid/akses ditolak
        // Ini bisa lebih baik ditangani dengan error boundary atau interceptor global
        if (typeof window !== "undefined") window.location.href = '/login';
    }
    throw error;
  }
  return res.json();
};

export default function ChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const messagesEndRef = useRef<HTMLDivElement | null>(null); // Untuk auto-scroll

  const [isClient, setIsClient] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [newMessageContent, setNewMessageContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Informasi pengguna lain di chat room (bisa diambil dari state navigasi atau fetch terpisah)
  // Untuk kesederhanaan, kita bisa ambil info ini dari data pesan pertama atau query tambahan.
  // Atau, saat navigasi dari daftar chat, Anda bisa mengirimkan info user lain melalui query params atau state global.
  // Untuk contoh ini, kita akan coba ambil dari pesan atau biarkan kosong dulu.
  const [otherUser, setOtherUser] = useState<{username: string, profilePictureUrl: string | null} | null>(null);


  useEffect(() => {
    setIsClient(true);
    const userDataString = localStorage.getItem('userData');
    if (userDataString) {
      try {
        setLoggedInUser(JSON.parse(userDataString));
      } catch (e) { console.error("Gagal parse user data di ChatRoomPage", e); }
    } else {
        router.replace('/login'); // Jika tidak ada user data, mungkin belum login
    }
  }, [router]);

  // SWR untuk mengambil pesan chat
  const messagesSWRKey = (isClient && roomId && loggedInUser) ? `/api/chat/rooms/${roomId}/messages?limit=50` : null; // Ambil 50 pesan terakhir
  const { 
    data: messages, 
    error: messagesError, 
    isLoading: isLoadingMessages,
    mutate: mutateMessages 
  } = useSWR<ChatMessageData[]>(messagesSWRKey, fetcher, {
    refreshInterval: 3000, // Revalidasi setiap 3 detik untuk pesan baru (polling sederhana)
    // onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
    //   if (error.status === 404 || error.status === 403) return // Jangan retry jika room tidak ada/akses ditolak
    //   if (retryCount >= 3) return // Stop retrying after 3 attempts
    //   setTimeout(() => revalidate({ retryCount }), 5000) // Retry after 5 seconds
    // }
  });

  // Auto-scroll ke pesan terakhir
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]); // Setiap kali messages berubah

  // Coba dapatkan info otherUser dari pesan pertama (jika ada dan bukan dari loggedInUser)
  useEffect(() => {
    if (messages && messages.length > 0 && loggedInUser && !otherUser) {
        const firstMessageFromOther = messages.find(msg => msg.sender_id !== loggedInUser.id);
        if (firstMessageFromOther) {
            setOtherUser({
                username: firstMessageFromOther.sender_username || 'User',
                profilePictureUrl: firstMessageFromOther.sender_profile_picture_url || null
            });
        }
        // Jika semua pesan dari loggedInUser, kita perlu cara lain untuk dapatkan info otherUser
        // Misalnya, dari API /api/chat/rooms (daftar chat) atau API khusus get room info
    }
  }, [messages, loggedInUser, otherUser]);


  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newMessageContent.trim() || !isClient || !loggedInUser) return;

    setIsSending(true);
    setSendError(null);
    const token = localStorage.getItem('jwtToken');

    // Optimistic UI update (opsional tapi bagus untuk UX)
    const optimisticMessage: ChatMessageData = {
        id: Date.now(), // ID sementara
        chat_room_id: parseInt(roomId),
        sender_id: loggedInUser.id,
        message_content: newMessageContent.trim(),
        created_at: new Date().toISOString(),
        sender_username: loggedInUser.username,
        // sender_profile_picture_url: loggedInUser.profilePictureUrl // Jika ada di LoggedInUser
    };
    mutateMessages((currentMessages = []) => [...currentMessages, optimisticMessage], false);
    setNewMessageContent(''); // Langsung kosongkan input

    try {
      const response = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ messageContent: optimisticMessage.message_content }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Gagal mengirim pesan.');
      }
      
      // Revalidate messages dari server untuk mendapatkan ID asli dan data yang benar
      // SWR akan mengganti pesan optimis dengan data server jika berbeda
      mutateMessages(); 

    } catch (err: any) {
      setSendError(err.message);
      console.error("Error sending message:", err);
      // Rollback optimistic update jika error
      mutateMessages((currentMessages = []) => currentMessages.filter(msg => msg.id !== optimisticMessage.id), false);
      setNewMessageContent(optimisticMessage.message_content); // Kembalikan teks ke input
    } finally {
      setIsSending(false);
    }
  };

  if (!isClient || !loggedInUser) { // Tunggu client dan loggedInUser siap
    return <div className="flex justify-center items-center h-screen"><p>Memuat data pengguna...</p></div>;
  }
  if (isLoadingMessages && !messages) { // Loading pesan awal
    return <div className="flex justify-center items-center h-screen"><p>Memuat percakapan...</p></div>;
  }
  // @ts-ignore
  if (messagesError) return <div className="p-4 text-red-500">Error memuat pesan: {messagesError.message}</div>;


  return (
    <div className="flex flex-col h-[calc(100vh-var(--navbar-height,4rem))] max-w-3xl mx-auto bg-white shadow-lg"> {/* Sesuaikan var(--navbar-height) */}
      {/* Header Chat Room */}
      <div className="p-3 sm:p-4 border-b border-gray-200 flex items-center space-x-3 sticky top-0 bg-white z-10">
        <Link href="/chat" className="text-blue-600 hover:text-blue-800">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </Link>
        {otherUser?.profilePictureUrl ? (
          <Image src={otherUser.profilePictureUrl} alt={otherUser.username} width={40} height={40} className="rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold">
            {otherUser?.username?.substring(0,1).toUpperCase() || '?'}
          </div>
        )}
        <h1 className="text-lg font-semibold text-gray-800">{otherUser?.username || 'Chat'}</h1>
      </div>

      {/* Daftar Pesan */}
      <div className="flex-grow p-3 sm:p-4 space-y-3 overflow-y-auto">
        {isLoadingMessages && !messages && <p className="text-center text-gray-500">Memuat pesan...</p>}
        {messages && messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender_id === loggedInUser.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] p-2.5 rounded-xl ${
                msg.sender_id === loggedInUser.id 
                ? 'bg-blue-500 text-white rounded-br-none' 
                : 'bg-gray-200 text-gray-800 rounded-bl-none'
            }`}>
              {/* Jika bukan pesan dari user login, tampilkan nama pengirim (opsional jika sudah ada di header) */}
              {/* {msg.sender_id !== loggedInUser.id && msg.sender_username && (
                <p className="text-xs font-semibold mb-0.5">{msg.sender_username}</p>
              )} */}
              <p className="text-sm whitespace-pre-wrap">{msg.message_content}</p>
              <p className={`text-xs mt-1 ${msg.sender_id === loggedInUser.id ? 'text-blue-100' : 'text-gray-500'} text-right`}>
                {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} /> {/* Elemen kosong untuk auto-scroll */}
      </div>

      {/* Form Kirim Pesan */}
      <div className="p-3 sm:p-4 border-t border-gray-200 bg-gray-50">
        {sendError && <p className="text-xs text-red-500 mb-1.5">{sendError}</p>}
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <input
            type="text"
            value={newMessageContent}
            onChange={(e) => setNewMessageContent(e.target.value)}
            placeholder="Ketik pesan Anda..."
            className="flex-grow p-2.5 text-black  border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={isSending}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isSending || !newMessageContent.trim()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {isSending ? '...' : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M3.105 3.105a.75.75 0 01.814-.102l14.25 5.25a.75.75 0 010 1.504l-14.25 5.25a.75.75 0 01-.916-1.285L5.723 10 3.003 4.487A.75.75 0 013.105 3.105z" />
                </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
