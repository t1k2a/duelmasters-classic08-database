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

  // 未設定（空 or プレースホルダ）なら安全側で何もしない。バナーもタグも出さない。
  if (!MEASUREMENT_ID || MEASUREMENT_ID === PLACEHOLDER) return

  // このスクリプト自身の src からサイトのベースパスを導出する。
  // GitHub Pages のサブパス配信でも、各ページの階層差に依存せずリンクできる。
  var self = document.currentScript
  var base = self ? self.src.replace(/js\/analytics\.js.*$/, '') : ''
  var PRIVACY_URL = base + 'privacy/'

  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY) } catch (e) { return null }
  }
  function setConsent(v) {
    try { localStorage.setItem(CONSENT_KEY, v) } catch (e) {}
  }

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
