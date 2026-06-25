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
          .order('published_at', { ascending: false })
          .limit(50);
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
      feedData = MOCK_NEWS.filter(item => {
        let match = true;
        if (symbol) match = match && (item.ticker_sentiment?.some((t) => t.ticker.includes(symbol)) ?? false);
        if (genre && genre !== 'All') match = match && (item.topics?.some((t) => t.topic === genre) ?? false);
        return match;
      });
      if (feedData.length === 0) feedData = MOCK_NEWS;
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

    if (symbol) query = query.eq('symbol', symbol);
    
    // 【修正点】期間指定ロジックの強化
    if (startDate) {
      // ハイフンなどを削除して数値文字列にする (2024-02-09 -> 20240209)
      // 開始日は 00:00:00 から (日本時間で考えると -9h だが、開始は広めに取ってOK)
      const startStr = startDate.replace(/\D/g, '') + 'T000000'; 
      query = query.gte('published_at', startStr);
    }
    
    if (endDate) {
      // 【JST調整】
      // 日本時間での「今日いっぱい(23:59:59)」は、UTCだと「今日の14:59:59」まで。
      // UTCのまま 23:59 まで検索すると、日本時間の「翌日午前9時」まで含まれてしまうため、
      // 終了時間を 145959 に早めて調整する。
      const endStr = endDate.replace(/\D/g, '') + 'T145959'; 
      query = query.lte('published_at', endStr);
    }

    const { data: searchResults } = await query.limit(100);

    return NextResponse.json(searchResults);

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}