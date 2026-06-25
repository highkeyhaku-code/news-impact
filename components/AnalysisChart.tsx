"use client";

import React, { useEffect, useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, Brush
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';

export type ChartEvent = {
  date: string;
  title: string;
  id: number;
};

export type ChartData = {
  date: string;
  price: number;
};

export type AnalysisChartProps = {
  data: ChartData[];
  newsDate: string;
  newsTitle: string;
  newsId: number;
  otherEvents: ChartEvent[];
};

export default function AnalysisChart({ data, newsDate, newsTitle, newsId, otherEvents }: AnalysisChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 400 });
  const router = useRouter();

  // ポップオーバー関連のステートとタイマー
  const [activePopover, setActivePopover] = useState<{
    cx: number;
    cy: number;
    date: string;
    price: number;
    isBase: boolean;
    events: ChartEvent[];
  } | null>(null);

  const popoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showPopover = (cx: number, cy: number, dateStr: string, price: number, isBase: boolean, events: ChartEvent[]) => {
    if (popoverTimeoutRef.current) {
      clearTimeout(popoverTimeoutRef.current);
      popoverTimeoutRef.current = null;
    }
    const posX = typeof cx === 'number' ? cx : 150;
    const posY = typeof cy === 'number' ? cy : 150;
    setActivePopover({ cx: posX, cy: posY, date: dateStr, price, isBase, events });
  };

  const hidePopoverWithDelay = () => {
    popoverTimeoutRef.current = setTimeout(() => {
      setActivePopover(null);
    }, 250); // 250msのディレイで、マウスがドットからポップオーバーに移動できるようにする
  };

  const handlePopoverMouseEnter = () => {
    if (popoverTimeoutRef.current) {
      clearTimeout(popoverTimeoutRef.current);
      popoverTimeoutRef.current = null;
    }
  };

  const handlePopoverMouseLeave = () => {
    setActivePopover(null);
  };

  // 1. 土日埋めロジック
  const processedData = React.useMemo(() => {
    if (data.length === 0) return [];
    
    const newData = [...data];
    const lastData = newData[newData.length - 1];
    const targetDateStr = newsDate.split('T')[0];

    if (lastData.date < targetDateStr) {
      newData.push({
        date: targetDateStr,
        price: lastData.price
      });
    }
    return newData;
  }, [data, newsDate]);

  // 基準ニュース当日のデータ
  const newsDayData = React.useMemo(() => {
    const targetDateStr = newsDate.split('T')[0];
    return processedData.find(d => d.date === targetDateStr);
  }, [processedData, newsDate]);

  // 同一日付の複数ニュースの重なりを防ぐための配置計算
  const positionedEvents = React.useMemo(() => {
    const dateCounts: { [date: string]: number } = {};
    
    // 基準ニュースの日付を登録
    const baseDateStr = newsDate.split('T')[0];
    dateCounts[baseDateStr] = 1;

    return otherEvents.map(event => {
      const targetDateStr = event.date.split('T')[0];
      const count = dateCounts[targetDateStr] || 0;
      dateCounts[targetDateStr] = count + 1;
      return {
        ...event,
        dateStr: targetDateStr,
        offsetIndex: count
      };
    });
  }, [otherEvents, newsDate]);

  // ニュース発表日前後7営業日間に自動フォーカスする初期範囲を計算
  const initialRange = React.useMemo(() => {
    if (processedData.length === 0) return { start: 0, end: 0 };
    const targetDateStr = newsDate.split('T')[0];
    const index = processedData.findIndex(d => d.date === targetDateStr);
    
    if (index === -1) {
      return {
        start: Math.max(0, processedData.length - 14),
        end: processedData.length - 1
      };
    }
    
    return {
      start: Math.max(0, index - 7),
      end: Math.min(processedData.length - 1, index + 7)
    };
  }, [processedData, newsDate]);

  // 2. 画面サイズ計測
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: 400
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const formatDate = (value: unknown) => {
    if (typeof value !== 'string') return ''; 
    try {
      return format(parseISO(value), 'MM/dd');
    } catch {
      return value;
    }
  };

  const formatPriceAxis = (value: number) => `$${value.toFixed(2)}`;

  // 【株価追従型Tooltip】株価のみ表示するシンプルなTooltip
  const PriceTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const price = payload[0].value;
      const dateStr = label;
      return (
        <div className="bg-white px-3 py-2 rounded-lg shadow border border-gray-150 text-left">
          <p className="text-[10px] font-bold text-gray-400 font-mono">
            {dateStr ? format(parseISO(dateStr), 'yyyy/MM/dd') : ''}
          </p>
          <p className="text-sm font-extrabold text-blue-600">${price.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  const baseDateStr = newsDate.split('T')[0];

  return (
    <div 
      ref={containerRef} 
      className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-100 relative"
      style={{ minHeight: '450px' }}
    >
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-500">
          株価インパクト分析 (基準日: {formatDate(newsDate)})
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          ※ 下のスライダーをドラッグして、表示期間を変更できます。グラフ内の点（🔴/🔵）にホバーして表示されるツールチップから、ニュース表示を切り替えられます。
        </p>
      </div>
      
      {dimensions.width > 0 ? (
        <LineChart 
          width={dimensions.width - 32}
          height={dimensions.height - 50}
          data={processedData} 
          margin={{ top: 25, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
          
          <XAxis 
            dataKey="date" 
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: '#888', fontWeight: 'bold' }}
            axisLine={false}
            tickLine={false}
            minTickGap={25}
          />
          <YAxis 
            domain={['auto', 'auto']} 
            tickFormatter={formatPriceAxis}
            tick={{ fontSize: 11, fill: '#888', fontWeight: 'bold' }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          
          <Tooltip content={<PriceTooltip />} />

          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#2563eb" 
            strokeWidth={3} 
            dot={false} 
            activeDot={{ r: 7, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} 
            isAnimationActive={false}
          />

          <ReferenceLine 
            x={newsDate.split('T')[0]} 
            stroke="#ef4444" 
            strokeDasharray="4 4" 
            strokeWidth={1.5}
            label={{ position: 'top', value: 'News!', fill: '#ef4444', fontSize: 11, fontWeight: 'extrabold' }} 
          />

          {/* 基準日当日の特別ドット */}
          {newsDayData && (
            <ReferenceDot
              x={newsDayData.date}
              y={newsDayData.price}
              r={6.5}
              fill="#ef4444"
              stroke="#fff"
              strokeWidth={2}
              className="cursor-pointer"
              onClick={() => router.push(`/news/${newsId}`)}
              onMouseEnter={(props: any) => {
                const { cx, cy } = props;
                const matchingEvents = otherEvents.filter(e => e.date.startsWith(newsDayData.date));
                showPopover(cx, cy, newsDayData.date, newsDayData.price, true, matchingEvents);
              }}
              onMouseLeave={hidePopoverWithDelay}
            />
          )}

          {/* 関連イベント日のドット (同じ日に複数ある場合はY軸にずらして重なりを防止) */}
          {positionedEvents.map((event, index) => {
             const targetData = processedData.find(d => d.date === event.dateStr);
             if (!targetData) return null;

             const yOffsetMultiplier = 1 + (event.offsetIndex * 0.025); 
             const finalY = targetData.price * yOffsetMultiplier;

             return (
               <ReferenceDot
                  key={index}
                  x={event.dateStr}
                  y={finalY}
                  r={5.5}
                  fill="#0ea5e9"
                  stroke="#fff"
                  strokeWidth={2}
                  className="cursor-pointer hover:r-7 transition-all"
                  onClick={() => router.push(`/news/${event.id}`)}
                  onMouseEnter={(props: any) => {
                    const { cx, cy } = props;
                    const isBase = event.dateStr === baseDateStr;
                    const matchingEvents = otherEvents.filter(e => e.date.startsWith(event.dateStr));
                    showPopover(cx, cy, event.dateStr, targetData.price, isBase, matchingEvents);
                  }}
                  onMouseLeave={hidePopoverWithDelay}
               />
             );
          })}

          <Brush 
            dataKey="date" 
            height={30} 
            stroke="#cbd5e1" 
            fill="#f8fafc"
            tickFormatter={formatDate}
            startIndex={initialRange.start}
            endIndex={initialRange.end}
          />

        </LineChart>
      ) : (
        <div className="h-[400px] flex items-center justify-center text-gray-400 animate-pulse">
          グラフ描画中...
        </div>
      )}

      {/* 絶対配置のポップオーバー (消えないツールチップ) */}
      {activePopover && (
        <div 
          className="absolute bg-white p-4 rounded-xl shadow-xl border border-gray-200 max-w-xs text-left z-30 select-text"
          style={{ 
            left: `${activePopover.cx + 15}px`,
            top: `${activePopover.cy - 60}px`,
          }}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
        >
          <p className="text-[10px] font-bold text-gray-400 mb-1 font-mono">
            {activePopover.date ? format(parseISO(activePopover.date), 'yyyy年MM月dd日') : ''}
          </p>
          <p className="text-xl font-extrabold text-blue-600 mb-2">${activePopover.price.toFixed(2)}</p>
          
          {activePopover.isBase && (
            <div className="mt-2.5 pt-2 border-t border-red-100">
              <span className="bg-red-50 text-red-600 text-[10px] font-extrabold px-2 py-0.5 rounded border border-red-200 inline-block mb-1">
                🚨 分析対象のニュース (表示中)
              </span>
              <p className="text-xs font-bold text-gray-800 leading-snug">{newsTitle}</p>
            </div>
          )}
          
          {activePopover.events.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-sky-100">
              <span className="bg-sky-50 text-sky-600 text-[10px] font-extrabold px-2 py-0.5 rounded border border-sky-200 inline-block mb-2">
                🔗 関連ニュース (クリックで切り替え)
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {activePopover.events.map(event => (
                  <button
                    key={event.id}
                    onClick={() => router.push(`/news/${event.id}`)}
                    className="w-full text-left text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline leading-snug cursor-pointer block"
                  >
                    • {event.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}