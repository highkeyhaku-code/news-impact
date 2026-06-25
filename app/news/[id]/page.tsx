import React from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { addDays, subDays, format, parseISO } from 'date-fns';
import AnalysisChartWrapper from '@/components/AnalysisChartWrapper';
import WatchlistSwitcher from '@/app/company/[symbol]/WatchlistSwitcher';

// 常に最新を取得
export const revalidate = 0;

type StockData = {
  date: string;
  price: number;
};

type StockApiResponse = {
  'Time Series (Daily)'?: {
    [date: string]: {
      '4. close': string;
      [key: string]: string;
    };
  };
};

// Alpha Vantageからデータを取得する関数
async function fetchStockData(symbol: string): Promise<StockApiResponse> {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error('Failed to fetch stock data');
  return res.json() as Promise<StockApiResponse>;
}

export default async function NewsDetailPage({ params }: { params: { id: string } }) {
  // Next.js 15対応: paramsをawaitする
  const { id } = await params;

  // 1. ニュース取得
  const { data: newsList, error } = await supabase
    .from('news')
    .select('*')
    .eq('id', id)
    .limit(1);

  const news = newsList?.[0];

  if (error || !news) {
    const isMissingTable = error?.code === '42P01';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500 p-4">
        <span className="text-4xl mb-2">⚠️</span>
        <h2 className="text-lg font-bold text-gray-800 mb-1">
          {isMissingTable ? 'データベースエラー' : 'ニュースが見つかりません'}
        </h2>
        <p className="text-sm text-gray-500 max-w-md text-center leading-relaxed">
          {isMissingTable
            ? "news テーブルがデータベースに存在しません。プロジェクトのルートにある `supabase_setup.sql` を Supabase の SQL Editor で実行して、テーブルを作成してください。"
            : "指定されたニュースが見つかりません。すでに削除されたか、IDが間違っている可能性があります。"}
        </p>
        <Link href="/" className="mt-6 text-sm font-bold text-blue-600 hover:underline">
          🏠 ホームへ戻る
        </Link>
      </div>
    );
  }

  // 1.5 監視リストの登録状況チェック
  const { data: watchlistData } = await supabase
    .from('watchlist')
    .select('*')
    .eq('symbol', news.symbol)
    .limit(1);

  const watchlistItem = watchlistData?.[0] || null;

  // 会社名フォールバック判定
  const getCompanyName = (symbol: string, defaultVal?: string) => {
    if (defaultVal) return defaultVal;
    const defaults: { [key: string]: string } = {
      AAPL: 'Apple Inc.',
      GOOG: 'Alphabet Inc.',
      AMZN: 'Amazon.com, Inc.',
      MSFT: 'Microsoft Corporation',
      TSLA: 'Tesla, Inc.',
      META: 'Meta Platforms, Inc.',
      NFLX: 'Netflix, Inc.',
      NVDA: 'NVIDIA Corporation',
    };
    return defaults[symbol] || `${symbol} Corp.`;
  };

  const companyName = getCompanyName(news.symbol, watchlistItem?.company_name);

  // 2. 関連ニュース取得 (修正版: 表示中のニュース以外で、同じ企業のニュースを最新順に5件)
  const { data: relatedNews } = await supabase
    .from('news')
    .select('*')
    .eq('symbol', news.symbol)
    .neq('id', news.id) 
    .order('published_at', { ascending: false })
    .limit(5); // 3件から5件に増量

  // 3. 株価データ取得
  let chartData: StockData[] = [];
  let apiError = false;

  if (news.symbol && news.symbol !== 'UNKNOWN') {
    try {
      const stockRaw = await fetchStockData(news.symbol);
      const timeSeries = stockRaw['Time Series (Daily)'];

      if (timeSeries) {
        // スライダーがあるため、広め（前後90日）にデータを取る
        const newsDate = parseISO(news.published_at);
        const startDate = subDays(newsDate, 90);
        const endDate = addDays(newsDate, 90);

        chartData = Object.keys(timeSeries)
          .map(dateStr => ({
            date: dateStr,
            price: parseFloat(timeSeries[dateStr]['4. close'])
          }))
          .filter(d => {
             const dDate = parseISO(d.date);
             return dDate >= startDate && dDate <= endDate;
          })
          .sort((a, b) => (a.date > b.date ? 1 : -1));
      } else {
        apiError = true;
      }
    } catch (e) {
      console.error(e);
      apiError = true;
    }
  }

  // インパクト指標の計算
  let impactStats: {
    prevPrice: number;
    todayPrice: number;
    todayDiff: number;
    todayPercent: number;
    after3Price?: number;
    after3Diff?: number;
    after3Percent?: number;
    after5Price?: number;
    after5Diff?: number;
    after5Percent?: number;
  } | null = null;

  if (chartData.length > 0) {
    const newsDateStr = news.published_at.split('T')[0];
    let todayIdx = chartData.findIndex(d => d.date === newsDateStr);
    
    // 土日などで見つからない場合は、ニュース直後の営業日を採用
    if (todayIdx === -1) {
      todayIdx = chartData.findIndex(d => d.date > newsDateStr);
    }

    if (todayIdx !== -1 && todayIdx > 0) {
      const prevData = chartData[todayIdx - 1];
      const todayData = chartData[todayIdx];

      const getStats = (targetPrice: number, basePrice: number) => {
        const diff = targetPrice - basePrice;
        const percent = (diff / basePrice) * 100;
        return { diff, percent };
      };

      const todayStats = getStats(todayData.price, prevData.price);
      
      impactStats = {
        prevPrice: prevData.price,
        todayPrice: todayData.price,
        todayDiff: todayStats.diff,
        todayPercent: todayStats.percent,
      };

      if (todayIdx + 3 < chartData.length) {
        const after3Data = chartData[todayIdx + 3];
        const stats = getStats(after3Data.price, prevData.price);
        impactStats.after3Price = after3Data.price;
        impactStats.after3Diff = stats.diff;
        impactStats.after3Percent = stats.percent;
      }

      if (todayIdx + 5 < chartData.length) {
        const after5Data = chartData[todayIdx + 5];
        const stats = getStats(after5Data.price, prevData.price);
        impactStats.after5Price = after5Data.price;
        impactStats.after5Diff = stats.diff;
        impactStats.after5Percent = stats.percent;
      }
    }
  }

  const otherEventsData = relatedNews?.map(n => ({
    date: n.published_at,
    title: n.title,
    id: n.id
  })) || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
      
      {/* 1. ナビゲーションヘッダー (強化版) */}
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-500 hover:text-blue-600 font-bold flex items-center gap-1 transition-colors text-sm">
              <span>🏠</span> ホーム
            </Link>
            <span className="text-gray-300">|</span>
            <div className="font-bold text-gray-800 flex items-center gap-2">
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100 font-mono">
                {news.symbol}
              </span>
              <span className="hidden sm:inline text-sm">分析レポート</span>
            </div>
          </div>

          <Link href="/watchlist" className="text-sm font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
            <span>📊</span> 監視ボードへ
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {/* 2. メインニュース記事 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-5">
             <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">
               {news.genre || 'News'}
             </span>
             <span className="text-gray-500 text-sm font-medium">
               {format(parseISO(news.published_at), 'yyyy年MM月dd日')}
             </span>
          </div>
          
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-6 leading-snug">
            {news.title}
          </h1>
          
          <div className="bg-blue-50/50 border-l-4 border-blue-500 p-5 mb-8 rounded-r-lg">
            <h3 className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider">AI Summary</h3>
            <p className="text-gray-700 leading-relaxed font-medium">
              {news.summary}
            </p>
          </div>
          
          <div className="prose prose-blue max-w-none text-gray-600 text-sm leading-relaxed mb-6">
            {/* contentが無い場合のフォールバック */}
            {news.content || "詳細な本文はありません。"}
          </div>

          <div className="flex justify-end">
            <a href={news.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-bold hover:underline">
              元の記事を読む (外部サイト) ↗
            </a>
          </div>
        </div>

        {/* 監視リストへのクイック追加・ステータス管理 */}
        {news.symbol && news.symbol !== 'UNKNOWN' && (
          <div className="mb-6">
            <WatchlistSwitcher
              symbol={news.symbol}
              companyName={companyName}
              initialLevel={watchlistItem ? (watchlistItem.attention_level || 'none') : null}
            />
          </div>
        )}

        {/* 3. 株価チャートエリア */}
        <div className="mb-10">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            📈 株価インパクト分析
            {apiError && <span className="text-xs text-red-500 font-normal bg-red-50 px-2 py-0.5 rounded">(データ取得制限中)</span>}
          </h2>

          {/* インパクト分析サマリーカード */}
          {impactStats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <span className="text-xs font-bold text-gray-400 block mb-1">発表当日インパクト (前営業日比)</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-extrabold text-gray-800">${impactStats.todayPrice.toFixed(2)}</span>
                  <span className={`text-sm font-bold flex items-center ${impactStats.todayDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {impactStats.todayDiff >= 0 ? '▲' : '▼'} {Math.abs(impactStats.todayPercent).toFixed(2)}%
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">前営業日終値: ${impactStats.prevPrice.toFixed(2)}</span>
              </div>
              
              {impactStats.after3Price !== undefined && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <span className="text-xs font-bold text-gray-400 block mb-1">発表3営業日後</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-extrabold text-gray-800">${impactStats.after3Price.toFixed(2)}</span>
                    <span className={`text-sm font-bold flex items-center ${impactStats.after3Diff! >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {impactStats.after3Diff! >= 0 ? '▲' : '▼'} {Math.abs(impactStats.after3Percent!).toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">発表前比での累積変化</span>
                </div>
              )}

              {impactStats.after5Price !== undefined && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <span className="text-xs font-bold text-gray-400 block mb-1">発表5営業日後</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-extrabold text-gray-800">${impactStats.after5Price.toFixed(2)}</span>
                    <span className={`text-sm font-bold flex items-center ${impactStats.after5Diff! >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {impactStats.after5Diff! >= 0 ? '▲' : '▼'} {Math.abs(impactStats.after5Percent!).toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">発表前比での累積変化</span>
                </div>
              )}
            </div>
          )}

          <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200">
            {chartData.length > 0 ? (
              <AnalysisChartWrapper 
                data={chartData} 
                newsDate={news.published_at}
                newsTitle={news.title}
                newsId={news.id}
                otherEvents={otherEventsData}
              />
            ) : (
              <div className="bg-gray-50 rounded-xl h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
                <span className="text-2xl">📉</span>
                <span>
                  {apiError ? 'API制限のためデータを表示できません' : '表示期間のデータがありません'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4. 関連ニュース (カードデザイン化) */}
        {relatedNews && relatedNews.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              🔗 {news.symbol} の関連ニュース
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relatedNews.map((item) => (
                <Link href={`/news/${item.id}`} key={item.id} className="block h-full">
                  <div className="bg-white p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all h-full flex flex-col group">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs text-gray-400">
                        {format(parseISO(item.published_at), 'yyyy/MM/dd')}
                      </span>
                      <span className="text-xs text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded">
                        {item.genre}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-700 group-hover:text-blue-600 mb-2 line-clamp-2">
                      {item.title}
                    </h3>
                    <p className="text-xs text-gray-500 line-clamp-2 mt-auto">
                      {item.summary}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}