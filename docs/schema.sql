-- =====================================================================
-- デュエマ クラシック08 カード検索DB スキーマ (PostgreSQL想定)
-- 設計方針:
--   - card と printing(収録) を 1:N で分離
--   - 08判定 = そのカードの最古printingの set.released_at <= 2008-12-31
--     (取り込み対象を <=2008 のセットに絞れば、母集団 = 08対象カードプール)
--   - 文明/種族は複数持ちがあるため別テーブル
--   - 制限(殿堂)は枚数を整数(max_copies)でマスタ保持
--   - 制限の紐付けは ruleset + effective_from を持つ履歴対応(案B)
-- =====================================================================

-- ---------- マスタ: 文明 ----------
CREATE TABLE civilizations (
  id          SMALLINT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE          -- 光 / 水 / 闇 / 火 / 自然
);

-- ---------- マスタ: 種族 ----------
CREATE TABLE races (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE          -- アーマード・ドラゴン, リキッド・ピープル, etc.
);

-- ---------- マスタ: セット(収録元) ----------
CREATE TABLE sets (
  id          SERIAL PRIMARY KEY,
  set_code    TEXT NOT NULL UNIQUE,         -- DM-01, DMC-46, DM-29+1D, P (promo) ...
  name        TEXT NOT NULL,
  line        TEXT NOT NULL,                -- DM / DMC / DMS / PROMO / VARIANT
  product_type TEXT,                        -- expansion / deck / starter / promo / variant
  series      TEXT,                         -- 闘魂編 / 聖拳編 / 転生編 / 不死鳥編 / 極神編 / 戦国編 ...
  released_at DATE,                         -- 日精度(スクレイプ時に商品ページから確定)
  released_ym CHAR(7),                      -- 'YYYY-MM' (年表ベースの暫定値)
  source      TEXT                          -- 'takaratomy_20th_history' など出典
);

-- ---------- カード本体 ----------
CREATE TABLE cards (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  name_reading TEXT,                        -- 読み(検索用)
  card_type   TEXT NOT NULL,               -- クリーチャー / 呪文 / クロスギア / 城 / 進化クリーチャー ...
  cost        SMALLINT,                     -- クリーチャー/呪文/クロスギア等
  power       INTEGER,                      -- クリーチャーのみ (nullable)
  text        TEXT,                         -- 能力テキスト
  flavor_text TEXT,
  illustrator TEXT,
  UNIQUE (name)                             -- 同名=同一カード(再録は printing 側で表現)
);

-- ---------- カード×文明 (多色対応) ----------
CREATE TABLE card_civilizations (
  card_id         INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  civilization_id SMALLINT NOT NULL REFERENCES civilizations(id),
  PRIMARY KEY (card_id, civilization_id)
);

-- ---------- カード×種族 (複数持ち対応) ----------
CREATE TABLE card_races (
  card_id  INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  race_id  INTEGER NOT NULL REFERENCES races(id),
  PRIMARY KEY (card_id, race_id)
);

-- ---------- 収録 (1カード N収録) ----------
CREATE TABLE printings (
  id          SERIAL PRIMARY KEY,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  set_id      INTEGER NOT NULL REFERENCES sets(id),
  card_number TEXT,                         -- 型番 (例: "1/110")
  rarity      TEXT,                         -- C / U / R / VR / SR / SECRET ...
  UNIQUE (set_id, card_number)
);

-- =====================================================================
-- 制限(殿堂) — 整数値はマスタに、紐付けは ruleset + 履歴で(案B)
-- =====================================================================

-- ---------- マスタ: ルールセット ----------
CREATE TABLE rulesets (
  id    SMALLINT PRIMARY KEY,
  code  TEXT NOT NULL UNIQUE,               -- 'dmc08' / 'official'
  name  TEXT NOT NULL
);

-- ---------- マスタ: 制限種別 (整数 max_copies を保持) ----------
CREATE TABLE restriction_types (
  id          SMALLINT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,         -- 通常 / 殿堂入り / プレミアム殿堂
  max_copies  SMALLINT NOT NULL,           -- 4 / 1 / 0  ← デッキ判定はこれと比較
  sort_order  SMALLINT NOT NULL DEFAULT 0
);

-- ---------- カード×制限 (ルールセット別・改定履歴対応) ----------
CREATE TABLE card_restrictions (
  id                  SERIAL PRIMARY KEY,
  card_id             INTEGER  NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  ruleset_id          SMALLINT NOT NULL REFERENCES rulesets(id),
  restriction_type_id SMALLINT NOT NULL REFERENCES restriction_types(id),
  effective_from      DATE,                 -- 改定日 (NULL可: 初期値)
  UNIQUE (card_id, ruleset_id, effective_from)
);
-- ※「現在の制限」は ruleset 内で effective_from が最新の行を引く。
--   紐付けが無いカードは通常(4枚)とみなす(アプリ側 or VIEW で補完)。

-- =====================================================================
-- seed: 固定マスタ
-- =====================================================================
INSERT INTO civilizations (id, name) VALUES
  (1,'光'),(2,'水'),(3,'闇'),(4,'火'),(5,'自然');

INSERT INTO rulesets (id, code, name) VALUES
  (1,'dmc08','デュエマクラシック08環境'),
  (2,'official','公式');

INSERT INTO restriction_types (id, name, max_copies, sort_order) VALUES
  (1,'通常',4,0),
  (2,'殿堂入り',1,1),
  (3,'プレミアム殿堂',0,2);

-- =====================================================================
-- 参考: 08対象カード抽出(取り込みを<=2008に絞らない場合の保険)
-- =====================================================================
-- SELECT c.*
-- FROM cards c
-- WHERE EXISTS (
--   SELECT 1 FROM printings p
--   JOIN sets s ON s.id = p.set_id
--   WHERE p.card_id = c.id AND s.released_at <= DATE '2008-12-31'
-- );
