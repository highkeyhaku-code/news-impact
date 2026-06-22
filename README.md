# NewsImpact 📈

NewsImpact は、米国企業のニュースと、それに伴う株価の変動（インパクト）を追跡・分析・可視化するための Web アプリケーションです。ニュースが企業の市場価値に与えた影響を動的なチャートで直感的に分析できます。

---

## 🚀 主な機能

### 1. ニュースダッシュボード (`app/page.tsx`)
- **ニュース一覧表示**: 最新の収集済みニュースをタイムライン形式で表示。
- **検索 & フィルタリング**: 企業シンボル、ジャンル、掲載期間（日付範囲）による詳細な絞り込み。
- **ブックマーク機能**: お気に入りニュースを保存・管理可能（Supabase 連携）。

### 2. 株価インパクト分析 (`app/news/[id]/page.tsx`)
- **AI ニュース要約**: Gemini API を使用した、ニュースの要約（日本語）を表示。
- **株価チャートの可視化**: ニュース発生日を基準点（縦線）とし、その前後の株価推移を Recharts で描画。
- **Brush スライダー**: チャート下部のスライダーで、表示期間を自由に変更可能。
- **関連ニュース**: 同じ企業の他のニュースをチャートにプロット・下部に一覧表示。

### 3. 優先度監視ボード (`app/watchlist/page.tsx`)
- **ドラッグ＆ドロップ分類**: `@dnd-kit/core` によるラグのない直感的なタスクボード操作。
- **ステータス管理**: 企業を `INBOX（未分類）`、`🟢 Low`、`🟡 Medium`、`🔴 High` に分類可能。
- **データ自動同期**: 分類を変更すると、バックグラウンドで Supabase の状態が自動的に更新されます。

### 4. ニュース自動収集・AI 解析タスク (`app/api/cron/route.ts`)
- CNBC の RSS フィードから技術ニュースを自動取得。
- Gemini (`gemini-2.5-flash`) による「言及企業名」「ティッカー」「ジャンル」「要約」「センチメント」の自動解析。

---

## 🛠 技術スタック

- **フレームワーク**: Next.js 16 (App Router), React 19, TypeScript
- **スタイリング**: TailwindCSS (v4)
- **データベース & API**: Supabase (PostgreSQL, PostgREST)
- **グラフ描画**: Recharts
- **LLM API**: Google Generative AI (Gemini 2.5 Flash)
- **ドラッグ&ドロップ**: @dnd-kit
- **日付処理**: date-fns
- **外部データソース**: Alpha Vantage API (株価 & ニュース感情データ), CNBC RSS Feed

---

## ⚙️ セットアップ手順

### 1. 依存関係のインストール
プロジェクトのルートディレクトリで以下を実行します：
```bash
npm install
```

### 2. 環境変数の設定 (`.env.local`)
プロジェクトのルートに `.env.local` ファイルを作成し、以下の環境変数を設定します：
```env
NEXT_PUBLIC_SUPABASE_URL=あなたのSupabaseプロジェクトURL
NEXT_PUBLIC_SUPABASE_ANON_KEY=あなたのSupabase Anon Key
GOOGLE_API_KEY=あなたのGemini(Google AI Studio)APIキー
ALPHA_VANTAGE_KEY=あなたのAlpha Vantage APIキー
```

### 3. データベース（Supabase）のセットアップ
Supabase データベースで必要なテーブルを作成するために、以下の手順を実行します：

1. ルートディレクトリにある `supabase_setup.sql` を開いて内容をコピーします。
2. [Supabase Dashboard](https://supabase.com/dashboard) でプロジェクトの **SQL Editor** を開きます。
3. 新しいクエリを作成し、コピーした SQL スクリプトを貼り付けて **Run** をクリックして実行します。
4. これにより、以下のテーブル・インデックス・RLSポリシーが作成されます：
   - `news` テーブル (ニュースデータ保存用)
   - `watchlist` テーブル (監視銘柄 & 優先度保存用)
   - 初期モックデータ

---

## 🏃 起動方法

開発サーバーを起動します：
```bash
npm run dev
```
起動後、ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。
