import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Halo Query',
    background_color: '#1a202c',
    theme_color: '#1a202c',
    start_url: '/',
    display: 'standalone',
    icons: [
      {
        src: 'Logomark_Cyan.svg',
        type: 'image/svg+xml',
        sizes: 'any',
      },
      {
        src: 'icons/32.png',
        type: 'image/png',
        sizes: '32x32',
      },
      {
        src: 'icons/192.png',
        type: 'image/png',
        sizes: '192x192',
      },
      {
        src: 'icons/512.png',
        type: 'image/png',
        sizes: '512x512',
      },
    ],
  };
}
