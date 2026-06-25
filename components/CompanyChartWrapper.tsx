"use client";

import React from 'react';
import dynamic from 'next/dynamic';
import type { CompanyChartProps } from './CompanyChart';

// ここで dynamic import を行い、SSRを無効化する
const CompanyChart = dynamic(() => import('./CompanyChart'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[350px] bg-gray-100 rounded-xl animate-pulse flex items-center justify-center text-gray-400">
      グラフ読み込み中...
    </div>
  ),
});

export default function CompanyChartWrapper(props: CompanyChartProps) {
  return <CompanyChart {...props} />;
}
