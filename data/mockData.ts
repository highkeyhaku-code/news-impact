// src/data/mockData.ts

// 型定義もここに移動して、どこからでも使えるように export します
export type NewsItem = {
  id: number;
  title: string;
  company: string;
  symbol: string;
  summary: string;
  content: string; // 本文
  timestamp: string;
  // チャートデータもニュースごとに変えられるように持たせます
  chartData: { time: string; price: number }[];
  result: 'up' | 'down' | 'flat'; // 正解データ
};

export const mockNewsList: NewsItem[] = [
  {
    id: 1,
    title: "新型iPhoneの発売日が決定、AI機能に注目集まる",
    company: "Apple Inc.",
    symbol: "AAPL",
    summary: "アップルは次世代iPhoneを来月発売すると発表。独自のAI機能が搭載される見込み。",
    content: "アップルは本日、次世代のiPhoneを来月15日に発売すると正式に発表した...",
    timestamp: "2026-02-02 10:00",
    result: 'up',
    chartData: [
      { time: '09:00', price: 150.0 },
      { time: '10:00', price: 151.0 }, // News
      { time: '11:00', price: 154.5 },
      { time: '13:00', price: 154.8 },
    ]
  },
  {
    id: 2,
    title: "AWSのクラウド事業が好調、過去最高益を更新",
    company: "Amazon.com",
    symbol: "AMZN",
    summary: "アマゾンのクラウド部門AWSが四半期決算を発表。企業のAI導入が進み収益増。",
    content: "Amazon Web Services (AWS) は本日、四半期決算を発表し...",
    timestamp: "2026-02-01 15:30",
    result: 'up',
    chartData: [
      { time: '09:00', price: 180.0 },
      { time: '10:00', price: 185.0 }, // News
      { time: '11:00', price: 188.5 },
      { time: '13:00', price: 190.0 },
    ]
  },
  {
    id: 3,
    title: "テスラの自動運転技術、新たな規制の壁に直面",
    company: "Tesla Inc.",
    symbol: "TSLA",
    summary: "規制当局はテスラの自動運転システムに対する新たな安全性調査を開始した。",
    content: "運輸省道路交通安全局（NHTSA）は本日、テスラの...",
    timestamp: "2026-01-31 09:15",
    result: 'down',
    chartData: [
      { time: '09:00', price: 200.0 },
      { time: '10:00', price: 195.0 }, // News
      { time: '11:00', price: 190.0 },
      { time: '13:00', price: 188.0 },
    ]
  },
];