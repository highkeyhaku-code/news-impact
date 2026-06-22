"use client";

import React from 'react';
import dynamic from 'next/dynamic';
import type { AnalysisChartProps } from './AnalysisChart';

// ここで dynamic import を行い、SSRを無効化する（クライアントコンポーネント内ならOK）
const AnalysisChart = dynamic(() => import('./AnalysisChart'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[350px] bg-gray-100 rounded-xl animate-pulse flex items-center justify-center text-gray-400">
      グラフ読み込み中...
    </div>
  ),
});

// 親から受け取ったデータをそのまま AnalysisChart に渡す
export default function AnalysisChartWrapper(props: AnalysisChartProps) {
  return <AnalysisChart {...props} />;
}