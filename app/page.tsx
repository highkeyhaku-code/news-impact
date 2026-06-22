"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { format, parseISO } from 'date-fns';

type NewsItem = {
  id: number;
  title: string;
  summary: string;
  url: string;
  published_at: string;
  source: string;
  image_url?: string;
  genre: string;
  symbol: string;
  is_bookmarked: boolean;
};

// サイドバー部品
function SidebarItem({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg font-bold flex items-center gap-3 transition-all mb-1 ${active ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
    >
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ニュースカード部品
function NewsCard({ news, onToggleBookmark }: { news: NewsItem, onToggleBookmark: (id: number, current: boolean) => void }) {
  // 日付フォーマット処理 (YYYYMMDD... 形式に対応)
  let formattedDate = news.published_at;
  try {
    if (news.published_at.length >= 8 && !news.published_at.includes('-')) {
      const y = news.published_at.substring(0, 4);
      const m = news.published_at.substring(4, 6);
      const d = news.published_at.substring(6, 8);
      formattedDate = `${y}/${m}/${d}`;
    } else {
      formattedDate = format(parseISO(news.published_at), 'yyyy/MM/dd');
    }
  } catch {
    // エラーならそのまま
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col gap-3 group">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold border border-gray-200">{news.symbol}</span>
          <span className="text-xs text-gray-400">{formattedDate}</span>
          <span className="text-xs text-blue-500 font-bold border border-blue-100 px-2 rounded-full truncate max-w-[100px]">{news.genre}</span>
        </div>
        <button onClick={(e) => { e.preventDefault(); onToggleBookmark(news.id, news.is_bookmarked); }} className={`text-xl transition-transform hover:scale-110 ${news.is_bookmarked ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}>
          {news.is_bookmarked ? '★' : '☆'}
        </button>
      </div>
      <Link href={`/news/${news.id}`} className="block group-hover:text-blue-600 transition-colors">
        <h2 className="font-bold text-lg leading-tight text-gray-800 line-clamp-2">{news.title}</h2>
      </Link>
      <p className="text-sm text-gray-500 line-clamp-2">{news.summary}</p>
      <div className="mt-auto pt-2 flex items-center justify-between">
        <span className="text-xs text-gray-400 truncate max-w-[150px]">{news.source}</span>
        <Link href={`/news/${news.id}`} className="text-sm font-bold text-blue-600 flex items-center gap-1 hover:underline">
          詳細・チャート <span className="text-xs">▶</span>
        </Link>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'latest' | 'search' | 'bookmark'>('latest');
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // フィルター用ステート
  const [filterGenre, setFilterGenre] = useState('All');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ニュース収集・取得関数 
  const fetchNewsFromApi = useCallback(async (isSearch = false, targetTab?: 'latest' | 'search' | 'bookmark') => {
    setLoading(true);
    setDbError(null);
    const currentTab = targetTab || activeTab;

    try {
      if (currentTab === 'bookmark') {
        const { data, error } = await supabase
          .from('news')
          .select('*')
          .eq('is_bookmarked', true)
          .order('published_at', { ascending: false });
        
        if (error) {
          console.error("ブックマーク読み込みエラー:", error);
          if (error.code === '42P01') {
            setDbError("news テーブルがデータベースに存在しません。プロジェクトのルートにある `supabase_setup.sql` を Supabase の SQL Editor で実行して、テーブルを作成してください。");
          } else {
            setDbError(error.message);
          }
          setNewsList([]);
          setLoading(false);
          return;
        }

        setNewsList(data || []);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (isSearch || currentTab === 'search') {
        params.append('type', 'search');
        if (filterGenre !== 'All') params.append('genre', filterGenre);
        if (filterSymbol) params.append('symbol', filterSymbol);
        
        // 【追加】日付もAPIに渡して、サーバー側で探してもらう！
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        
      } else {
        params.append('type', 'latest');
      }

      const res = await fetch(`/api/fetch-news?${params.toString()}`);
      if (!res.ok) {
        throw new Error("APIリクエストが失敗しました");
      }
      const data = await res.json();

      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(data.error || "ニュース取得エラー");
      }

      setNewsList(data || []);
    } catch (e: any) {
      console.error("ニュースのフェッチに失敗しました:", e);
      setDbError("ニュースの取得に失敗しました。Supabaseのデータベースに 'news' テーブルが存在しない可能性があります。プロジェクトのルートにある `supabase_setup.sql` を実行して、テーブルを作成してください。");
      setNewsList([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterGenre, filterSymbol, startDate, endDate]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (active) {
        await fetchNewsFromApi(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [fetchNewsFromApi]);

  const handleTabChange = (tab: 'latest' | 'search' | 'bookmark') => {
    setActiveTab(tab);
    if (tab === 'latest') {
      fetchNewsFromApi(false, 'latest'); 
    } else if (tab === 'bookmark') {
      fetchNewsFromApi(false, 'bookmark');
    } else {
      setNewsList([]); 
    }
  };

  const toggleBookmark = async (id: number, current: boolean) => {
    setNewsList(prev => {
      if (activeTab === 'bookmark' && current === true) {
        return prev.filter(n => n.id !== id);
      }
      return prev.map(n => n.id === id ? { ...n, is_bookmarked: !current } : n);
    });
    
    const { error } = await supabase.from('news').update({ is_bookmarked: !current }).eq('id', id);
    if (error) {
      console.error("ブックマーク更新エラー:", error);
      alert(`ブックマークの保存に失敗しました: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex-shrink-0 sticky top-0 h-auto md:h-screen overflow-y-auto">
        <div className="p-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 mb-8 flex items-center gap-2">
            News<span className="text-blue-600">Impact</span>
          </h1>
          <nav className="space-y-2">
            <SidebarItem active={activeTab === 'latest'} icon="🔥" label="最新ニュース" onClick={() => handleTabChange('latest')} />
            <SidebarItem active={activeTab === 'search'} icon="🔍" label="検索・分析" onClick={() => handleTabChange('search')} />
            <SidebarItem active={activeTab === 'bookmark'} icon="🔖" label="ブックマーク" onClick={() => handleTabChange('bookmark')} />
            <div className="pt-6 mt-6 border-t border-gray-100">
               <Link href="/watchlist">
                <button className="w-full text-left px-4 py-3 rounded-lg font-bold flex items-center gap-3 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-all">
                  <span className="text-xl">📊</span><span>監視ボードへ</span>
                </button>
               </Link>
            </div>
          </nav>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {dbError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-lg text-red-700 text-sm shadow-sm">
              <p className="font-bold flex items-center gap-1.5">⚠️ データベースエラー</p>
              <p className="mt-1 text-gray-600 font-medium">{dbError}</p>
            </div>
          )}
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">
              {activeTab === 'latest' && '🔥 今日のヘッドライン'}
              {activeTab === 'search' && '🔍 ニュース収集・検索'}
              {activeTab === 'bookmark' && '🔖 保存したニュース'}
            </h2>
            <button onClick={() => fetchNewsFromApi(activeTab === 'search')} className="text-sm text-blue-600 font-bold hover:underline flex items-center gap-1">
              <span>🔄</span> {activeTab === 'search' ? '条件で収集し直す' : '情報を更新'}
            </button>
          </div>

          {activeTab === 'search' && (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">ジャンル</label>
                  <select className="w-full p-2 border border-gray-200 rounded-lg font-bold text-gray-700" value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
                    <option value="All">すべて</option>
                    <option value="Technology">Technology</option>
                    <option value="Finance">Finance</option>
                    <option value="Business">Business</option>
                    <option value="Earnings">Earnings</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">企業シンボル</label>
                  <input type="text" placeholder="例: GOOG" className="w-full p-2 border border-gray-200 rounded-lg font-bold" value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value.toUpperCase())} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">掲載期間 (開始)</label>
                  <input type="date" className="w-full p-2 border border-gray-200 rounded-lg" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">掲載期間 (終了)</label>
                  <input type="date" className="w-full p-2 border border-gray-200 rounded-lg" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="pt-2">
                <button onClick={() => fetchNewsFromApi(true)} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition shadow-md flex justify-center items-center gap-2">
                  <span>🔍</span> 条件に一致するニュースを収集・検索
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-48 bg-gray-200 rounded-xl animate-pulse"></div>)}
            </div>
          ) : newsList.length === 0 ? (
            <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
              <span className="text-4xl block mb-2">🍃</span>
              {activeTab === 'bookmark' ? 'ブックマークしたニュースはありません' : '条件に一致するニュースが見つかりません'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {newsList.map((news) => (
                <NewsCard key={news.id} news={news} onToggleBookmark={toggleBookmark} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}