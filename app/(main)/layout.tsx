// src/app/(main)/layout.tsx
"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import NotificationBell from '@/components/Layout/NotificationBell';

// Tipe data untuk pengguna
interface UserData {
  id: number;
  username: string;
  email?: string;
  fullName?: string | null;
  profilePictureUrl?: string | null;
}

// Komponen Navbar
function AppNavbar() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // State untuk menu mobile
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
    const storedUserData = localStorage.getItem('userData');
    if (storedUserData) {
      try {
        const parsedData = JSON.parse(storedUserData);
        setUserData(parsedData);
      } catch (e) {
        console.error("Gagal parse userData dari localStorage di Navbar:", e);
        // Hapus sesi jika data korup dan redirect
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('userData');
        if (typeof window !== "undefined" && !window.location.pathname.startsWith('/login')) {
            router.replace('/login');
        }
      }
    } else {
      const token = localStorage.getItem('jwtToken');
      if (!token && typeof window !== "undefined" && 
          !window.location.pathname.startsWith('/login') && 
          !window.location.pathname.startsWith('/register')) {
        router.replace('/login');
      }
    }
  }, [router]);
  
  // Efek untuk mencegah scroll body saat menu mobile terbuka
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto'; // Pastikan kembali normal saat komponen unmount
    };
  }, [isMobileMenuOpen]);


  const handleLogout = () => {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userData');
    router.replace('/login');
  };

  const navigateToProfile = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (userData?.username) {
      const profilePath = `/profile/${userData.username}`;
      router.push(profilePath);
      setIsMobileMenuOpen(false); // Tutup menu setelah navigasi
    }
  };
  
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  // Daftar item menu untuk reusabilitas
  const menuItems = (
    <>
        <Link href="/feed" onClick={closeMobileMenu} className="text-gray-700 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium">Feed</Link>
        <Link href="/search/users" onClick={closeMobileMenu} className="text-gray-700 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium">Cari User</Link>
        <Link href="/trending" onClick={closeMobileMenu} className="text-gray-700 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium">Trending</Link>
        <Link href="/chat" onClick={closeMobileMenu} className="text-gray-700 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium">Chat</Link>
        <Link href="/reels" onClick={closeMobileMenu} className="text-gray-700 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium">Reels</Link>
    </>
  );

  if (!isClient) {
    // Placeholder Navbar saat SSR
    return (
     <nav className="bg-white shadow-md border-b border-gray-200 sticky top-0 z-50">
       <div className="container mx-auto px-4 sm:px-6 lg:px-8">
         <div className="flex items-center justify-between h-16">
           <div className="font-bold text-xl text-blue-600">Fesnuk</div>
           <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
         </div>
       </div>
     </nav>
    );
  }

  return (
    <>
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/feed" className="font-bold text-xl text-blue-600 flex-shrink-0">
                Fesnuk
              </Link>
              {/* Menu Desktop */}
              <div className="hidden md:block">
                <div className="ml-10 flex items-baseline space-x-4">
                  {menuItems}
                </div>
              </div>
            </div>
            
            {/* Bagian Kanan Navbar */}
            <div className="flex items-center">
                {/* Menu Desktop Kanan */}
                <div className="hidden md:flex items-center  space-x-3">
                    {userData && <NotificationBell />} 
                    {userData ? (
                        <>
                            <a href={userData.username ? `/profile/${userData.username}` : '#'} onClick={navigateToProfile} className="flex items-center text-sm text-gray-700 hover:bg-gray-100 p-2 rounded-full cursor-pointer" title="Profil Saya">
                                <div className="flex-shrink-0 w-8 h-8">
                                    {userData.profilePictureUrl ? (
                                        <Image src={userData.profilePictureUrl} alt={userData.username || "Avatar"} width={32} height={32} className="rounded-full object-cover w-10 h-10 w-10 h-10 w-full h-full" />
                                    ) : (
                                        <div className="w-full h-full rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-semibold">
                                            {userData.username ? userData.username.substring(0, 1).toUpperCase() : '?'}
                                        </div>
                                    )}
                                </div>
                                <span className="hidden lg:inline ml-2">{userData.username || 'User'}</span> 
                            </a>
                            <button onClick={handleLogout} className="text-sm text-gray-700 hover:text-red-600 px-3  py-1.5 rounded-md border border-gray-300 hover:border-red-400 transition-colors">
                                Logout
                            </button>
                        </>
                    ) : ( <Link href="/login" className="text-sm font-medium text-blue-600 hover:underline">Login</Link> )}
                </div>

                {/* Tombol Hamburger Menu untuk Mobile */}
                <div className="-mr-2 flex md:hidden">
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} type="button" className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 focus:outline-none" aria-controls="mobile-menu" aria-expanded="false">
                        <span className="sr-only">Buka menu</span>
                        {isMobileMenuOpen ? (
                            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        )}
                    </button>
                </div>
            </div>
          </div>
        </div>
      </nav>

      {/* --- Sidebar Menu Mobile --- */}
      <div 
        className={`fixed top-0 left-0 w-full h-full z-40 transition-opacity duration-300 ease-in-out ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={closeMobileMenu}
      >
        <div className="absolute inset-0 bg-black/60"></div>
      </div>

      <div className={`fixed top-0 left-0 w-96 h-full bg-white shadow-xl z-50 transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'transform translate-x-0' : 'transform -translate-x-full'}`}>
          <div className="p-4 border-b">
            <h2 className="text-lg font-bold text-blue-600">Fesnuk</h2>
          </div>
          <div className="p-4">
              {/* Info Pengguna di Sidebar */}
              {userData ? (
                <div className="mb-4 pb-4 border-b">
                    <a href={userData.username ? `/profile/${userData.username}` : '#'} onClick={navigateToProfile} className="flex items-center p-2 -ml-2 rounded-md hover:bg-gray-100">
                        <div className="flex-shrink-0 w-10 h-10 mr-3">
                            {userData.profilePictureUrl ? (
                                <Image src={userData.profilePictureUrl} alt={userData.username || "Avatar"} width={40} height={40} className="rounded-full object-cover w-10 h-10 w-10 h-10 w-full h-full" />
                            ) : (
                                <div className="w-full h-full rounded-full bg-gray-400 flex items-center justify-center text-white font-semibold">{userData.username ? userData.username.substring(0, 1).toUpperCase() : '?'}</div>
                            )}
                        </div>
                        <div>
                            <p className="font-semibold text-sm text-black">{userData.username || 'User'}</p>
                            <p className="text-xs text-gray-500">Lihat profil</p>
                        </div>
                    </a>
                </div>
              ) : null}

              {/* Item Menu */}
              <div className="space-y-1">
                  {menuItems}
              </div>

              {/* Notifikasi dan Logout di Sidebar */}
              <div className="mt-6 pt-6 border-t">
                {userData && (
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-gray-700">Notifikasi</span>
                        <NotificationBell />
                    </div>
                )}
                {userData ? (
                    <button onClick={handleLogout} className="w-full text-left text-gray-700 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium">Logout</button>
                ) : (
                    <Link href="/login" onClick={closeMobileMenu} className="w-full text-left text-gray-700 hover:bg-gray-100 block px-3 py-2 rounded-md text-base font-medium">Login</Link>
                )}
              </div>
          </div>
      </div>
    </>
  );
}

// Ini adalah default export untuk app/(main)/layout.tsx
export default function MainApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <AppNavbar />
      <main className="flex-grow py-6 sm:py-8">
        {children}
      </main>
      <footer className="text-center py-4 text-xs text-gray-500 border-t border-gray-200 bg-white">
        © {new Date().getFullYear()} Fesnuk @ayamgoreng. All rights reserved.
      </footer>
    </div>
  );
}
