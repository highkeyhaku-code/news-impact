"use client";

import React, { useEffect, useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, Brush
} from 'recharts';
import { format, parseISO } from 'date-fns';

export type ChartData = {
  date: string;
  price: number;
};

export type CompanyChartProps = {
  data: ChartData[];
  newsEvents: string[];
};

export default function CompanyChart({ data, newsEvents }: CompanyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 400 });

  // 画面サイズ計測
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

  // ニュースがあった日を判定するヘルパー
  const newsDatesSet = React.useMemo(() => {
    const set = new Set<string>();
    newsEvents.forEach(dateStr => {
      // ニュース公開日を "YYYY-MM-DD" に変換
      if (dateStr) {
        set.add(dateStr.split('T')[0]);
      }
    });
    return set;
  }, [newsEvents]);

  return (
    <div 
      ref={containerRef} 
      className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-100"
      style={{ minHeight: '450px' }}
    >
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-500">
          株価推移とニュース発生ポイント
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          ※ ニュースがリリースされた日は青い丸印（●）でプロットされています。スライダーで表示範囲を変更できます。
        </p>
      </div>
      
      {dimensions.width > 0 ? (
        <LineChart 
          width={dimensions.width - 32}
          height={dimensions.height - 50}
          data={data} 
          margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
          
          <XAxis 
            dataKey="date" 
            tickFormatter={formatDate}
            tick={{ fontSize: 12, fill: '#666' }}
            axisLine={false}
            tickLine={false}
            minTickGap={30}
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
            labelFormatter={(value: unknown) => {
              if (typeof value !== 'string') return '';
              try {
                return format(parseISO(value), 'yyyy年MM月dd日');
              } catch {
                return value;
              }
            }}
            formatter={(value: any, name: any, props: any) => {
              const dateStr = props?.payload?.date;
              const hasNews = newsDatesSet.has(dateStr);
              const priceText = typeof value === 'number' ? `$${value.toFixed(2)}` : String(value);
              
              if (hasNews) {
                return [
                  `${priceText} (ニュースあり)`,
                  '株価'
                ];
              }
              return [priceText, '株価'];
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

          {/* ニュースイベントの日にドットを配置 */}
          {data.map((d, index) => {
            if (newsDatesSet.has(d.date)) {
              return (
                <ReferenceDot
                  key={index}
                  x={d.date}
                  y={d.price}
                  r={5}
                  fill="#2563eb"
                  stroke="#fff"
                  strokeWidth={2}
                />
              );
            }
            return null;
          })}

          <Brush 
            dataKey="date" 
            height={30} 
            stroke="#8884d8" 
            tickFormatter={formatDate}
            startIndex={Math.max(0, data.length - 30)} // デフォルトは直近30取引日を表示
            endIndex={data.length - 1}
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
