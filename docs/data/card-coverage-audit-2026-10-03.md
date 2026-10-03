# クラシック08 カード収録監査（2026-10-03）

体制：CEO／Director／Reviewer・QA Lead／Tech Lead・Fullstack Engineer／CMO・Marketing Lead／Data Analyst。

## 対象と方法

基準コミットは `b941908243eb5dca028184cc75e87bc7bd4058e1`（main）。確認日は2026-10-03。カード・seed JSONは変更していない。`public/cards.json` をJSONとして読み、名称完全一致、NFKC正規化と空白・中点除去、関連語の部分一致で照合した。部分一致は同一カードと認定する根拠にはしない。型番は全カードの `printings` を展開して確認した。

収録方針は `data/seeds/sets_dmc08.json` の発売日2008-12-31以前、DM-01〜30と同期間のデッキ限定・プロモ。独自制限は `classic08_restrictions.json` と[大会レギュレーション](https://www.hareruya3.com/pages/taiyooh-classic)による。使用禁止とDB未収録は別である。城・クロスギアは対象だが、後年のサイキック・ツインパクト等は対象外。同名再録は `scripts/build-json.ts` が1カードへ統合するため、型番の未収録と固有カード欠落を区別する。

## 現カタログの規模と検証限界

| 対象 | 確認結果 | 限界 |
| --- | --- | --- |
| カード | 2,251種類 | 全対象カードの総数という意味ではない |
| DM-01〜30 | 2,310 printing。通常・S系列の観測分母に対する番号欠落なし | 外部の独立した全リストとの照合ではない。+1D等は含まない |
| DMC | 241 printing。34/37/38/40/41/42/44/46の8セット | セット未収録でも同名再録が別セットで収録済みの場合がある |
| PROMO-Y1〜7 | 163 printing（26/26/39/42/14/11/5） | 配布リスト全件・配布日の境界を未照合 |
| レシピJSON | 16,813レコード | 全件の08適合や画面表示件数とは異なる |

DM番号の検査は `printings[].cardNumber` の通常/S系列について、各分母の1〜Nの集合と実在番号集合を比較したもの。`src/verify/set-completeness.ts` の期待系列マニフェストもDM-01〜30のみであり、DMC・PROMO・特別版の完全性を証明しない。raw HTML再取得やDB書込みは実施していない。

## 固有カード欠落と候補

以下はすべて基準カタログの正確名・正規化名が0件。網羅的な欠落一覧ではない。公式ページの存在と対象年代の確認を分け、発売日の証明が不足するものは保留する。

| カード | 根拠 | 判定・次の確認 |
| --- | --- | --- |
| ボルメテウス・サファイア・ドラゴン | 独自制限seedのhelperとknownMissing、[大会レギュレーション](https://www.hareruya3.com/pages/taiyooh-classic) | 既知の対象内欠落。初出・取込元の具体的IDは別途確定 |
| 紅神龍バルガゲイザー | [DMC36 6/26](https://dm.takaratomy.co.jp/card/detail/?id=dmc36-006)、[公式年表](https://dm.takaratomy.co.jp/20th/history/)の2007年商品 | 対象内欠落。別ID [sp-003](https://dm.takaratomy.co.jp/card/detail/?id=sp-003)を別カードとして二重計上しない |
| エンドラ・パッピー | [DMC43 4/36](https://dm.takaratomy.co.jp/card/detail/?id=dmc43-004)、公式年表の2008年7月商品 | 対象内欠落。「ポッポ・弥太郎・パッピー」は別カード |
| ボルメテウス・剣誠・ドラゴン | [dmc45-006](https://dm.takaratomy.co.jp/card/detail/?id=dmc45-006) | DMC45（2008年11月）由来の欠落候補 |
| 風刃 カミカゼ・スピリット | [dmc45-008](https://dm.takaratomy.co.jp/card/detail/?id=dmc45-008) | 同上 |
| 雷刃 ブシドー・スピリット | [dmc45-009](https://dm.takaratomy.co.jp/card/detail/?id=dmc45-009) | 同上 |
| 武装竜鬼ジオゴクトラ | [dmc45-015](https://dm.takaratomy.co.jp/card/detail/?id=dmc45-015) | 同上 |
| 龍刃 ヤマト・スピリット | [dmc45-017](https://dm.takaratomy.co.jp/card/detail/?id=dmc45-017) | 同上。この5枚だけでDMC45の新規カード全数とは主張しない |
| アルティメット・影虎・ドラゴン | [公式年表](https://dm.takaratomy.co.jp/20th/history/)がDM27+1D（2008年4月）の追加を明記 | 対象内欠落。公式ID [dm27+1d-001](https://dm.takaratomy.co.jp/card/detail/?id=dm27%2B1d-001)も確認対象 |
| 光器エレーナ | [sp-004](https://dm.takaratomy.co.jp/card/detail/?id=sp-004) | 公式カード実在・現データ欠落。ページは特別商品表記のみで、対象年代の独立確認待ち |
| 魔皇グレンベルク | [sp-029](https://dm.takaratomy.co.jp/card/detail/?id=sp-029) | 公式カード実在・現データ欠落。DMC35との紐付けと発売年代の確認待ち |
| 封魔アガシオン | [sp-030](https://dm.takaratomy.co.jp/card/detail/?id=sp-030) | 同上 |

追加の公式IDを受領して現データを照合した結果を以下に分ける。詳細ページを能力・名称の根拠、[公式年表](https://dm.takaratomy.co.jp/20th/history/)と[DM27+1D商品ページ](https://dm.takaratomy.co.jp/product/dm27_1d/)を商品年代の根拠として使う。

| 追加候補（現カタログ0件） | 公式ID | 対象商品 |
| --- | --- | --- |
| ウルトラ・ミラクルッピー | [dm27+1d-002](https://dm.takaratomy.co.jp/card/detail/?id=dm27%2B1d-002) | DM27+1D、2008年4月 |
| 星龍グレイテスト・アース | [dm27+1d-003](https://dm.takaratomy.co.jp/card/detail/?id=dm27%2B1d-003) | 同上 |
| 無双竜機ボルグレス・バーズ | [dmc39-003](https://dm.takaratomy.co.jp/card/detail/?id=dmc39-003) | DMC39、2007年11月 |
| 聖霊龍騎セイント・ボルシャック | [dmc43-003](https://dm.takaratomy.co.jp/card/detail/?id=dmc43-003) | DMC43、2008年7月 |
| ヘヴンとバイオレンスの衝撃 | [dmc43-005](https://dm.takaratomy.co.jp/card/detail/?id=dmc43-005) | 同上 |
| 武装竜鬼ボルグゲンパク | [dmc45-013](https://dm.takaratomy.co.jp/card/detail/?id=dmc45-013) | DMC45、2008年11月 |
| 武装剣心シシオウ | [dmc45-016](https://dm.takaratomy.co.jp/card/detail/?id=dmc45-016) | 同上 |

特別商品IDは元セット・番号・発売日が欠ける場合がある。次の公式ページ付き名称も現データ0件だが、対象年代・元商品を別途確定してから追加判断する。

| カード | 公式ID |
| --- | --- |
| バルキリー・ドラゴン | [sp-001](https://dm.takaratomy.co.jp/card/detail/?id=sp-001) |
| 魔刻の騎士オルゲイト | [sp-002](https://dm.takaratomy.co.jp/card/detail/?id=sp-002) |
| ミラフォース・ドラゴン | [sp-006](https://dm.takaratomy.co.jp/card/detail/?id=sp-006) |
| 大勇者「密林の剣」 | [sp-009](https://dm.takaratomy.co.jp/card/detail/?id=sp-009) |
| 轟竜凰ドラグランダー | [sp-017](https://dm.takaratomy.co.jp/card/detail/?id=sp-017) |
| ブレイブハート・ドラグーン | [sp-019](https://dm.takaratomy.co.jp/card/detail/?id=sp-019) |
| 超竜バジュラズテラ | [sp-020](https://dm.takaratomy.co.jp/card/detail/?id=sp-020) |
| フレイムバーン・ドラゴン | [sp-021](https://dm.takaratomy.co.jp/card/detail/?id=sp-021) |
| 超神龍ザウム・ポセイダム | [sp-023](https://dm.takaratomy.co.jp/card/detail/?id=sp-023) |
| 建機男 | [sp-035](https://dm.takaratomy.co.jp/card/detail/?id=sp-035) |

一方、特別商品ID [sp-005](https://dm.takaratomy.co.jp/card/detail/?id=sp-005)の凶星王ダーク・ヒドラは `dmc38-009`、[sp-024](https://dm.takaratomy.co.jp/card/detail/?id=sp-024)のダーク・ルピアは `dm27-046` で収録済み。別IDを新しい固有カード欠落として数えない。「ボルメテウス・レッド・ドラグーン」は0件だが対象商品・年代の根拠未確定のため追加候補へ合算しない。

## 再録・対象外・古い記述の訂正

| 対象 | 判定 |
| --- | --- |
| ボルメテウス・ホワイト・ドラゴン | `dm06-s08` に収録済み。旧known_gapsの「存在しない」は現状と異なる |
| [大勇者「ふたつ牙」DMC39](https://dm.takaratomy.co.jp/card/detail/?id=dmc39-013) | `dm02-s05` で収録済み。DMC39 printingのみ未収録 |
| [鳴動するギガ・ホーンDMC39](https://dm.takaratomy.co.jp/card/detail/?id=dmc39-024) | `dm02-019` で収録済み。DMC39 printingのみ未収録 |
| ボルシャック・大和・ドラゴン／ボルバルザーク・紫電・ドラゴン | `dm26-s02`／`dm28-s08` で収録済み。DMC版IDの不存在は固有欠落ではない |
| 無双竜機ボルバルザーク | `dm10-009` で収録済み。独自ルールで禁止されることは未収録の理由ではない |
| ボルシャック・クロス・NEX | 対象外seedがDM34初出として分類。年代外カードを欠落候補にしない |
| DMC11/12 | [公式商品一覧](https://dm.takaratomy.co.jp/product/page/6/)に勝舞神龍強化拡張パック／白凰精霊強化拡張パック、いずれも2004年2月と掲載。「製品名・年月未確定」は古い |
| DM27とDM27+1D | 現seedは2008-03と2008-04の別行を既に保持している。seed欠落・年月混同ではない。現カードのDM27+1D printingが0件である |

DMC36/39/43/45には上記の公式カードページがあり、「セット全体に公式IDがない」という断定は撤回する。古い取得失敗は当時の探索方法の記録であり、現在の全ID不存在を証明しない。`out_of_pool_weak.json` のDMC49等は再録の可能性を残す弱い証拠なので、バルガゲイザーの初出年代をそれだけで除外しない。

## PROMO7期と2008年末の境界

[コロコロ公式の回顧記事](https://corocoro-news.jp/bakuren/298217/)は《邪将グレイト・アシカガ》を2009年4月号付録、《オーバーキル・ゼロ・ドラゴン》を同5月号付録として紹介する。7期だから暦年2008年内とは限らず、P51/Y7・P54/Y7は個別に配布時期と型番を照合する境界確認対象である。

今回の `cards.json` では両カード名は0件、P51/Y7・P54/Y7のprintingも0件。したがってこの2枚の混入は確認されていない。収録済みY7はP07/P08/P14/P22/P23の5件。これらの配布日についても今回の調査では全件確定していない。「PROMO-Y1〜7取り込み済み」と「対象期間のプロモ完全収録」を同義にしない。

P26/Y7《竜星バルガライザー》も現名称0件。2009年1月号という号数だけで対象外と決めず、実発売が2008年内かを確かめる必要がある。P53/Y7・P59/Y7等の2009年候補も、一次資料で配布日を確定してから判断する。後年再録だけで同名カードの初出を期間外と扱わない。

## 次の安全な作業

1. 上記候補の対象商品・年代・カード種類を確定し、固有カード追加とprinting補完を分けた変更案を作る。
2. 公式IDが見つかったセットは限定した取得計画と期待リストを用意する。取得失敗だけから全セット取得不可とは判断しない。
3. カードJSON・seed JSONの変更と再取り込みは本調査から分離する。不完全なrawキャッシュで既存カタログを再生成しない。
