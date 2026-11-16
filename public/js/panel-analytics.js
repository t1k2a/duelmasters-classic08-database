/** 固定名の画面表示回数。同意前の操作は保存・遡及送信しない。 */
(() => {
  'use strict'
  const deck = document.getElementById('deckPanel')
  const detail = document.getElementById('mobileDetail')
  if (!deck || !detail) return
  let lastPanel = null
  const report = () => {
    // デッキは詳細より前面。DOM本文・検索語・デッキ名は読み取らない。
    const panel = !deck.classList.contains('hidden') ? 'deck'
      : !detail.classList.contains('hidden')
      ? (detail.dataset.analyticsPanel === 'recipe' ? 'recipe' : 'card_detail')
      : 'search'
    if (panel !== lastPanel && window.trackPanelView?.(panel)) lastPanel = panel
  }
  // 同一描画内の開閉はまとめて判定し、一瞬だけ現れる背景画面は数えない。
  const observer = new MutationObserver(report)
  for (const element of [deck, detail]) {
    observer.observe(element, { attributes: true, attributeFilter: ['class', 'data-analytics-panel'] })
  }
  window.addEventListener('analytics-consent-granted', report)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', report)
  else report()
})()
