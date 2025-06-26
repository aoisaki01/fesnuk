// src/app/(main)/profile/edit/page.tsx
"use client";

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import useSWR, { mutate } from 'swr'; // Impor mutate untuk revalidasi global jika perlu
import { useRouter } from 'next/navigation';
import Image from 'next/image';

// Tipe data untuk profil pengguna
interface UserProfileData {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  profile_picture_url: string | null;
  bio: string | null;
  // created_at & updated_at mungkin tidak perlu di form edit
}

// Fungsi fetcher (bisa diimpor jika sudah ada global)
const fetcher = async (url: string) => {
  const token = localStorage.getItem('jwtToken');
  const res = await fetch(url, {
    headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || 'Gagal mengambil data.');
  }
  return res.json();
};

export default function EditProfilePage() {
  const router = useRouter();

  // State untuk form input
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);
  const [currentProfilePictureUrl, setCurrentProfilePictureUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Ambil data profil pengguna saat ini untuk mengisi form
  const { data: currentProfile, error: profileError } = useSWR<UserProfileData>(
    '/api/profile', // API untuk mengambil profil sendiri
    fetcher
  );

  useEffect(() => {
    if (currentProfile) {
      setFullName(currentProfile.full_name || '');
      setBio(currentProfile.bio || '');
      setCurrentProfilePictureUrl(currentProfile.profile_picture_url);
      setProfilePicturePreview(currentProfile.profile_picture_url); // Tampilkan foto profil saat ini sebagai preview awal
    }
  }, [currentProfile]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setProfilePictureFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setProfilePicturePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
        setError(null);
      } else {
        setError("Hanya file gambar yang diizinkan untuk foto profil.");
        setProfilePictureFile(null);
        // Jangan reset preview jika user hanya salah pilih, biarkan preview lama
        if (event.target) event.target.value = '';
      }
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setError('Sesi tidak valid. Silakan login kembali.');
      setIsLoading(false);
      return;
    }

    const formData = new FormData();
    // Hanya append field jika ada perubahan atau jika itu file
    // Untuk fullName dan bio, kita bisa selalu mengirim nilainya.
    // API akan menangani jika nilainya sama atau jika ingin dikosongkan.
    formData.append('fullName', fullName);
    formData.append('bio', bio);
    if (profilePictureFile) {
      formData.append('profilePictureFile', profilePictureFile);
    }

    try {
      const response = await fetch('/api/profile', { // API untuk update profil
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }, // Content-Type diatur otomatis untuk FormData
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Gagal memperbarui profil.');
      }

      setSuccessMessage('Profil berhasil diperbarui!');
      // Update data pengguna di localStorage jika ada perubahan signifikan (misal, URL foto profil)
      if (data.user && data.user.profile_picture_url !== currentProfile?.profile_picture_url) {
        // Update data user di localStorage agar Navbar juga update
        const userDataString = localStorage.getItem('userData');
        if(userDataString) {
            const localUserData = JSON.parse(userDataString);
            localUserData.profilePictureUrl = data.user.profile_picture_url;
            localUserData.fullName = data.user.full_name; // Update juga nama jika berubah
            localStorage.setItem('userData', JSON.stringify(localUserData));
        }
      }
      if (data.user?.profile_picture_url) {
        setProfilePicturePreview(data.user.profile_picture_url); // Update preview ke foto baru dari server
        setCurrentProfilePictureUrl(data.user.profile_picture_url);
      }
      setProfilePictureFile(null); // Reset pilihan file

      // Revalidasi data profil jika menggunakan SWR di tempat lain yang menampilkan info ini
      mutate('/api/profile'); // Revalidasi SWR untuk halaman ini sendiri
      if (currentProfile?.username) {
        mutate(`/api/users/${currentProfile.username}`); // Revalidasi halaman profil publik jika key-nya username
      }


      // Arahkan kembali ke halaman profil atau tampilkan pesan sukses
      // setTimeout(() => router.push(`/${currentProfile?.username}`), 2000);

    } catch (err: any) {
      setError(err.message);
      console.error('Update profile error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (profileError) return <p className="text-center text-red-500">Gagal memuat data profil. Coba lagi nanti.</p>;
  if (!currentProfile && !isLoading) return <p className="text-center text-gray-500">Memuat data profil...</p>; // Atau jika !isClient
  if (!currentProfile) return <p className="text-center text-gray-500">Memuat data profil...</p>; // State loading awal SWR


  return (
    <div className="container mx-auto p-4 max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-6 p-6 sm:p-8 bg-white shadow-xl rounded-lg border border-gray-200">
        <h1 className="text-2xl font-bold text-center text-gray-800">Edit Profil Anda</h1>
        
        {error && <p className="text-red-500 text-sm text-center py-2 bg-red-50 rounded-md border border-red-200">{error}</p>}
        {successMessage && <p className="text-green-600 text-sm text-center py-2 bg-green-50 rounded-md border border-green-200">{successMessage}</p>}

        <div className="col-span-full">
          <label htmlFor="profilePictureFile-input" className="block text-sm font-medium leading-6 text-gray-700 mb-1">
            Foto Profil
          </label>
          <div className="mt-1 flex items-center gap-x-3">
            {profilePicturePreview ? (
              <Image src={profilePicturePreview} alt="Foto Profil" width={80} height={80} className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <span className="inline-block h-20 w-20 overflow-hidden rounded-full bg-gray-100">
                <svg className="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </span>
            )}
            <input
              id="profilePictureFile-input"
              name="profilePictureFile"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block  w-full text-sm text-gray-500
                file:mr-3 file:py-1.5 file:px-3 file:cursor-pointer
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-600
                hover:file:bg-blue-100"
              disabled={isLoading}
            />
          </div>
        </div>

        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
            Nama Lengkap
          </label>
          <input
            id="fullName" type="text" autoComplete="name"
            value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="mt-1  block w-full px-3 py-2 border text-gray-700 border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
            Bio
          </label>
          <textarea
            id="bio" name="bio" rows={3}
            value={bio} onChange={(e) => setBio(e.target.value)}
            className="mt-1 block text-gray-700 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={isLoading}
          />
        </div>
        
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70"
          >
            {isLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </div>
  );
}