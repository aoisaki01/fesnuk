import type { NextConfig } from "next";

const nextConfig = {
  // ...konfigurasi lain yang mungkin sudah Anda miliki...

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'files.uty.ac.id',
        port: '',
        pathname: '/**',
      },
      // Anda bisa menambahkan hostname lain di sini jika perlu
      // {
      //   protocol: 'https',
      //   hostname: 'nama-domain-lain.com',
      // },
    ],
  },
};

module.exports = nextConfig;