# カード詳細レイアウト改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/design-preview.html` を3カラムレイアウトに変更し、カード詳細パネルにカード画像と公式サイトリンクを追加する。

**Architecture:** 単一HTMLファイルの変更のみ。`<aside>`（w-56）にフィルターを残し、新たな中央カラム（w-56）に検索バー＋カードリストを移動し、右カラム（flex-1）をカード詳細パネルとする。カード画像は `https://dm.takaratomy.co.jp/wp-content/card/cardimage/{card_id}.jpg` から取得し、`onerror` で欠損を吸収する。

**Tech Stack:** Vanilla HTML / CSS / JavaScript、Tailwind CSS (CDN)

---

### 変更ファイル

- Modify: `docs/design-preview.html`（全4タスクで変更）

---

### Task 1: CARDS モックデータに `card_id` フィールドを追加

**Files:**
- Modify: `docs/design-preview.html`（`const CARDS = [...]` 部分）

- [ ] **Step 1: 現在の CARDS 配列の構造を確認する**

```bash
grep -n "card_id\|set_code\|card_number" docs/design-preview.html | head -20
```

Expected: `card_id` が存在しないこと、`set_code` と `card_number` が各エントリにあること。

- [ ] **Step 2: CARDS 配列の各エントリに `card_id` を追加する**

`docs/design-preview.html` の `const CARDS = [` から始まるブロックを以下に置き換える:

```javascript
const CARDS = [
  {id:2347,name:"ボルメテウス・ホワイト・ドラゴン",card_type:"クリーチャー",cost:7,power:7000,civilization:"火",race:"アーマード・ドラゴン",rarity:"SR",set_code:"DM-06",card_number:"S8/S10",card_id:"dm06-s08",text:"W(ダブル)・ブレイカー(シールドを攻撃したとき、このクリーチャーはシールドを２枚ブレイクする)\nこのクリーチャーがシールドをブレイクしたとき、相手はそのシールドを持ち主の墓地に置く。(その「S(シールド)・トリガー」は使えない)"},
  {id:332,name:"アストラル・リーフ",card_type:"進化クリーチャー",cost:2,power:4000,civilization:"水",race:"サイバー・ウイルス",rarity:"VR",set_code:"DM-04",card_number:"2/55",card_id:"dm04-002",text:"進化-自分のサイバー・ウイルス１体の上に置く。\nこのクリーチャーがバトルゾーンに出たとき、カードを３枚引いてもよい。"},
  {id:118,name:"ボルシャック・ドラゴン",card_type:"クリーチャー",cost:6,power:6000,civilization:"火",race:"アーマード・ドラゴン",rarity:"VR",set_code:"DM-01",card_number:"8/110",card_id:"dm01-008",text:"攻撃中、このクリーチャーのパワーは、自分の墓地にある火のカード１枚につき+1000される。\nW・ブレイカー(このクリーチャーはシールドを２枚ブレイクする。)"},
  {id:724,name:"無双竜機ボルバルザーク",card_type:"クリーチャー",cost:7,power:6000,civilization:"火/自然",race:"アース・ドラゴン/アーマード・ドラゴン",rarity:"VR",set_code:"DM-10",card_number:"9/110",card_id:"dm10-009",text:"マナゾーンに置く時、このカードはタップして置く。\nこのクリーチャーをバトルゾーンに出した時、他のパワー6000のクリーチャーをすべて破壊する。その後、このターンの後にもう一度自分のターンを行う。そのターンの終わりに、自分はゲームに負ける。\nスピードアタッカー\nW・ブレイカー"},
  {id:1,name:"銀界の守護者ル・ギラ・レシール",card_type:"クリーチャー",cost:5,power:4000,civilization:"光",race:"ガーディアン",rarity:"VR",set_code:"DM-06",card_number:"1/110",card_id:"dm06-001",text:"ブロッカー\nこのクリーチャーがバトルゾーンにある間、進化クリーチャーはタップされた状態でバトルゾーンに出る。\nこのクリーチャーは、相手プレイヤーを攻撃できない。"},
  {id:137,name:"デーモン・ハンド",card_type:"呪文",cost:6,power:null,civilization:"闇",race:null,rarity:"R",set_code:"DM-01",card_number:"27/110",card_id:"dm01-027",text:"S・トリガー\n相手のクリーチャーを１体破壊する。"},
  {id:125,name:"ホーリー・スパーク",card_type:"呪文",cost:6,power:null,civilization:"光",race:null,rarity:"R",set_code:"DM-01",card_number:"15/110",card_id:"dm01-015",text:"S・トリガー\nバトルゾーンにある相手のクリーチャーすべてをタップする。"},
  {id:86,name:"スパイラル・ゲート",card_type:"呪文",cost:2,power:null,civilization:"水",race:null,rarity:"C",set_code:"DM-01",card_number:"85/110",card_id:"dm01-085",text:"S・トリガー\nバトルゾーンにあるクリーチャーを１体選び、持ち主の手札に戻す。"},
  {id:132,name:"クリスタル・メモリー",card_type:"呪文",cost:4,power:null,civilization:"水",race:null,rarity:"R",set_code:"DM-01",card_number:"22/110",card_id:"dm01-022",text:"S・トリガー\n自分の山札からカードを１枚選び、自分の手札に加える。"},
  {id:2172,name:"無敵城 シルヴァー・グローリー",card_type:"城",cost:6,power:null,civilization:"光",race:null,rarity:"VR",set_code:"DM-30",card_number:"1/55",card_id:"dm30-001",text:"城-自分のシールドをひとつ選び、このカードを付けて要塞化する。\n自分のクリーチャーはすべてのバトルに勝つ。"},
];
```

- [ ] **Step 3: `card_id` が全エントリに存在することを確認する**

```bash
grep -o '"card_id":"[^"]*"' docs/design-preview.html
```

Expected: 10行、それぞれ `"card_id":"dm01-008"` などが出力される。

- [ ] **Step 4: コミット**

```bash
git add docs/design-preview.html
git commit -m "feat: add card_id to mock data for image URL construction"
```

---

### Task 2: HTMLレイアウトを3カラム構成に変更

**Files:**
- Modify: `docs/design-preview.html`（`<aside>` と `<main>` を含む `<div class="flex h-[calc(100vh-52px)]">` ブロック全体）

- [ ] **Step 1: 変更前の構造を確認する**

```bash
grep -n "aside\|<main\|detailPanel\|cardList\|resultCount\|textSearch" docs/design-preview.html | head -30
```

Expected: `<aside>` が1箇所、`<main>` が1箇所、`detailPanel` が2箇所（PC右パネルとモバイルモーダル内）。

- [ ] **Step 2: `<div class="flex h-[calc(100vh-52px)]">` から `</main>` 直前の `</div>` までを置換する**

`docs/design-preview.html` の以下のブロックを:

```html
<div class="flex h-[calc(100vh-52px)]">

  <!-- ========== PC サイドバー ========== -->
  <aside class="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 overflow-y-auto shrink-0">
    <div class="p-4 space-y-5 text-sm">

      <!-- 文明 -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">文明</p>
        <div class="space-y-1">
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="光" checked> <span class="civ-光 border rounded-full px-2 py-0.5 text-xs">光</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="水" checked> <span class="civ-水 border rounded-full px-2 py-0.5 text-xs">水</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="闇" checked> <span class="civ-闇 border rounded-full px-2 py-0.5 text-xs">闇</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="火" checked> <span class="civ-火 border rounded-full px-2 py-0.5 text-xs">火</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="自然" checked> <span class="civ-自然 border rounded-full px-2 py-0.5 text-xs">自然</span></label>
        </div>
      </div>

      <!-- コスト -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">コスト</p>
        <div class="flex items-center gap-2">
          <input id="costMin" type="number" min="1" max="15" placeholder="1" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
          <span class="text-gray-400">〜</span>
          <input id="costMax" type="number" min="1" max="15" placeholder="15" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
        </div>
      </div>

      <!-- パワー -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">パワー</p>
        <div class="flex items-center gap-2">
          <input id="powerMin" type="number" step="1000" placeholder="—" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
          <span class="text-gray-400">〜</span>
          <input id="powerMax" type="number" step="1000" placeholder="—" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
        </div>
      </div>

      <!-- カードの種類 -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">カードの種類</p>
        <select id="cardType" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
          <option value="">すべて</option>
          <option>クリーチャー</option>
          <option>進化クリーチャー</option>
          <option>呪文</option>
          <option>クロスギア</option>
          <option>城</option>
        </select>
      </div>

      <!-- 種族 -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">種族</p>
        <input id="race" type="text" placeholder="ドラゴン など" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
      </div>
    </div>
  </aside>

  <!-- ========== メインエリア ========== -->
  <main class="flex-1 flex flex-col overflow-hidden">

    <!-- テキスト検索バー -->
    <div class="bg-white border-b border-gray-200 px-4 py-3">
      <input id="textSearch" type="text" placeholder="カード名・テキストで検索..."
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">

      <!-- スマホ用インラインフィルター -->
      <div class="mt-3 md:hidden space-y-2">
        <div class="flex gap-2 flex-wrap" id="mobileCivTags">
          <button onclick="toggleMobileCiv(this,'光')"  data-civ="光"  data-on="1" class="civ-光  border rounded-full px-3 py-0.5 text-xs font-medium">光</button>
          <button onclick="toggleMobileCiv(this,'水')"  data-civ="水"  data-on="1" class="civ-水  border rounded-full px-3 py-0.5 text-xs font-medium">水</button>
          <button onclick="toggleMobileCiv(this,'闇')"  data-civ="闇"  data-on="1" class="civ-闇  border rounded-full px-3 py-0.5 text-xs font-medium">闇</button>
          <button onclick="toggleMobileCiv(this,'火')"  data-civ="火"  data-on="1" class="civ-火  border rounded-full px-3 py-0.5 text-xs font-medium">火</button>
          <button onclick="toggleMobileCiv(this,'自然')" data-civ="自然" data-on="1" class="civ-自然 border rounded-full px-3 py-0.5 text-xs font-medium">自然</button>
        </div>
        <div class="flex gap-2">
          <select id="mobileCardType" class="flex-1 border border-gray-300 rounded px-2 py-1 text-xs">
            <option value="">種類: すべて</option>
            <option>クリーチャー</option>
            <option>進化クリーチャー</option>
            <option>呪文</option>
            <option>クロスギア</option>
            <option>城</option>
          </select>
          <select id="mobileCostMax" class="flex-1 border border-gray-300 rounded px-2 py-1 text-xs">
            <option value="">コスト: すべて</option>
            <option value="2">〜2</option>
            <option value="4">〜4</option>
            <option value="6">〜6</option>
            <option value="8">〜8</option>
          </select>
        </div>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden">
      <!-- 結果リスト -->
      <div class="flex-1 overflow-y-auto">
        <div class="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100" id="resultCount">10件表示</div>
        <div id="cardList" class="divide-y divide-gray-100"></div>
      </div>

      <!-- カード詳細パネル（PC: 右サイドパネル） -->
      <div id="detailPanel" class="hidden md:flex flex-col w-80 bg-white border-l border-gray-200 overflow-y-auto shrink-0">
        <div class="p-5 text-sm text-gray-400 text-center mt-8">カードをクリックすると<br>詳細が表示されます</div>
      </div>
    </div>

    <!-- スマホ詳細 モーダル -->
    <div id="mobileDetail" class="fixed inset-0 bg-black/50 z-30 hidden md:hidden" onclick="closeMobileDetail(event)">
      <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto p-5" onclick="event.stopPropagation()">
        <div class="flex justify-between items-center mb-4">
          <h2 id="mobileDetailName" class="font-bold text-base"></h2>
          <button onclick="closeMobileDetail()" class="text-gray-400 text-xl leading-none">&times;</button>
        </div>
        <div id="mobileDetailBody"></div>
      </div>
    </div>
  </main>
</div>
```

以下に置き換える:

```html
<div class="flex h-[calc(100vh-52px)]">

  <!-- ========== 左カラム: フィルター（PC のみ w-56）========== -->
  <aside class="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 overflow-y-auto shrink-0">
    <div class="p-4 space-y-5 text-sm">

      <!-- 文明 -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">文明</p>
        <div class="space-y-1">
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="光" checked> <span class="civ-光 border rounded-full px-2 py-0.5 text-xs">光</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="水" checked> <span class="civ-水 border rounded-full px-2 py-0.5 text-xs">水</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="闇" checked> <span class="civ-闇 border rounded-full px-2 py-0.5 text-xs">闇</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="火" checked> <span class="civ-火 border rounded-full px-2 py-0.5 text-xs">火</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="civ-cb accent-indigo-600" value="自然" checked> <span class="civ-自然 border rounded-full px-2 py-0.5 text-xs">自然</span></label>
        </div>
      </div>

      <!-- コスト -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">コスト</p>
        <div class="flex items-center gap-2">
          <input id="costMin" type="number" min="1" max="15" placeholder="1" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
          <span class="text-gray-400">〜</span>
          <input id="costMax" type="number" min="1" max="15" placeholder="15" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
        </div>
      </div>

      <!-- パワー -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">パワー</p>
        <div class="flex items-center gap-2">
          <input id="powerMin" type="number" step="1000" placeholder="—" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
          <span class="text-gray-400">〜</span>
          <input id="powerMax" type="number" step="1000" placeholder="—" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
        </div>
      </div>

      <!-- カードの種類 -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">カードの種類</p>
        <select id="cardType" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
          <option value="">すべて</option>
          <option>クリーチャー</option>
          <option>進化クリーチャー</option>
          <option>呪文</option>
          <option>クロスギア</option>
          <option>城</option>
        </select>
      </div>

      <!-- 種族 -->
      <div>
        <p class="font-semibold text-gray-600 mb-2 text-xs uppercase tracking-wide">種族</p>
        <input id="race" type="text" placeholder="ドラゴン など" class="w-full border border-gray-300 rounded px-2 py-1 text-sm">
      </div>
    </div>
  </aside>

  <!-- ========== 中央カラム: 検索バー＋カードリスト（PC w-56、モバイル flex-1）========== -->
  <div class="flex-1 md:flex-none md:w-56 flex flex-col overflow-hidden border-r border-gray-200 bg-gray-50">

    <!-- 検索バー -->
    <div class="bg-white border-b border-gray-200 px-4 py-3">
      <input id="textSearch" type="text" placeholder="カード名・テキストで検索..."
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">

      <!-- スマホ用インラインフィルター -->
      <div class="mt-3 md:hidden space-y-2">
        <div class="flex gap-2 flex-wrap" id="mobileCivTags">
          <button onclick="toggleMobileCiv(this,'光')"  data-civ="光"  data-on="1" class="civ-光  border rounded-full px-3 py-0.5 text-xs font-medium">光</button>
          <button onclick="toggleMobileCiv(this,'水')"  data-civ="水"  data-on="1" class="civ-水  border rounded-full px-3 py-0.5 text-xs font-medium">水</button>
          <button onclick="toggleMobileCiv(this,'闇')"  data-civ="闇"  data-on="1" class="civ-闇  border rounded-full px-3 py-0.5 text-xs font-medium">闇</button>
          <button onclick="toggleMobileCiv(this,'火')"  data-civ="火"  data-on="1" class="civ-火  border rounded-full px-3 py-0.5 text-xs font-medium">火</button>
          <button onclick="toggleMobileCiv(this,'自然')" data-civ="自然" data-on="1" class="civ-自然 border rounded-full px-3 py-0.5 text-xs font-medium">自然</button>
        </div>
        <div class="flex gap-2">
          <select id="mobileCardType" class="flex-1 border border-gray-300 rounded px-2 py-1 text-xs">
            <option value="">種類: すべて</option>
            <option>クリーチャー</option>
            <option>進化クリーチャー</option>
            <option>呪文</option>
            <option>クロスギア</option>
            <option>城</option>
          </select>
          <select id="mobileCostMax" class="flex-1 border border-gray-300 rounded px-2 py-1 text-xs">
            <option value="">コスト: すべて</option>
            <option value="2">〜2</option>
            <option value="4">〜4</option>
            <option value="6">〜6</option>
            <option value="8">〜8</option>
          </select>
        </div>
      </div>
    </div>

    <!-- カードリスト -->
    <div class="flex-1 overflow-y-auto">
      <div class="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100" id="resultCount">10件表示</div>
      <div id="cardList" class="divide-y divide-gray-100"></div>
    </div>
  </div>

  <!-- ========== 右カラム: カード詳細パネル（PC のみ flex-1）========== -->
  <div id="detailPanel" class="hidden md:flex flex-col flex-1 bg-white overflow-y-auto border-l border-gray-200">
    <div class="p-5 text-sm text-gray-400 text-center mt-8">カードをクリックすると<br>詳細が表示されます</div>
  </div>

</div>

<!-- スマホ詳細 モーダル（fixed 配置のため flex コンテナ外） -->
<div id="mobileDetail" class="fixed inset-0 bg-black/50 z-30 hidden md:hidden" onclick="closeMobileDetail(event)">
  <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto p-5" onclick="event.stopPropagation()">
    <div class="flex justify-between items-center mb-4">
      <h2 id="mobileDetailName" class="font-bold text-base"></h2>
      <button onclick="closeMobileDetail()" class="text-gray-400 text-xl leading-none">&times;</button>
    </div>
    <div id="mobileDetailBody"></div>
  </div>
</div>
```

- [ ] **Step 3: 構造が正しいことを確認する**

```bash
grep -c "<aside" docs/design-preview.html
grep -c "<main" docs/design-preview.html
grep -c "md:flex-none md:w-56" docs/design-preview.html
grep -c "border-l border-gray-200" docs/design-preview.html
```

Expected:
- `<aside` → 1
- `<main` → 0（削除済み）
- `md:flex-none md:w-56` → 1（中央カラム）
- `border-l border-gray-200` → 2以上（aside + detailPanel）

- [ ] **Step 4: ブラウザで開いてレイアウト確認**

```bash
# WSL2 から Windows ブラウザで開く
explorer.exe "$(wslpath -w /home/joji/duelmasters-classic08-database/docs/design-preview.html)"
```

確認事項:
- 左カラム（フィルター）・中央カラム（検索バー＋カードリスト）・右カラム（詳細）が横並び
- 左とカードリストのカラム幅が同じに見える
- カードをクリックすると右パネルに「カードをクリックすると詳細が表示されます」が出る
- 右パネルはビューポートの残り全幅を占める

- [ ] **Step 5: コミット**

```bash
git add docs/design-preview.html
git commit -m "feat: restructure to 3-column layout (filter | list | detail)"
```

---

### Task 3: `detailHTML()` にカード画像と公式サイトリンクを追加

**Files:**
- Modify: `docs/design-preview.html`（`function detailHTML(c)` 内）

- [ ] **Step 1: 現在の `detailHTML` 関数の先頭と末尾を確認する**

```bash
grep -n "detailHTML\|function detail\|space-y-3\|収録" docs/design-preview.html
```

Expected: `function detailHTML(c)` の開始行番号と、`return \`` の直後の `<div class="space-y-3">` の行を確認する。

- [ ] **Step 2: `detailHTML` 関数内の `return` テンプレートリテラルを以下に置き換える**

現在の `function detailHTML(c) {` の `return \`` から末尾 `\`;` までを以下に置き換える:

```javascript
function detailHTML(c) {
  return `
    <div class="space-y-4">
      <div class="flex justify-center">
        <img
          src="https://dm.takaratomy.co.jp/wp-content/card/cardimage/${c.card_id}.jpg"
          alt="${c.name.replace(/"/g,'&quot;')}"
          onerror="this.style.display='none'"
          class="rounded-lg shadow-md max-w-[200px] w-full">
      </div>
      <div class="flex flex-wrap gap-1">${civBadge(c.civilization)}</div>
      <table class="text-sm w-full">
        <tr><td class="text-gray-500 pr-3 py-0.5 w-24">カードの種類</td><td class="font-medium">${c.card_type}</td></tr>
        <tr><td class="text-gray-500 pr-3 py-0.5">コスト</td><td class="font-medium">${c.cost}</td></tr>
        ${c.power!==null?`<tr><td class="text-gray-500 pr-3 py-0.5">パワー</td><td class="font-medium">${c.power.toLocaleString()}</td></tr>`:''}
        ${c.race?`<tr><td class="text-gray-500 pr-3 py-0.5">種族</td><td class="font-medium">${c.race}</td></tr>`:''}
      </table>
      ${c.text?`
        <div>
          <div class="text-xs text-gray-400 uppercase tracking-wide mb-1">能力テキスト</div>
          <div class="text-sm bg-gray-50 rounded p-2 whitespace-pre-wrap leading-relaxed">${c.text}</div>
        </div>`:''}
      <div>
        <div class="text-xs text-gray-400 uppercase tracking-wide mb-1">収録</div>
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium">${c.set_code}</span>
          <span class="text-sm text-gray-500">${c.card_number}</span>
          <span class="text-sm ${rarityClass(c.rarity)}">${c.rarity}</span>
        </div>
      </div>
      <div>
        <a href="https://dm.takaratomy.co.jp/card/detail/?id=${c.card_id}"
           target="_blank" rel="noopener noreferrer"
           class="text-xs text-indigo-600 hover:text-indigo-800 hover:underline">
          公式サイトで見る →
        </a>
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: 関数内に `card_id` 参照と公式リンクが存在することを確認する**

```bash
grep -n "card_id\|takaratomy.co.jp/card/detail\|公式サイトで見る" docs/design-preview.html
```

Expected: 3行マッチ（画像 src、href、リンクテキスト）。

- [ ] **Step 4: ブラウザでカードをクリックして動作確認**

1. `docs/design-preview.html` をブラウザで開く（またはリロード）
2. カードリストからいずれかのカードをクリック
3. 右パネルの上部にカード画像が表示されること
4. 画像の下に文明バッジ・スタッツ・能力テキストが続くこと
5. 最下部に「公式サイトで見る →」リンクが表示されること
6. 呪文カード（デーモン・ハンド等）をクリック → 画像が存在しない場合は非表示になること（または画像が表示されること）

- [ ] **Step 5: コミット**

```bash
git add docs/design-preview.html
git commit -m "feat: add card image and official site link to detail panel"
```

---

### Task 4: スマホモーダルにもカード画像を追加

**Files:**
- Modify: `docs/design-preview.html`（`mobileDetailBody` へのコンテンツ設定箇所）

- [ ] **Step 1: モバイル詳細の設定箇所を確認する**

```bash
grep -n "mobileDetailBody\|mobileDetailName" docs/design-preview.html
```

Expected: `selectCard` 関数内で `mobileDetailBody.innerHTML = detailHTML(c)` のような行がある。

- [ ] **Step 2: `selectCard` 関数のモバイルブランチを確認する**

`selectCard` 関数内の以下の部分を探す:

```javascript
  } else {
    // スマホ: ボトムシート
    document.getElementById('mobileDetailName').textContent = c.name;
    document.getElementById('mobileDetailBody').innerHTML = detailHTML(c);
    document.getElementById('mobileDetail').classList.remove('hidden');
  }
```

`detailHTML(c)` はすでに Task 3 で画像を含む形に更新済みのため、この箇所は変更不要。

- [ ] **Step 3: モバイルモーダルの HTML に画像サイズが収まることを確認する**

`mobileDetail` の内部コンテナを確認する:

```bash
grep -n "max-h-\[80vh\]\|mobileDetail\b" docs/design-preview.html
```

Expected: `max-h-[80vh] overflow-y-auto` が設定されており、画像（`max-w-[200px]`）はこの枠内に収まる。

- [ ] **Step 4: ブラウザでモバイルサイズ（375px 幅）にして動作確認**

DevTools の Device Toolbar で iPhone サイズに設定し:
1. カードをタップ → ボトムシートが開く
2. ボトムシート内の上部にカード画像が表示される
3. スクロールで能力テキスト・公式リンクまで読める

- [ ] **Step 5: 最終コミット**

```bash
git add docs/design-preview.html
git commit -m "feat: card image in mobile modal via shared detailHTML()"
```

---

## 実装後の確認チェックリスト

- [ ] デスクトップ: 3カラムが正しく表示されている
- [ ] フィルターサイドバーとカードリストの幅が揃っている（目視）
- [ ] カード画像が右パネル上部に表示される
- [ ] 画像が 404 の場合は非表示になる（DevTools の Network タブで確認）
- [ ] 「公式サイトで見る →」リンクが新規タブで開く
- [ ] フィルター（文明・コスト等）が引き続き動作する
- [ ] モバイルモーダルにも画像が表示される
