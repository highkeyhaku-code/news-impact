import React from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO } from 'date-fns';
import CompanyChartWrapper from '@/components/CompanyChartWrapper';
import WatchlistSwitcher from './WatchlistSwitcher';

export const revalidate = 0;

type StockApiResponse = {
  'Time Series (Daily)'?: {
    [date: string]: {
      '4. close': string;
      [key: string]: string;
    };
  };
};

async function fetchStockData(symbol: string): Promise<StockApiResponse> {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error('Failed to fetch stock data');
  return res.json() as Promise<StockApiResponse>;
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  // 1. データベースから会社情報の取得（監視リストに入っているか確認）
  const { data: watchlistData } = await supabase
    .from('watchlist')
    .select('*')
    .eq('symbol', upperSymbol)
    .limit(1);

  const watchlistItem = watchlistData?.[0] || null;

  // 2. 関連するニュース一覧の取得
  const { data: relatedNews, error: newsError } = await supabase
    .from('news')
    .select('*')
    .eq('symbol', upperSymbol)
    .order('published_at', { ascending: false });

  // 会社名が監視リストにない場合は、ニュースデータから最新の会社名を取り出してみる
  let companyName = watchlistItem?.company_name || '';
  if (!companyName) {
    if (relatedNews && relatedNews.length > 0) {
      // 最初（最新）のニュースレコードの会社名を取得（もしくは symbol）
      companyName = relatedNews[0].company_name || upperSymbol;
    } else {
      companyName = upperSymbol;
    }
  }

  // 3. 株価データ取得
  let chartData: { date: string; price: number }[] = [];
  let apiError = false;

  try {
    const stockRaw = await fetchStockData(upperSymbol);
    const timeSeries = stockRaw['Time Series (Daily)'];

    if (timeSeries) {
      chartData = Object.keys(timeSeries)
        .map(dateStr => ({
          date: dateStr,
          price: parseFloat(timeSeries[dateStr]['4. close'])
        }))
        .sort((a, b) => (a.date > b.date ? 1 : -1));
    } else {
      apiError = true;
    }
  } catch (e) {
    console.error("Alpha Vantage fetch error:", e);
    apiError = true;
  }

  const newsDates = relatedNews?.map(n => n.published_at) || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
      
      {/* ヘッダー */}
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/watchlist" className="text-gray-500 hover:text-blue-600 font-bold flex items-center gap-1 transition-colors text-sm">
              <span>📊</span> 監視ボード
            </Link>
            <span className="text-gray-300">|</span>
            <div className="font-bold text-gray-800 flex items-center gap-2">
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100 font-mono">
                {upperSymbol}
              </span>
              <span className="text-sm font-extrabold text-gray-900">{companyName}</span>
            </div>
          </div>

          <Link href="/" className="text-sm font-bold text-blue-600 hover:underline">
            🏠 ホームへ
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        
        {/* 会社基本情報 & 優先度スイッチ */}
        <WatchlistSwitcher 
          symbol={upperSymbol}
          companyName={companyName}
          initialLevel={watchlistItem ? (watchlistItem.attention_level || 'none') : null}
        />

        {/* 株価トレンド */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              📈 株価パフォーマンス推移
              {apiError && <span className="text-xs text-red-500 font-normal bg-red-50 px-2 py-0.5 rounded">(API制限またはエラーによりロード失敗)</span>}
            </h2>
            {chartData.length > 0 && (
              <span className="text-xs text-gray-400 font-medium">
                データ期間: {chartData[0].date} 〜 {chartData[chartData.length - 1].date}
              </span>
            )}
          </div>

          {chartData.length > 0 ? (
            <CompanyChartWrapper 
              data={chartData}
              newsEvents={newsDates}
            />
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
              <span className="text-2xl">📉</span>
              <span>
                {apiError ? '株価データを取得できませんでした (API制限の可能性があります)' : 'データが存在しません'}
              </span>
            </div>
          )}
        </div>

        {/* ニュース一覧 */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            🔗 {companyName} に関するニュース一覧 ({relatedNews?.length || 0}件)
          </h2>

          {relatedNews && relatedNews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relatedNews.map((item) => {
                let formattedDate = item.published_at;
                try {
                  if (item.published_at.length >= 8 && !item.published_at.includes('-')) {
                    const y = item.published_at.substring(0, 4);
                    const m = item.published_at.substring(4, 6);
                    const d = item.published_at.substring(6, 8);
                    formattedDate = `${y}/${m}/${d}`;
                  } else {
                    formattedDate = format(parseISO(item.published_at), 'yyyy/MM/dd');
                  }
                } catch {
                  // ignore
                }

                return (
                  <Link href={`/news/${item.id}`} key={item.id} className="block h-full">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all h-full flex flex-col group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-gray-400 font-medium">
                          {formattedDate}
                        </span>
                        <span className="text-xs text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {item.genre || 'General'}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-700 group-hover:text-blue-600 mb-2 line-clamp-2 leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-gray-500 line-clamp-3 mt-auto leading-relaxed">
                        {item.summary}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
              <span className="text-3xl block mb-2">📰</span>
              この会社に関連するデータベース内のニュースはまだありません。
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
