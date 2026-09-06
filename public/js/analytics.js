/**
 * Google Analytics 4 + 同意バナー（共通スニペット）。
 *
 * SPA(public/index.html) と、scripts/build-card-pages.ts が生成する
 * カード/レシピ個別ページの両方から読み込まれる。
 *
 * 方針:
 *   - 測定IDはソースに直書きしない。ビルド時に env(GA_MEASUREMENT_ID) から生成される
 *     js/analytics-config.js が window.__GA_ID__ にセットした値を読む。
 *   - 未設定（空 or プレースホルダ）なら gtag を読み込まず、バナーも出さず、何もしない。
 *   - gtag.js の読み込み・送信は「同意後のみ」。初回は同意バナーを表示し、
 *     選択を localStorage に保存。拒否時は一切トラッキングしない。再訪問時はバナーを出さない。
 *   - IP匿名化など、プライバシー配慮のデフォルトを付与する。
 *   - window.trackEvent(eventName, params) で安全にカスタムイベントを送信可能。
 *
 * ★測定IDの設定方法: 環境変数 GA_MEASUREMENT_ID を設定して `npm run build:analytics-config`
 *   （build にも組込み済み）を実行すると js/analytics-config.js が生成される。
 *   このファイルは .gitignore 対象でリポジトリには追跡されない。
 */
(function () {
  'use strict'

  // 測定IDは js/analytics-config.js（ビルド時に env から生成、gitignore対象）が
  // window.__GA_ID__ にセットする。ソースには直書きしない。
  var MEASUREMENT_ID = (typeof window !== 'undefined' && window.__GA_ID__) || ''
  var PLACEHOLDER = 'G-XXXXXXXXXX'
  var CONSENT_KEY = 'ga-consent' // 'granted' | 'denied'

  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY) } catch (e) { return null }
  }
  function setConsent(v) {
    try { localStorage.setItem(CONSENT_KEY, v) } catch (e) {}
  }

  // カスタムイベント送信用のグローバル関数
  window.trackEvent = function (eventName, params) {
    try {
      if (getConsent() !== 'granted' || !MEASUREMENT_ID || MEASUREMENT_ID === PLACEHOLDER) return
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params || {})
      }
    } catch (e) {
      console.warn('[Analytics] Failed to track event:', e)
    }
  }

  // 成長ファネル用イベントは、名前や自由入力を送らないよう
  // イベントごとの許可パラメータだけに正規化する。
  var GROWTH_EVENT_PARAMS = {
    view_card_detail: ['card_id'],
    copy_deck: ['content_id', 'card_count'],
    content_cta_click: ['content_id', 'destination_type'],
    deck_complete: ['card_count'],
    share_deck: ['method', 'card_count'],
    pwa_install_prompt: [],
    pwa_install: [],
  }
  var GROWTH_SHARE_METHODS = ['x', 'web_share', 'image_download']
  var GROWTH_DESTINATION_TYPES = ['deck_builder']

  function growthEventParams(eventName, params) {
    var allowed = GROWTH_EVENT_PARAMS[eventName]
    if (!allowed) return null
    var source = params && typeof params === 'object' ? params : {}
    var clean = {}
    for (var i = 0; i < allowed.length; i += 1) {
      var key = allowed[i]
      var value = source[key]
      if ((key === 'card_id' || key === 'content_id') && typeof value === 'string' && /^[a-z0-9-]{1,80}$/i.test(value)) {
        clean[key] = value
      } else if (key === 'method' && GROWTH_SHARE_METHODS.indexOf(value) !== -1) {
        clean[key] = value
      } else if (key === 'destination_type' && GROWTH_DESTINATION_TYPES.indexOf(value) !== -1) {
        clean[key] = value
      } else if (key === 'card_count' && Number.isInteger(value) && value >= 1 && value <= 40) {
        clean[key] = value
      }
    }
    if (eventName === 'view_card_detail' && !clean.card_id) return null
    if (eventName === 'copy_deck' && !clean.content_id) return null
    if (eventName === 'content_cta_click' && (!clean.content_id || !clean.destination_type)) return null
    if (eventName === 'deck_complete' && clean.card_count !== 40) return null
    if (eventName === 'share_deck' && (!clean.method || !clean.card_count)) return null
    return clean
  }

  window.trackGrowthEvent = function (eventName, params) {
    var clean = growthEventParams(eventName, params)
    if (clean === null) return
    window.trackEvent(eventName, clean)
  }

  var sentOnce = new Set()
  window.trackEventOnce = function (key, eventName, params) {
    if (typeof key !== 'string' || !key || sentOnce.has(key)) return
    var clean = growthEventParams(eventName, params)
    if (clean === null) return
    sentOnce.add(key)
    window.trackEvent(eventName, clean)
  }

  // 未設定（空 or プレースホルダ）なら安全側で何もしない。バナーもタグも出さない。
  if (!MEASUREMENT_ID || MEASUREMENT_ID === PLACEHOLDER) return

  // このスクリプト自身の src からサイトのベースパスを導出する。
  // GitHub Pages のサブパス配信でも、各ページの階層差に依存せずリンクできる。
  var self = document.currentScript
  var base = self ? self.src.replace(/js\/analytics\.js.*$/, '') : ''
  var PRIVACY_URL = base + 'privacy/'

  // 同意後にのみ gtag.js を読み込んで初期化する。
  function loadGtag() {
    if (window.__gaLoaded) return
    window.__gaLoaded = true

    var s = document.createElement('script')
    s.async = true
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID)
    document.head.appendChild(s)

    window.dataLayer = window.dataLayer || []
    window.gtag = function () { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
    window.gtag('config', MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    })
  }

  function removeBanner() {
    var el = document.getElementById('ga-consent-banner')
    if (el) el.remove()
  }

  function showBanner() {
    if (document.getElementById('ga-consent-banner')) return
    var banner = document.createElement('div')
    banner.id = 'ga-consent-banner'
    banner.className =
      'fixed bottom-0 inset-x-0 z-[60] bg-gray-900 text-white text-sm px-4 py-3 shadow-lg'
    banner.innerHTML =
      '<div class="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">' +
      '<p class="flex-1 leading-relaxed">' +
      'このサイトではアクセス解析に Google Analytics 4 を使用します（Cookie利用）。' +
      '<a href="' + PRIVACY_URL + '" class="underline text-indigo-300 hover:text-indigo-200">プライバシーポリシー</a>' +
      '</p>' +
      '<div class="flex gap-2 shrink-0">' +
      '<button id="ga-consent-accept" class="bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-1.5 font-medium">同意する</button>' +
      '<button id="ga-consent-reject" class="border border-gray-500 hover:bg-gray-800 rounded-lg px-4 py-1.5">拒否する</button>' +
      '</div></div>'
    document.body.appendChild(banner)

    document.getElementById('ga-consent-accept').addEventListener('click', function () {
      setConsent('granted')
      removeBanner()
      loadGtag()
    })
    document.getElementById('ga-consent-reject').addEventListener('click', function () {
      setConsent('denied')
      removeBanner()
    })
  }

  function init() {
    var consent = getConsent()
    if (consent === 'granted') {
      loadGtag()
    } else if (consent === 'denied') {
      // 何もしない（再訪問ではバナーも出さない）。
    } else {
      showBanner()
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
