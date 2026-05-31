# Known Gaps in Seed Data

## DMC-11, DMC-12
公式年表 (takaratomy.co.jp/20th/history/) に未掲載。
製品名・発売日ともに未確定。
**対応方針**: Phase 2 の Playwright スクレイプ時に `?product=dmc11` / `?product=dmc12` で
公式カードDB上の存在を確認し、判明次第 sets テーブルに追加する。

## DMC-20, DMC-21 (双龍誕生)
年月は別ソースで 2005-02 と確認済み（sets_dmc08.json に記載）。
日精度（released_at）は未確定。
**対応方針**: Phase 2 で商品ページURLを探索し、確定できれば UPDATE する。

## プロモカード (P)
公式カードDB のフィルター「プロモ限定カード N期」で取得可能。
2008年以前相当の期番号を Phase 2 で特定する。
set_code = 'P' としてプロモセットを 1 件追加予定（Phase 2 で判明次第 migrate）。

## released_at (日精度)
全セット現在 NULL。
released_ym（年月精度）のみ保持。
Phase 2 で各セットの公式商品ページをスクレイプし、判明したものから UPDATE する。
