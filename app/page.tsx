'use client';

import dynamic from 'next/dynamic';

const GenerativeCanvas = dynamic(
  () => import('@/components/generative-canvas'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-lg mb-4">Loading generative art...</div>
          <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  return <GenerativeCanvas />;
}
