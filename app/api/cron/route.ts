import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabaseClient';

export const maxDuration = 60; // タイムアウト対策

const parser = new Parser();
// Gemini 2.5 flash (最新安定版)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// ニュースソース（CNBC Tech）
const RSS_URL = 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910';

export async function GET() {
  try {
    // 1. RSS取得
    const feed = await parser.parseURL(RSS_URL);
    // 最新10件をチェック
    const items = feed.items.slice(0, 10);
    
    let processedCount = 0;
    const results = [];

    for (const item of items) {
      if (!item.title) continue;

      // 重複チェック
      const { data: existing } = await supabase
        .from('news')
        .select('id')
        .eq('title', item.title)
        .limit(1);

      if (existing && existing.length > 0) {
        continue; // 保存済みならスキップ
      }

      console.log(`新規記事解析中: ${item.title.slice(0, 20)}...`);

      // 2. AI解析 (ジャンル分類を追加)
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      const prompt = `
        Analyze this news.
        News Title: ${item.title}
        News Content: ${item.contentSnippet || item.title}

        Tasks:
        1. Identify the US stock company mentioned.
        2. Categorize the news into one of: "Technology", "Automotive", "Finance", "Healthcare", "Energy", "Retail", "Other".
        3. Summarize in Japanese (max 40 chars).
        4. Determine sentiment (up/down/flat).

        Output JSON only:
        {
          "company_name": "Company Name",
          "symbol": "Ticker (e.g. AAPL) or UNKNOWN",
          "genre": "Category Name",
          "summary": "Japanese summary",
          "sentiment": "up" or "down" or "flat"
        }
      `;

      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        const aiAnalysis = JSON.parse(text);

        // シンボル不明でも、ニュースとしては価値があるので保存する方針に変更
        // (ただしsymbolがUNKNOWNの場合は監視リストには入れられない)

        // 3. 保存 (株価は取得しない)
        const { error } = await supabase.from('news').insert([{
          title: item.title,
          content: item.contentSnippet || item.title,
          url: item.link,
          company_name: aiAnalysis.company_name,
          symbol: aiAnalysis.symbol,
          genre: aiAnalysis.genre,      // 新機能
          summary: aiAnalysis.summary,
          sentiment: aiAnalysis.sentiment,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(), // 記事の日付
          is_bookmarked: false
        }]);

        if (error) {
            console.error('DB Error:', error);
            throw error;
        }
        
        processedCount++;
        results.push(aiAnalysis.company_name);

      } catch (err) {
        console.error(`AI/DB Error: ${err}`);
        continue;
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: processedCount, 
      companies: results 
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}