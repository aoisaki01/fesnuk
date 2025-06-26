// src/app/(main)/chat/[roomId]/page.tsx
"use client";

import { useParams, useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { useEffect, useState, FormEvent, useRef, ChangeEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
// Impor ikon jika Anda ingin menggunakannya
import { PaperClipIcon, XCircleIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid'; // Contoh ikon dari heroicons

// Tipe data untuk ChatMessage (termasuk attachment)
interface ChatMessageData {
  id: number;
  chat_room_id: number;
  sender_id: number;
  message_content: string | null;
  attachment_url: string | null;
  attachment_type: string | null; // 'image', 'video', dll.
  created_at: string;
  sender_username?: string;
  sender_profile_picture_url?: string | null;
}
interface LoggedInUser { id: number; username: string; profilePictureUrl?: string | null; }

const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  if (!token && !url.includes('/api/users/')) { // Izinkan fetch profil user tanpa token jika API-nya publik
    // Untuk chat, token wajib
     if (url.includes('/api/chat/')) {
        console.error("Fetcher: Token autentikasi dibutuhkan untuk mengambil data chat.");
        throw new Error('Autentikasi dibutuhkan.');
     }
  }
  const res = await fetch(url, {
    headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
  });
  if (!res.ok) {
    let errorData;
    try { errorData = await res.json(); }
    catch (e) { errorData = { message: `Request gagal dengan status ${res.status}` }; }
    const error = new Error(errorData.message || 'Gagal mengambil data.');
    // @ts-ignore
    error.status = res.status;
    if ((res.status === 401 || res.status === 403) && url.includes('/api/chat/')) {
        if (typeof window !== "undefined") {
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('userData');
            // window.location.href = '/login'; // Redirect keras jika perlu
        }
    }
    throw error;
  }
  return res.json();
};

export default function ChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isClient, setIsClient] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [newMessageContent, setNewMessageContent] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<{id: number, username: string, profilePictureUrl: string | null} | null>(null);

  useEffect(() => {
    setIsClient(true);
    const userDataString = localStorage.getItem('userData');
    if (userDataString) {
      try {
        setLoggedInUser(JSON.parse(userDataString));
      } catch (e) { console.error("Gagal parse user data di ChatRoomPage", e); router.replace('/login'); }
    } else {
      router.replace('/login');
    }
  }, [router]);

  const messagesSWRKey = (isClient && roomId && loggedInUser) ? `/api/chat/rooms/${roomId}/messages?limit=50` : null;
  const { 
    data: messages, 
    error: messagesError, 
    isLoading: isLoadingMessages,
    mutate: mutateMessages 
  } = useSWR<ChatMessageData[]>(messagesSWRKey, fetcher, {
    refreshInterval: 3000, // Polling sederhana, idealnya WebSockets
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Mengambil informasi otherUser dari data room (jika API room mengirimkannya)
  // atau dari pesan pertama.
  const roomInfoSWRKey = (isClient && roomId && loggedInUser) ? `/api/chat/rooms/${roomId}/info` : null; // Anda perlu API ini
  // Untuk sementara, kita ambil dari pesan atau hardcode jika perlu
  useEffect(() => {
    if (messages && messages.length > 0 && loggedInUser && !otherUser) {
        const firstMessage = messages[0]; // Bisa pesan dari siapa saja
        let targetId = null;
        // Asumsi API GET /api/chat/rooms (list) mengembalikan user1_id dan user2_id
        // dan API GET /api/chat/rooms/[roomId]/info juga mengembalikan ini
        // Untuk saat ini, kita coba infer dari sender_id pesan
        if (firstMessage.sender_id !== loggedInUser.id) {
            targetId = firstMessage.sender_id;
            setOtherUser({
                id: firstMessage.sender_id,
                username: firstMessage.sender_username || 'User',
                profilePictureUrl: firstMessage.sender_profile_picture_url || null
            });
        } else if (messages.length > 1) { // Cari pesan dari orang lain
            const otherMessage = messages.find(msg => msg.sender_id !== loggedInUser.id);
            if (otherMessage) {
                targetId = otherMessage.sender_id;
                 setOtherUser({
                    id: otherMessage.sender_id,
                    username: otherMessage.sender_username || 'User',
                    profilePictureUrl: otherMessage.sender_profile_picture_url || null
                });
            }
        }
        // Jika otherUser masih null, Anda perlu cara lain untuk mendapatkannya,
        // misal dari API GET /api/chat/rooms (list) yang dipass via state/query saat navigasi,
        // atau API khusus untuk get room details: GET /api/chat/rooms/[roomId] (yang mengembalikan info kedua partisipan)
    }
    // Jika tidak ada pesan, otherUser akan tetap null. Idealnya, info otherUser didapat saat membuka room.
    // Ini bisa diambil dari API GET /api/chat/rooms (yang mengambil list room) atau
    // API POST /api/chat/rooms (yang membuat/mendapatkan room) sudah mengembalikan info otherUser.
    // Jika Anda navigasi dari UserProfilePage, Anda sudah punya targetUserId.
  }, [messages, loggedInUser, otherUser]);


  const handleFileAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        setAttachmentFile(file);
        const reader = new FileReader();
        reader.onloadend = () => { setAttachmentPreview(reader.result as string); };
        reader.readAsDataURL(file);
        setSendError(null);
      } else {
        setSendError("Tipe file tidak didukung (hanya gambar/video).");
        setAttachmentFile(null); setAttachmentPreview(null);
        if (event.target) event.target.value = '';
      }
    } else {
      setAttachmentFile(null); setAttachmentPreview(null);
    }
  };

  const removeAttachment = () => {
    setAttachmentFile(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((!newMessageContent.trim() && !attachmentFile) || !isClient || !loggedInUser) {
        setSendError("Pesan atau lampiran tidak boleh kosong.");
        return;
    }

    setIsSending(true);
    setSendError(null);
    const token = localStorage.getItem('jwtToken');

    const formData = new FormData();
    if (newMessageContent.trim()) {
      formData.append('messageContent', newMessageContent.trim());
    }
    if (attachmentFile) {
      formData.append('attachmentFile', attachmentFile);
    }

    // Optimistic UI Update
    const tempId = Date.now(); // ID sementara untuk UI
    const optimisticMessage: ChatMessageData = {
        id: tempId,
        chat_room_id: parseInt(roomId),
        sender_id: loggedInUser.id,
        message_content: newMessageContent.trim() || null,
        attachment_url: attachmentFile ? URL.createObjectURL(attachmentFile) : null, // URL sementara untuk preview
        attachment_type: attachmentFile ? (attachmentFile.type.startsWith('image/') ? 'image' : 'video') : null,
        created_at: new Date().toISOString(),
        sender_username: loggedInUser.username,
        sender_profile_picture_url: loggedInUser.profilePictureUrl || null,
    };

    mutateMessages((currentMessages = []) => [...currentMessages, optimisticMessage], false);
    setNewMessageContent('');
    removeAttachment(); // Reset attachment setelah optimis

    try {
      const response = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }, // Content-Type diatur otomatis oleh browser untuk FormData
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Gagal mengirim pesan.');
      }
      
      // Revalidate messages dari server untuk mendapatkan data asli (termasuk URL attachment dari server)
      // SWR akan otomatis mengganti pesan optimis dengan data server jika key (ID) cocok,
      // atau Anda bisa memfilter pesan optimis dan menambahkan pesan server.
      // Cara sederhana: revalidasi penuh.
      mutateMessages(); 

    } catch (err: any) {
      setSendError(err.message);
      console.error("Error sending message:", err);
      // Rollback optimistic update jika error
      mutateMessages((currentMessages = []) => currentMessages.filter(msg => msg.id !== optimisticMessage.id), false);
      // Kembalikan input jika perlu (opsional)
      // setNewMessageContent(optimisticMessage.message_content || '');
      // setAttachmentFile(attachmentFile); // Ini lebih rumit karena File object
      // setAttachmentPreview(optimisticMessage.attachment_url);
    } finally {
      setIsSending(false);
    }
  };

  if (!isClient || !loggedInUser) {
    return <div className="flex justify-center items-center h-screen"><p className="text-gray-600">Memuat data pengguna...</p></div>;
  }
  if (isLoadingMessages && !messages) {
    return <div className="flex justify-center items-center h-screen"><p className="text-gray-600">Memuat percakapan...</p></div>;
  }
  // @ts-ignore
  if (messagesError && messagesError.status === 403) {
    return <div className="p-4 text-red-600 text-center">Anda tidak memiliki akses ke ruang chat ini atau ruang chat tidak ditemukan.</div>;
  }
  // @ts-ignore
  if (messagesError) return <div className="p-4 text-red-600 text-center">Error memuat pesan: {messagesError.message}</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto bg-white shadow-lg border border-gray-200 rounded-b-lg"> {/* Sesuaikan tinggi navbar */}
      {/* Header Chat Room */}
      <div className="p-3 sm:p-4 border-b border-gray-200 flex items-center space-x-3 sticky top-0 bg-white z-10">
        <Link href="/chat" className="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-gray-100">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </Link>
        {otherUser?.profilePictureUrl ? (
          <Image src={otherUser.profilePictureUrl} alt={otherUser.username} width={36} height={36} className="rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold text-sm">
            {otherUser?.username?.substring(0,1).toUpperCase() || '?'}
          </div>
        )}
        <h1 className="text-md sm:text-lg font-semibold text-gray-800">{otherUser?.username || 'Chat'}</h1>
      </div>

      {/* Daftar Pesan */}
      <div className="flex-grow p-3 sm:p-4 space-y-3 overflow-y-auto bg-gray-50">
        {isLoadingMessages && !messages && <p className="text-center text-gray-500 text-sm">Memuat pesan...</p>}
        {messages && messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender_id === loggedInUser.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] sm:max-w-[65%] p-2.5 rounded-xl shadow-sm ${
                msg.sender_id === loggedInUser.id 
                ? 'bg-blue-500 text-white rounded-br-none' 
                : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
            }`}>
              {/* Tampilkan Attachment jika ada */}
              {msg.attachment_url && (
                <div className="mb-1.5">
                  {msg.attachment_type === 'image' ? (
                    <Image src={msg.attachment_url} alt="Lampiran Gambar" width={250} height={200} className="rounded-md object-contain max-h-64 w-auto" />
                  ) : msg.attachment_type === 'video' ? (
                    <video src={msg.attachment_url} controls className="rounded-md max-h-64 w-auto">Browser Anda tidak mendukung tag video.</video>
                  ) : (
                    <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:underline">Lihat Lampiran</a>
                  )}
                </div>
              )}
              {/* Tampilkan Konten Pesan jika ada */}
              {msg.message_content && (
                <p className="text-sm whitespace-pre-wrap">{msg.message_content}</p>
              )}
              <p className={`text-xs mt-1.5 ${msg.sender_id === loggedInUser.id ? 'text-blue-100' : 'text-gray-400'} text-right`}>
                {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Form Kirim Pesan dengan Attachment */}
      <div className="p-3 sm:p-4 border-t border-gray-200 bg-white">
        {sendError && <p className="text-xs text-red-500 mb-1.5">{sendError}</p>}
        {attachmentPreview && (
          <div className="mb-2 p-2 border rounded-md bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
                {attachmentFile?.type.startsWith('image/') ? (
                    <Image src={attachmentPreview} alt="Preview Lampiran" width={40} height={40} className="h-10 w-10 rounded object-cover" />
                ) : attachmentFile?.type.startsWith('video/') ? (
                    <video src={attachmentPreview} className="h-10 w-10 rounded object-cover bg-black" width="40" height="40" />
                ) : null}
                <span className="text-xs text-gray-600 truncate max-w-[150px] sm:max-w-xs">{attachmentFile?.name}</span>
            </div>
            <button onClick={removeAttachment} className="p-1 text-gray-500 hover:text-red-500" title="Hapus Lampiran">
              <XCircleIcon className="w-5 h-5" />
            </button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <label htmlFor="chat-file-input" className="p-2.5 text-gray-500 hover:text-blue-600 cursor-pointer rounded-lg hover:bg-gray-100">
            <PaperClipIcon className="w-5 h-5" />
          </label>
          <input
            id="chat-file-input"
            type="file"
            accept="image/*,video/*"
            ref={fileInputRef}
            onChange={handleFileAttachmentChange}
            className="hidden"
            disabled={isSending}
          />
          <input
            type="text"
            value={newMessageContent}
            onChange={(e) => setNewMessageContent(e.target.value)}
            placeholder="Ketik pesan Anda..."
            className="flex-grow text-black p-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={isSending}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isSending || (!newMessageContent.trim() && !attachmentFile)}
            className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            title="Kirim Pesan"
          >
            {isSending ? 
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                : <PaperAirplaneIcon className="w-5 h-5" />
            }
          </button>
        </form>
      </div>
    </div>
  );
}
