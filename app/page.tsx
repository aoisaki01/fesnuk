// src/app/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PacmanLoader } from 'react-spinners'; // Contoh loader, install jika perlu: npm install react-spinners

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('jwtToken');

    if (token) {
      // Jika ada token, pengguna dianggap sudah login.
      // Arahkan ke halaman utama media sosial Anda.
      // Jika (main)/page.tsx Anda adalah halaman utama setelah login
      // dan route group (main) tidak mengubah path URL (tetap '/'),
      // maka kita bisa saja menampilkan komponen HomePage langsung di sini,
      // atau lebih baik redirect ke path spesifik jika ada (misalnya '/feed' atau '/home').
      // Untuk struktur dengan (main)/page.tsx, Next.js akan merendernya jika path cocok.
      // Mari kita asumsikan (main)/page.tsx adalah untuk path '/' setelah login.
      // Jika Anda ingin path yang berbeda (misal /feed), ganti router.push('/feed')
      
      // Jika Anda menggunakan route group (main) untuk root, dan HomePage ada di sana,
      // Next.js seharusnya sudah mengarahkan dengan benar jika layout (main) aktif.
      // Untuk memastikan, atau jika (main) punya path prefix, lakukan redirect eksplisit.
      // Kita asumsikan (main)/page.tsx adalah untuk halaman utama '/' bagi user login.
      // Jika Anda membuat (main) sebagai route group tanpa path (misalnya /app/(main)/page.tsx),
      // maka halaman ini bisa langsung menampilkan komponen HomePage atau redirect ke path spesifik.
      // Untuk kejelasan, kita akan redirect ke path yang akan dilayani oleh (main)/page.tsx.
      // Jika (main) adalah group layout untuk '/', maka kita bisa biarkan Next.js yang handle
      // setelah memastikan user terautentikasi.
      // Namun, redirect eksplisit ke halaman feed mungkin lebih jelas.
      // Jika HomePage kita di (main)/page.tsx dan itu adalah root, maka bisa jadi
      // tidak perlu redirect jika navigasi sudah benar.
      // Untuk contoh ini, kita anggap (main)/page.tsx adalah halaman utama setelah login
      // dan dapat diakses di path root '/'.
      // Jika (main)/page.tsx Anda ada di src/app/(main)/page.tsx dan (main) adalah grup layout untuk '/',
      // maka tidak perlu redirect jika navigasi dari layout sudah benar.
      // Namun, untuk kejelasan, jika Anda punya path spesifik seperti '/feed' untuk HomePage:
      // router.replace('/feed'); // Ganti '/feed' dengan path halaman utama Anda
      // Jika (main)/page.tsx melayani '/', dan kita ada di RootPage, ini bisa jadi loop.
      // Mari kita asumsikan kita ingin redirect ke path yang dilayani (main)/page.tsx.
      // Jika (main)/page.tsx adalah untuk '/', maka ini akan menjadi halaman utama.
      // Jika Anda ingin memisahkan landing page anonim dan feed, maka:
      // router.replace('/feed'); // dan pastikan /feed dilayani oleh (main)/page.tsx
      
      // Untuk kasus kita, kita sudah membangun HomePage (Canvas #35)
      // yang kita asumsikan ada di src/app/(main)/page.tsx.
      // Jika route group (main) tidak menambahkan prefix ke path, maka
      // HomePage.tsx akan melayani path '/' ketika layout (main) aktif.
      // Jika layout (main) belum aktif, kita perlu redirect.
      // Untuk sederhana, mari kita arahkan ke path yang pasti, misal '/home' (yang akan dilayani HomePage).
      // Anda perlu membuat `src/app/(main)/home/page.tsx` sebagai alias dari HomePage Anda atau
      // mengatur agar `(main)/page.tsx` melayani path `/` untuk user terautentikasi.

      // Solusi Paling Umum: (main)/page.tsx menjadi halaman utama.
      // Jika RootPage ini diakses dan user punya token, redirect ke sana.
      // Jika (main)/page.tsx adalah untuk path '/', maka tidak perlu redirect.
      // Mari kita asumsikan struktur Anda adalah:
      // app/page.tsx (halaman ini, untuk "/")
      // app/(auth)/login/page.tsx (untuk "/login")
      // app/(main)/feed/page.tsx (untuk "/feed", ini adalah HomePage kita)
      router.replace('/feed');

    } else {
      // Jika tidak ada token, arahkan ke halaman login.
      router.replace('/login');
    }
  }, [router]);

  // Tampilkan loading indicator sederhana selama proses pengecekan & redirect
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <PacmanLoader color="#36d7b7" size={50} />
      <p style={{ marginTop: '20px', fontSize: '18px', color: '#555' }}>Mengarahkan...</p>
    </div>
  );
}