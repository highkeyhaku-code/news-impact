"use client";

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type AttentionLevel = 'none' | 'low' | 'medium' | 'high';

type WatchlistSwitcherProps = {
  symbol: string;
  companyName: string;
  initialLevel: AttentionLevel | null; // null if not in watchlist
};

export default function WatchlistSwitcher({ symbol, companyName, initialLevel }: WatchlistSwitcherProps) {
  const [level, setLevel] = useState<AttentionLevel | null>(initialLevel);
  const [isUpdating, setIsUpdating] = useState(false);
  const router = useRouter();

  const handleLevelChange = async (newLevel: AttentionLevel | 'remove') => {
    setIsUpdating(true);
    try {
      if (newLevel === 'remove') {
        const { error } = await supabase
          .from('watchlist')
          .delete()
          .eq('symbol', symbol);

        if (error) throw error;
        setLevel(null);
      } else {
        if (level === null) {
          // 新規追加
          const { error } = await supabase
            .from('watchlist')
            .insert([{ symbol, company_name: companyName, attention_level: newLevel }]);

          if (error) throw error;
        } else {
          // 更新
          const { error } = await supabase
            .from('watchlist')
            .update({ attention_level: newLevel })
            .eq('symbol', symbol);

          if (error) throw error;
        }
        setLevel(newLevel);
      }
      
      // 監視ボードのキャッシュを破棄・更新できるようにNext.jsルーターをリフレッシュ
      router.refresh();
    } catch (err) {
      console.error(err);
      alert('監視ステータスの更新に失敗しました。');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
          <span>📊</span> 監視ステータス管理
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          {level === null 
            ? "この銘柄は現在監視ボードに登録されていません。" 
            : `この銘柄は監視ボードに登録されています（優先度: ${level.toUpperCase()}）。`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {level === null ? (
          <button
            onClick={() => handleLevelChange('none')}
            disabled={isUpdating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            {isUpdating ? "追加中..." : "監視ボードに追加する"}
          </button>
        ) : (
          <>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-bold shadow-sm">
              {(['none', 'low', 'medium', 'high'] as AttentionLevel[]).map((lvl) => {
                const isActive = level === lvl;
                let activeClass = "";
                if (isActive) {
                  if (lvl === 'none') activeClass = "bg-gray-600 text-white";
                  if (lvl === 'low') activeClass = "bg-green-600 text-white";
                  if (lvl === 'medium') activeClass = "bg-yellow-500 text-white";
                  if (lvl === 'high') activeClass = "bg-red-600 text-white";
                } else {
                  activeClass = "bg-white text-gray-600 hover:bg-gray-50";
                }

                const labelMap = {
                  none: '未分類',
                  low: '🟢 Low',
                  medium: '🟡 Med',
                  high: '🔴 High'
                };

                return (
                  <button
                    key={lvl}
                    disabled={isUpdating}
                    onClick={() => handleLevelChange(lvl)}
                    className={`px-3 py-2 border-r border-gray-200 last:border-r-0 transition-colors ${activeClass}`}
                  >
                    {labelMap[lvl]}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => handleLevelChange('remove')}
              disabled={isUpdating}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
              削除
            </button>
          </>
        )}
      </div>
    </div>
  );
}
