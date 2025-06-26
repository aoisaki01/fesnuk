// src/components/Feed/CreatePostForm.tsx
"use client";

import Image from 'next/image';
import { useState, FormEvent, ChangeEvent, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';

interface CreatePostFormProps {
  onPostCreated: () => void;
}

interface UserSuggestion {
  id: number;
  username: string;
  full_name: string | null;
  profile_picture_url: string | null;
}

const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, {
    headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
  });
  if (!res.ok) {
    let errorData;
    try { errorData = await res.json(); }
    catch (e) { errorData = { message: `Request failed with status ${res.status}` }; }
    const error = new Error(errorData.message || 'Gagal mengambil data sugesti.');
    // @ts-ignore
    error.status = res.status;
    throw error;
  }
  return res.json();
};

export default function CreatePostForm({ onPostCreated }: CreatePostFormProps) {
  const [content, setContent] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingRegularPost, setIsLoadingRegularPost] = useState(false);
  const [isStartingLive, setIsStartingLive] = useState(false);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  const { 
    data: userSuggestionsData,
    error: suggestionsError, 
    isLoading: isLoadingSuggestions 
  } = useSWR<UserSuggestion[]>(
    (mentionQuery && mentionQuery.length > 0) ? `/api/search/users?q=${encodeURIComponent(mentionQuery)}&limit=5` : null,
    fetcher,
    { dedupingInterval: 300 }
  );
  const userSuggestions = userSuggestionsData || [];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
        textareaRef.current && !textareaRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    if (showSuggestions) {
        document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSuggestions]);

  useEffect(() => {
    if (showSuggestions && userSuggestions.length > 0) {
        setActiveSuggestionIndex(0);
    }
  }, [showSuggestions, userSuggestions]);

  const handleContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = event.target.value;
    setContent(newContent);

    const cursorPos = event.target.selectionStart;
    if (cursorPos === null) { setShowSuggestions(false); setMentionQuery(null); return; }
    const textBeforeCursor = newContent.substring(0, cursorPos);
    const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');
    const charBeforeAt = lastAtSymbolIndex > 0 ? textBeforeCursor[lastAtSymbolIndex - 1] : ' ';

    if (lastAtSymbolIndex !== -1 && (/\s/.test(charBeforeAt) || lastAtSymbolIndex === 0)) {
      const potentialQuery = textBeforeCursor.substring(lastAtSymbolIndex + 1);
      if (!/\s/.test(potentialQuery) && potentialQuery.length >= 1) {
        setMentionQuery(potentialQuery);
        setShowSuggestions(true);
      } else {
         if (/\s/.test(potentialQuery) && potentialQuery.trim().length > 0) {
            setShowSuggestions(false); setMentionQuery(null);
         } else if (potentialQuery.length === 0 && newContent[cursorPos-1] === '@') {
            setMentionQuery(''); setShowSuggestions(true);
         } else {
            setShowSuggestions(false); setMentionQuery(null);
         }
      }
    } else {
      setShowSuggestions(false); setMentionQuery(null);
    }
  };

  const handleSuggestionClick = (usernameToInsert: string) => {
    if (!textareaRef.current) return;
    const currentContent = textareaRef.current.value;
    let cursorPos = textareaRef.current.selectionStart;
    if (cursorPos === null) return;
    let textBeforeCursor = currentContent.substring(0, cursorPos);
    let lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');
    const charBeforeAt = lastAtSymbolIndex > 0 ? textBeforeCursor[lastAtSymbolIndex - 1] : ' ';
    if (lastAtSymbolIndex === -1 || !(/\s/.test(charBeforeAt) || lastAtSymbolIndex === 0)) {
        setShowSuggestions(false); setMentionQuery(null); return;
    }
    const textBeforeMentionQuery = currentContent.substring(0, lastAtSymbolIndex);
    const textAfterCursorOriginal = currentContent.substring(cursorPos);
    const newContent = `${textBeforeMentionQuery}@${usernameToInsert} ${textAfterCursorOriginal}`;
    setContent(newContent);
    const newCursorPos = textBeforeMentionQuery.length + `@${usernameToInsert} `.length;
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
    setShowSuggestions(false); setMentionQuery(null);
  };

  const handleKeyDownOnTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && userSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestionIndex(prev => (prev + 1) % userSuggestions.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestionIndex(prev => (prev - 1 + userSuggestions.length) % userSuggestions.length); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        if (activeSuggestionIndex >= 0 && activeSuggestionIndex < userSuggestions.length) {
          e.preventDefault(); handleSuggestionClick(userSuggestions[activeSuggestionIndex].username);
        }
      } else if (e.key === 'Escape') { e.preventDefault(); setShowSuggestions(false); setMentionQuery(null); }
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        setMediaFile(file);
        const reader = new FileReader();
        reader.onloadend = () => { setMediaPreview(reader.result as string); };
        reader.readAsDataURL(file);
        setError(null);
      } else {
        setError("Tipe file tidak didukung. Harap pilih gambar atau video.");
        setMediaFile(null); setMediaPreview(null);
        if (event.target) event.target.value = '';
      }
    } else { setMediaFile(null); setMediaPreview(null); }
  };

  // --- PERUBAHAN: handleSubmitRegularPost tidak lagi menerima event ---
  const doSubmitRegularPost = async () => {
    if (content.trim() === '' && !mediaFile) {
      setError('Konten postingan atau file media tidak boleh kosong.');
      return;
    }
    setIsLoadingRegularPost(true); setError(null);
    const token = localStorage.getItem('jwtToken');
    if (!token) { setError('Anda harus login untuk membuat postingan.'); setIsLoadingRegularPost(false); return; }

    const formData = new FormData();
    formData.append('content', (content.trim() === '' && mediaFile) ? '' : content);
    if (mediaFile) formData.append('mediaFile', mediaFile);

    try {
      const response = await fetch('/api/posts', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Gagal membuat postingan.');
      setContent(''); setMediaFile(null); setMediaPreview(null);
      const fileInput = document.getElementById('mediaFile-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      setError(null); onPostCreated();
    } catch (err: any) { setError(err.message); console.error('Create regular post error:', err);
    } finally { setIsLoadingRegularPost(false); }
  };
  // --- AKHIR PERUBAHAN ---

  const handleGoLive = async () => { /* ... (sama) ... */ };
  const removeMediaFile = () => { /* ... (sama) ... */ };

  return (
    <div className="mb-6 p-4 bg-white shadow-md rounded-lg border text-black border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">Buat Sesuatu...</h3>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      
      <div className="space-y-3">
        <div className="relative">
          <label htmlFor="postContentTextarea" className="sr-only">Konten Postingan</label>
          <textarea
            id="postContentTextarea" ref={textareaRef} rows={4}
            className="mt-1 text-black block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Apa yang Anda pikirkan? Ketik @ untuk mention pengguna..."
            value={content} onChange={handleContentChange} onKeyDown={handleKeyDownOnTextarea}
            disabled={isLoadingRegularPost || isStartingLive}
          />
          {showSuggestions && (
            <ul ref={suggestionsRef} className="absolute z-20 mt-1 w-full bg-white shadow-lg max-h-48 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
              {isLoadingSuggestions && <li className="text-gray-500 px-3 py-2 text-xs">Mencari pengguna...</li>}
              {suggestionsError && <li className="text-red-500 px-3 py-2 text-xs">Gagal memuat sugesti.</li>}
              {!isLoadingSuggestions && !suggestionsError && userSuggestions.length === 0 && mentionQuery && mentionQuery.length > 0 && (
                <li className="text-gray-500 px-3 py-2 text-xs">Tidak ada pengguna ditemukan untuk "@{mentionQuery}".</li>
              )}
              {userSuggestions.map((user, index) => (
                <li key={user.id} onClick={() => handleSuggestionClick(user.username)}
                  onMouseDown={(e) => e.preventDefault()}
                  className={`text-gray-900 cursor-pointer select-none relative py-2 px-3 hover:bg-blue-100 group text-sm ${index === activeSuggestionIndex ? 'bg-blue-100' : ''}`}
                >
                  <div className="flex items-center">
                    {user.profile_picture_url ? (
                      <Image src={user.profile_picture_url} alt={user.username} width={24} height={24} className="w-6 h-6 rounded-full mr-2 object-cover flex-shrink-0"/>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-300 mr-2 flex-shrink-0 flex items-center justify-center text-white text-xs">
                        {user.username.substring(0,1).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium block truncate">{user.full_name || user.username}</span>
                    <span className="ml-1 text-xs text-gray-500 group-hover:text-blue-700">@{user.username}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div> {/* Input File */}
          <label htmlFor="mediaFile-input" className="block text-sm font-medium text-gray-700 mb-1">
            Unggah Gambar/Video (Opsional)
          </label>
          <input
            id="mediaFile-input" name="mediaFile" type="file" accept="image/*,video/*"
            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            onChange={handleFileChange} disabled={isLoadingRegularPost || isStartingLive}
          />
          {mediaPreview && mediaFile && (
            <div className="mt-3 border rounded-md p-2 inline-block bg-gray-50">
              <p className="text-xs text-gray-500 mb-1">Preview:</p>
              {mediaFile.type.startsWith('image/') && mediaPreview && (
                <Image src={mediaPreview} alt="Preview" width={150} height={150} className="object-contain max-h-36 w-auto rounded bg-gray-100" />
              )}
              {mediaFile.type.startsWith('video/') && mediaPreview && (
                <video src={mediaPreview} controls className="max-h-36 w-auto rounded" width="200" />
              )}
               <button type="button" onClick={removeMediaFile} className="mt-2 block text-xs text-red-600 hover:underline" disabled={isLoadingRegularPost || isStartingLive}>
                   Hapus Media
               </button>
            </div>
          )}
        </div>

        <div className="flex justify-end items-center space-x-3 pt-2">
          {/* <button type="button" onClick={handleGoLive} ... > {isStartingLive ? 'Memulai...' : '🔴 Siaran Langsung'} </button> */}
          <button
            type="button" 
            onClick={doSubmitRegularPost} // <-- PERUBAHAN: Panggil fungsi baru
            disabled={isLoadingRegularPost || isStartingLive || (content.trim() === '' && !mediaFile)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isLoadingRegularPost ? 'Memposting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
