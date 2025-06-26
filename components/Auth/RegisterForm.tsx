// src/components/Auth/RegisterForm.tsx
"use client";

import { useState, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image'; // Untuk preview foto profil

export default function RegisterForm() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleProfilePictureChange = (event: ChangeEvent<HTMLInputElement>) => {
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
        setError("Tipe file foto profil tidak valid. Harap pilih gambar.");
        setProfilePictureFile(null);
        setProfilePicturePreview(null);
        if (event.target) event.target.value = '';
      }
    } else {
      setProfilePictureFile(null);
      setProfilePicturePreview(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    // Validasi frontend
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("Username, Email, dan Password tidak boleh kosong.");
      setIsLoading(false);
      return;
    }
    if (password.length < 6) {
      setError("Password minimal harus 6 karakter.");
      setIsLoading(false);
      return;
    }
    if (!profilePictureFile) {
      setError("Foto profil wajib diunggah.");
      setIsLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('username', username.trim());
    formData.append('email', email.trim());
    formData.append('password', password); // Password tidak di-trim
    if (fullName.trim()) formData.append('fullName', fullName.trim());
    if (bio.trim()) formData.append('bio', bio.trim());
    formData.append('profilePictureFile', profilePictureFile);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        body: formData,
        // Header Content-Type tidak perlu di-set manual untuk FormData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Registrasi gagal. Silakan coba lagi.');
      }

      setSuccessMessage('Registrasi berhasil! Anda akan diarahkan ke halaman login.');
      setUsername(''); setEmail(''); setPassword(''); setFullName(''); setBio('');
      setProfilePictureFile(null); setProfilePicturePreview(null);
      const fileInput = document.getElementById('profilePictureFile-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      setTimeout(() => { router.push('/login'); }, 2500);

    } catch (err: any) {
      setError(err.message);
      console.error('Registration error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 sm:p-8 bg-white shadow-xl rounded-lg border border-gray-200 w-full max-w-md">
      <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-800">Buat Akun Baru Anda</h2>
      
      {error && <p className="text-red-500 text-sm text-center py-2 bg-red-50 rounded-md border border-red-200">{error}</p>}
      {successMessage && <p className="text-green-600 text-sm text-center py-2 bg-green-50 rounded-md border border-green-200">{successMessage}</p>}

      {/* --- INPUT FIELD YANG ESENSIAL --- */}
      <div>
        <label htmlFor="username" className="block text-sm  font-medium text-gray-700 mb-1">
          Username <span className="text-red-500">*</span>
        </label>
        <input
          id="username" name="username" type="text" autoComplete="username" required
          className="mt-1 block w-full px-3  text-gray-700 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={username} onChange={(e) => setUsername(e.target.value)} disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          id="email" name="email" type="email" autoComplete="email" required
          className="mt-1 block w-full px-3 py-2 text-gray-700 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password <span className="text-red-500">*</span>
        </label>
        <input
          id="password" name="password" type="password" autoComplete="new-password" required
          className="mt-1 block w-full px-3 text-gray-700 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
          Nama Lengkap <span className="text-xs text-gray-500">(Opsional)</span>
        </label>
        <input
          id="fullName" name="fullName" type="text" autoComplete="name"
          className="mt-1 block w-full px-3 text-gray-700 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={isLoading}
        />
      </div>
      {/* --- AKHIR INPUT FIELD ESENSIAL --- */}

      {/* Input untuk Foto Profil */}
      <div className="col-span-full">
        <label htmlFor="profilePictureFile-input" className="block text-sm font-medium leading-6 text-gray-700 mb-1">
          Foto Profil <span className="text-red-500">*</span>
        </label>
        <div className="mt-1 flex items-center gap-x-3">
          {profilePicturePreview ? (
            <Image src={profilePicturePreview} alt="Preview Foto Profil" width={48} height={48} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <span className="inline-block h-12 w-12 overflow-hidden rounded-full bg-gray-100">
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
            required
            onChange={handleProfilePictureChange}
            className="block w-full text-sm text-gray-500
              file:mr-3 file:py-1.5 file:px-3 file:cursor-pointer
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-600
              hover:file:bg-blue-100"
            disabled={isLoading}
          />
        </div>
         {profilePictureFile && (
            <button 
                type="button" 
                onClick={() => { 
                    setProfilePictureFile(null); 
                    setProfilePicturePreview(null); 
                    const fileInput = document.getElementById('profilePictureFile-input') as HTMLInputElement;
                    if (fileInput) fileInput.value = '';
                }}
                className="mt-1.5 text-xs text-red-600 hover:underline"
                disabled={isLoading}
            >
                Hapus Foto
            </button>
        )}
      </div>

      {/* Input untuk Bio (opsional) */}
      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
            Bio <span className="text-xs  text-gray-500">(Opsional)</span>
        </label>
        <textarea
            id="bio" name="bio" rows={2}
            className="mt-1 text-gray-700 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={bio} onChange={(e) => setBio(e.target.value)} disabled={isLoading}
        />
      </div>

      <div>
        <button type="submit" disabled={isLoading || !profilePictureFile} /* Foto profil wajib */
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-70">
          {isLoading ? 'Memproses...' : 'Daftar Akun'}
        </button>
      </div>

      <p className="text-sm text-center text-gray-600 pt-2">
        Sudah punya akun?{' '}
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500 hover:underline">
          Login di sini
        </Link>
      </p>
    </form>
  );
}