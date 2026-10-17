// Fixed-path runtime: changing a shop's search format must not regenerate HTML.
(function () {
  'use strict';

  function searchUrl(shop, name) {
    const keyword = encodeURIComponent('デュエルマスターズ ' + name);
    switch (shop) {
      case 'surugaya': return 'https://www.suruga-ya.jp/search?category=&search_word=' + keyword;
      case 'mercari': return 'https://jp.mercari.com/search?keyword=' + keyword;
      case 'ka-nabell': return 'https://www.ka-nabell.com/?act=sell_search&genre=7&type=2&key_word=' + encodeURIComponent(name);
      default: return null;
    }
  }

  function apply(root) {
    (root || document).querySelectorAll('a[data-shop][data-shop-query]').forEach(link => {
      const url = searchUrl(link.dataset.shop, link.dataset.shopQuery);
      if (url) link.href = url;
    });
  }

  window.ShopLinks = { searchUrl, apply };
  apply();
})();
