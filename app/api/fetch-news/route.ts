import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { subHours, isAfter, parseISO } from 'date-fns';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY;

type NewsFeedItem = {
  title: string;
  summary: string;
  url: string;
  time_published: string;
  source: string;
  banner_image?: string;
  topics?: { topic: string }[];
  ticker_sentiment?: { ticker: string }[];
};

// 開発用ダミーデータ
const MOCK_NEWS: NewsFeedItem[] = [
  {
    title: "【開発用ダミー】Appleが新型AIデバイスを発表",
    summary: "Appleは本日、家庭用AIロボット市場への参入を発表した。株価は一時的に急上昇している。",
    url: "https://example.com/apple-news",
    time_published: "20240209T120000",
    source: "TechDaily",
    banner_image: "https://placehold.co/600x400/png?text=Apple+News",
    topics: [{ topic: "Technology" }],
    ticker_sentiment: [{ ticker: "AAPL" }]
  },
  {
    title: "【開発用ダミー】Googleの決算、予想を上回る",
    summary: "Alphabet傘下のGoogleが発表した第4四半期決算は、広告収入の増加によりアナリスト予想を上回った。",
    url: "https://example.com/google-news",
    time_published: "20240208T153000",
    source: "FinanceWeekly",
    banner_image: "https://placehold.co/600x400/png?text=Google+Earnings",
    topics: [{ topic: "Earnings" }, { topic: "Technology" }],
    ticker_sentiment: [{ ticker: "GOOG" }]
  },
  {
    title: "【開発用ダミー】FRB、金利引き下げを示唆",
    summary: "連邦準備制度理事会は、インフレ率の低下を受け、年内の利下げ開始を示唆した。",
    url: "https://example.com/finance-news",
    time_published: "20240207T090000",
    source: "Bloomberg Mock",
    banner_image: "https://placehold.co/600x400/png?text=Market+News",
    topics: [{ topic: "Finance" }, { topic: "Economy" }],
    ticker_sentiment: [{ ticker: "FOREX:USD" }]
  },
  {
    title: "【開発用ダミー】Amazon、物流センターに新ロボット導入",
    summary: "Amazonは配送効率を高めるため、次世代のヒューマノイドロボットを全米の倉庫に配備すると発表。",
    url: "https://example.com/amazon-news",
    time_published: "20240209T100000",
    source: "Logistics Today",
    banner_image: "https://placehold.co/600x400/png?text=Amazon+Robot",
    topics: [{ topic: "Technology" }, { topic: "Business" }],
    ticker_sentiment: [{ ticker: "AMZN" }]
  }
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'latest';
  const symbol = searchParams.get('symbol');
  const genre = searchParams.get('genre');
  const startDate = searchParams.get('startDate'); 
  const endDate = searchParams.get('endDate');

  // JSTでの「今日」の範囲をUTC基準で計算する
  const jstOffset = 9 * 60 * 60 * 1000;
  const now = new Date();
  const jstNow = new Date(now.getTime() + jstOffset);

  // JSTの今日00:00:00に対応するUTC
  const jstTodayStart = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), 0, 0, 0));
  const utcStart = new Date(jstTodayStart.getTime() - jstOffset);

  // JSTの今日23:59:59に対応するUTC
  const jstTodayEnd = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), 23, 59, 59));
  const utcEnd = new Date(jstTodayEnd.getTime() - jstOffset);

  const formatToAlphaVantage = (date: Date): string => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${y}${m}${d}T${hh}${mm}${ss}`;
  };

  const startStr = formatToAlphaVantage(utcStart);
  const endStr = formatToAlphaVantage(utcEnd);

  // MOCK_NEWS の日付を動的に今日に書き換えるヘルパー
  const convertMockNewsToToday = (mocks: NewsFeedItem[]): NewsFeedItem[] => {
    const yyyy = jstNow.getUTCFullYear();
    const mm = String(jstNow.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(jstNow.getUTCDate()).padStart(2, '0');
    return mocks.map((item, idx) => {
      // JSTの10:00, 12:00, 14:00, 16:00 になるようにUTCを設定 (JST = UTC + 9h)
      // UTCでは 01:00, 03:00, 05:00, 07:00
      const hh = String(1 + idx * 2).padStart(2, '0');
      const time_published = `${yyyy}${mm}${dd}T${hh}0000`;
      return {
        ...item,
        time_published
      };
    });
  };

  // 1. キャッシュチェック (latestのみ)
  if (type === 'latest') {
    const { data: latestRecords } = await supabase
      .from('news')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    const latestRecord = latestRecords?.[0];

    if (latestRecord) {
      const lastFetchTime = parseISO(latestRecord.created_at);
      const oneHourAgo = subHours(new Date(), 1); 
      if (isAfter(lastFetchTime, oneHourAgo)) {
        console.log("♻️ キャッシュ有効");
        const { data: cachedData } = await supabase
          .from('news')
          .select('*')
          .gte('published_at', startStr)
          .lte('published_at', endStr)
          .order('published_at', { ascending: false })
          .limit(100);
        return NextResponse.json(cachedData);
      }
    }
  }

  // 2. 外部APIから収集 (Upsert)
  let apiUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&apikey=${ALPHA_VANTAGE_KEY}&limit=50&sort=LATEST`;

  if (symbol) apiUrl += `&tickers=${symbol}`;
  if (genre && genre !== 'All') apiUrl += `&topics=${genre.toLowerCase()}`;

  try {
    const res = await fetch(apiUrl);
    const data = await res.json();
    
    let feedData: NewsFeedItem[] = [];
    if (data.Information || !data.feed) {
      console.warn("API制限到達: ダミー使用");
      const todayMocks = convertMockNewsToToday(MOCK_NEWS);
      feedData = todayMocks.filter(item => {
        let match = true;
        if (symbol) match = match && (item.ticker_sentiment?.some((t) => t.ticker.includes(symbol)) ?? false);
        if (genre && genre !== 'All') match = match && (item.topics?.some((t) => t.topic === genre) ?? false);
        return match;
      });
      if (feedData.length === 0) feedData = todayMocks;
    } else {
      feedData = data.feed;
    }

    const newsItems = feedData.map((item: NewsFeedItem) => ({
      title: item.title,
      summary: item.summary,
      url: item.url,
      published_at: item.time_published,
      source: item.source,
      image_url: item.banner_image,
      genre: item.topics?.[0]?.topic || 'General',
      symbol: item.ticker_sentiment?.[0]?.ticker || 'UNKNOWN',
      is_bookmarked: false,
    }));

    await supabase.from('news').upsert(newsItems, { onConflict: 'url', ignoreDuplicates: true });

    // 3. DB検索 (期間指定の実装)
    let query = supabase.from('news').select('*').order('published_at', { ascending: false });

    if (type === 'latest') {
      // 最新タブの場合は今日のニュースに絞る
      query = query.gte('published_at', startStr).lte('published_at', endStr);
    } else {
      if (symbol) query = query.eq('symbol', symbol);
      
      // 【修正点】期間指定ロジックの強化
      if (startDate) {
        const startStrQuery = startDate.replace(/\D/g, '') + 'T000000'; 
        query = query.gte('published_at', startStrQuery);
      }
      
      if (endDate) {
        const endStrQuery = endDate.replace(/\D/g, '') + 'T145959'; 
        query = query.lte('published_at', endStrQuery);
      }
    }

    const { data: searchResults } = await query.limit(100);

    return NextResponse.json(searchResults);

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}