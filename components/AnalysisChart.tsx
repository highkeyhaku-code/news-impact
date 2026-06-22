"use client";

import React, { useEffect, useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, Brush
} from 'recharts';
import { format, parseISO } from 'date-fns';

export type ChartData = {
  date: string;
  price: number;
};

export type AnalysisChartProps = {
  data: ChartData[];
  newsDate: string;
  otherEvents: string[];
};

export default function AnalysisChart({ data, newsDate, otherEvents }: AnalysisChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 400 }); // 高さを少し広げました

  // 1. 土日埋めロジック（そのまま維持）
  const processedData = React.useMemo(() => {
    if (data.length === 0) return [];
    
    // 日付順に並んでいる前提
    const newData = [...data];
    const lastData = newData[newData.length - 1];
    const targetDateStr = newsDate.split('T')[0];

    // ニュースの日付がデータ範囲外（未来）なら、直近の終値で埋める
    if (lastData.date < targetDateStr) {
      newData.push({
        date: targetDateStr,
        price: lastData.price
      });
    }
    return newData;
  }, [data, newsDate]);

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

  return (
    <div 
      ref={containerRef} 
      className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-100"
      style={{ minHeight: '450px' }}
    >
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-500">
          株価インパクト分析 (基準日: {formatDate(newsDate)})
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          ※ 下のスライダーをドラッグして、表示期間を自由に変更できます
        </p>
      </div>
      
      {dimensions.width > 0 ? (
        <LineChart 
          width={dimensions.width - 32}
          height={dimensions.height - 50} // スライダー分の高さを確保
          data={processedData} 
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
          
          <XAxis 
            dataKey="date" 
            tickFormatter={formatDate}
            tick={{ fontSize: 12, fill: '#666' }}
            axisLine={false}
            tickLine={false}
            minTickGap={30} // 日付が重ならないように間引く
          />
          <YAxis 
            domain={['auto', 'auto']} 
            tickFormatter={formatPriceAxis}
            tick={{ fontSize: 12, fill: '#666' }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            labelFormatter={formatDate}
            formatter={(value: unknown) => {
              if (typeof value === 'number') {
                return [`$${value.toFixed(2)}`, 'Price'];
              }
              return [String(value), 'Price'];
            }}
          />

          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#2563eb" 
            strokeWidth={2} 
            dot={false} 
            activeDot={{ r: 6 }} 
            isAnimationActive={false}
          />

          <ReferenceLine 
            x={newsDate.split('T')[0]} 
            stroke="#ef4444" 
            strokeDasharray="3 3" 
            label={{ position: 'top', value: 'News!', fill: '#ef4444', fontSize: 12, fontWeight: 'bold' }} 
          />

          {otherEvents && otherEvents.map((eventDate, index) => {
             const targetDateStr = eventDate.split('T')[0];
             const targetData = processedData.find(d => d.date === targetDateStr);
             if (!targetData) return null;

             return (
               <ReferenceDot
                  key={index}
                  x={targetDateStr}
                  y={targetData.price}
                  r={4}
                  fill="#fff"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  label={{ position: 'top', value: '★', fill: '#0ea5e9', fontSize: 10 }}
               />
             );
          })}

          {/* 【新機能】ここが魔法のスライダーです */}
          <Brush 
            dataKey="date" 
            height={30} 
            stroke="#8884d8" 
            tickFormatter={formatDate}
            startIndex={Math.max(0, processedData.length - 14)} // 初期表示: 最新の14日間
            endIndex={processedData.length - 1}
          />

        </LineChart>
      ) : (
        <div className="h-[400px] flex items-center justify-center text-gray-400 animate-pulse">
          グラフ描画中...
        </div>
      )}
    </div>
  );
}