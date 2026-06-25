"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { 
  DndContext, 
  useDraggable, 
  useDroppable, 
  DragEndEvent,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

// データの型定義
type WatchlistItem = {
  id: number;
  symbol: string;
  company_name: string;
  attention_level: 'none' | 'low' | 'medium' | 'high';
  latest_news_id?: number;
};

// --------------------------------------------------
// 部品1: ドラッグできるカード (高速化対応)
// --------------------------------------------------
function DraggableCard({ item, onDelete }: { item: WatchlistItem; onDelete: (id: number, e: React.MouseEvent) => void }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id.toString(),
    data: { item },
  });

  const style = {
    // 高速化: CSS.Transform の代わりに Translate を使うとGPU負荷が低い
    transform: CSS.Translate.toString(transform),
    // ドラッグ中は透明度を下げて「持っている感」を出す
    opacity: isDragging ? 0.5 : 1,
    // ブラウザのスクロール等の干渉を防ぐ（これがラグ解消の鍵！）
    touchAction: 'none', 
  };

  const handleClick = (e: React.MouseEvent) => {
    // ドラッグ操作中は遷移しない
    if (transform) return;
    // 📊アイコンや🗑️アイコンのクリック時は遷移しない
    if ((e.target as HTMLElement).closest('.stop-propagation')) {
      return;
    }
    router.push(`/company/${item.symbol}`);
  };

  return (
    <div
      ref={setNodeRef}
      style={style as React.CSSProperties} // 型エラー回避
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={`
        bg-white p-3 rounded-lg shadow-sm border border-gray-200 mb-2 
        cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow 
        relative z-10 select-none text-left
        ${isDragging ? 'z-50 shadow-xl ring-2 ring-blue-400' : ''}
      `}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200 font-mono">
          {item.symbol}
        </span>

        <div className="flex items-center gap-1.5 stop-propagation">
          {item.latest_news_id && (
            <Link 
              href={`/news/${item.latest_news_id}`} 
              className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors"
              title="最新の分析チャートを見る"
              // ドラッグ誤爆防止
              onPointerDown={(e) => e.stopPropagation()} 
            >
              <span className="text-sm">📊</span>
            </Link>
          )}
          <button
            onClick={(e) => onDelete(item.id, e)}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors cursor-pointer"
            title="監視リストから削除"
          >
            <span className="text-xs">🗑️</span>
          </button>
        </div>
      </div>
      
      <h3 className="font-bold text-gray-800 text-sm leading-tight">
        {item.company_name}
      </h3>
    </div>
  );
}

// --------------------------------------------------
// 部品2: カードを落とせるエリア
// --------------------------------------------------
function DroppableColumn({ 
  id, 
  title, 
  items, 
  colorClass, 
  onDelete 
}: { 
  id: string; 
  title: string; 
  items: WatchlistItem[]; 
  colorClass: string; 
  onDelete: (id: number, e: React.MouseEvent) => void 
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div 
      ref={setNodeRef} 
      className={`
        flex-1 p-3 rounded-xl min-h-[300px] transition-colors
        ${colorClass}
        ${isOver ? 'ring-2 ring-blue-300 bg-opacity-80' : ''} 
      `}
    >
      <h2 className="font-bold text-gray-600 mb-3 flex items-center justify-between text-sm">
        {title}
        <span className="bg-white px-2 py-0.5 rounded-full text-xs shadow-sm text-gray-400">{items.length}</span>
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <DraggableCard key={item.id} item={item} onDelete={onDelete} />
        ))}
        {items.length === 0 && (
          <div className="h-20 border-2 border-dashed border-gray-300/30 rounded-lg flex items-center justify-center text-gray-400 text-xs">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------
// メイン画面
// --------------------------------------------------
export default function WatchlistPage() {
  const [list, setList] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // 追加フォーム用ステート
  const [newSymbol, setNewSymbol] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // 【重要】センサー設定：マウスを5px動かしたらドラッグ開始（クリックと区別しつつ即座に反応）
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, 
      },
    })
  );

  // 新規銘柄追加処理
  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol || !newCompanyName) return;
    setIsAdding(true);
    setDbError(null);

    const upperSymbol = newSymbol.toUpperCase().trim();
    const cleanCompanyName = newCompanyName.trim();

    try {
      const { data, error } = await supabase
        .from('watchlist')
        .insert([{ symbol: upperSymbol, company_name: cleanCompanyName, attention_level: 'none' }])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        // 対象シンボルの最新ニュースがあるか探す
        const { data: newsData } = await supabase
          .from('news')
          .select('id')
          .eq('symbol', upperSymbol)
          .order('published_at', { ascending: false })
          .limit(1);

        const newItem: WatchlistItem = {
          id: Number(data[0].id),
          symbol: upperSymbol,
          company_name: cleanCompanyName,
          attention_level: 'none',
          latest_news_id: newsData && newsData.length > 0 ? newsData[0].id : undefined,
        };

        setList(prev => [newItem, ...prev]);
        setNewSymbol('');
        setNewCompanyName('');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === '23505') {
        alert('このシンボルは既に監視ボードに登録されています。');
      } else {
        alert('追加に失敗しました。');
      }
    } finally {
      setIsAdding(false);
    }
  };

  // 銘柄削除処理
  const handleDeleteSymbol = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('本当にこの銘柄を監視リストから削除しますか？')) return;
    setDbError(null);

    try {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setList(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error(err);
      alert('削除に失敗しました。');
    }
  };

  useEffect(() => {
    const fetchWatchlist = async () => {
      setDbError(null);
      const { data: watchlistData, error } = await supabase
        .from('watchlist')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !watchlistData) {
        console.error("読み込みエラー:", error);
        if (error?.code === '42P01') {
          setDbError("watchlist テーブルがデータベースに存在しません。プロジェクトのルートにある `supabase_setup.sql` を Supabase の SQL Editor で実行して、テーブルを作成してください。");
        } else {
          setDbError(error?.message || "データの読み込みに失敗しました。Supabaseの接続設定やテーブルが存在するか確認してください。");
        }
        setLoading(false);
        return;
      }

      const mergedList: WatchlistItem[] = [];
      for (const item of watchlistData) {
        const { data: newsData, error: newsError } = await supabase
          .from('news')
          .select('id') 
          .eq('symbol', item.symbol)
          .order('published_at', { ascending: false })
          .limit(1);

        if (newsError) {
          console.warn("ニュース読み込みエラー:", newsError);
        }

        mergedList.push({
          ...item,
          // nullの場合は 'none' に
          attention_level: item.attention_level || 'none',
          latest_news_id: newsData && newsData.length > 0 ? newsData[0].id : undefined,
        });
      }
      
      setList(mergedList);
      setLoading(false);
    };

    fetchWatchlist();
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const itemId = Number(active.id);
    const newLevel = over.id as 'none' | 'low' | 'medium' | 'high';

    // UIを即座に更新
    setList((prevList) =>
      prevList.map((item) =>
        item.id === itemId ? { ...item, attention_level: newLevel } : item
      )
    );

    // DB更新（エラーがあればコンソールに出す）
    const { error } = await supabase
      .from('watchlist')
      .update({ attention_level: newLevel })
      .eq('id', itemId);

    if (error) {
      console.error("保存失敗！RLS設定を確認してください:", error);
      alert("保存に失敗しました。データベース権限を確認してください。");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
           <Link href="/" className="text-lg font-extrabold tracking-tight text-gray-900">
            News<span className="text-blue-600">Impact</span>
          </Link>
          <nav className="flex gap-4 text-xs font-bold">
            <Link href="/" className="text-gray-500 hover:text-blue-600 transition flex items-center gap-1">
              <span>🏠</span> 一覧へ
            </Link>
            <span className="text-blue-600 border-b-2 border-blue-600 pb-0.5">
              監視ボード
            </span>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {dbError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-lg text-red-700 text-sm shadow-sm">
            <p className="font-bold flex items-center gap-1.5">⚠️ データベースエラー</p>
            <p className="mt-1 text-gray-600 font-medium">{dbError}</p>
          </div>
        )}
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">ボードを準備中...</div>
        ) : (
          <div className="space-y-6">
            {/* 新規銘柄追加フォーム */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                  <span>➕</span> 監視銘柄の追加
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  監視したい米国企業のティッカーシンボルと企業名を入力してください。
                </p>
              </div>
              <form onSubmit={handleAddSymbol} className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <input 
                  type="text" 
                  placeholder="シンボル (例: MSFT)" 
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold w-full sm:w-32 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <input 
                  type="text" 
                  placeholder="企業名 (例: Microsoft)" 
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button 
                  type="submit" 
                  disabled={isAdding}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm w-full sm:w-auto disabled:opacity-50 cursor-pointer"
                >
                  {isAdding ? '追加中...' : '追加'}
                </button>
              </form>
            </div>

            <DndContext 
              sensors={sensors} 
              collisionDetection={closestCenter} // 衝突判定を「中心までの距離」にして自然にする
              onDragEnd={handleDragEnd}
            >
              <div className="flex flex-col gap-6">
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <DroppableColumn 
                    id="low" 
                    title="🟢 Low" 
                    items={list.filter(i => i.attention_level === 'low')} 
                    colorClass="bg-green-50/40 border border-green-100"
                    onDelete={handleDeleteSymbol}
                  />
                  <DroppableColumn 
                    id="medium" 
                    title="🟡 Medium" 
                    items={list.filter(i => i.attention_level === 'medium')} 
                    colorClass="bg-yellow-50/40 border border-yellow-100"
                    onDelete={handleDeleteSymbol}
                  />
                  <DroppableColumn 
                    id="high" 
                    title="🔴 High" 
                    items={list.filter(i => i.attention_level === 'high')} 
                    colorClass="bg-red-50/40 border border-red-100"
                    onDelete={handleDeleteSymbol}
                  />
                </div>

                <div className="mt-2">
                  <h2 className="text-xs font-bold text-gray-400 mb-2 ml-1">📥 INBOX (未分類)</h2>
                  <div className="bg-gray-100/50 p-3 rounded-xl border-2 border-dashed border-gray-200 min-h-[100px]">
                    <DroppableColumn 
                      id="none" 
                      title="" 
                      items={list.filter(i => i.attention_level === 'none')} 
                      colorClass="bg-transparent min-h-[auto] grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3" 
                      onDelete={handleDeleteSymbol}
                    />
                  </div>
                </div>

              </div>
            </DndContext>
          </div>
        )}
      </main>
    </div>
  );
}