'use client';

import dynamic from 'next/dynamic';

const GenerativeCanvas = dynamic(
  () => import('@/components/generative-canvas'),
  { ssr: false }
);

export default function Home() {
  return <GenerativeCanvas />;
}
