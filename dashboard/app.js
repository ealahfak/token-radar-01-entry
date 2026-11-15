// Token Launch Radar: a static page. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, filters, a per-protocol detail drawer with the model's own inputs and the
// protocol's farm plan, and the live-token set that the ranking deliberately leaves out.
// No network, no clock, no storage: every byte shown is in data.js.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) return;

  var $ = function (id) { return document.getElementById(id); };
  var state = { q: '', scope: 'all', cat: 'all', chain: 'all', sort: 'implied', dir: -1, sel: null };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '<span class="flat">n/a</span>';
    var cls = n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function age(n) {
    if (n === null || n === undefined) return '<span class="flat">unknown</span>';
    if (n < 60) return n + 'd';
    if (n < 730) return (n / 30.44).toFixed(0) + 'mo';
    return (n / 365).toFixed(1) + 'y';
  }
  function num(n, d) { return Number(n).toFixed(d === undefined ? 2 : d); }
  function exact(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  var maxImplied = D.rows.length ? D.rows[0].implied_value_usd : 1;

  // ---------------------------------------------------------------- header
  $('lede').innerHTML =
    '<b>' + D.board_size + ' protocols that record no token</b>, ranked by what a token would be worth at the ' +
    'price the market already pays its peers: TVL times a comps multiple fitted on the ' + D.comps.global.n +
    ' protocols in this same snapshot that do trade, adjusted for seven-day growth and for how long the protocol ' +
    'has run without a token. Every watchlist protocol is on the board; ' + D.early_size + ' more are the early ' +
    'ones the radar exists to find.';

  $('stamp').innerHTML =
    '<span class="pill">snapshot <b>' + esc(D.as_of) + '</b></span>' +
    '<span class="pill">watchlist <b>' + D.watchlist_size + '</b></span>' +
    '<span class="pill">floor <b>' + usd(D.floor_usd) + ' TVL</b></span>' +
    '<span class="pill">model <b>' + esc(D.model_version) + '</b></span>' +
    '<span class="pill">live set aside <b>' + D.live_size + '</b></span>';

  $('stats').innerHTML =
    '<div class="stat a"><div class="k">Top implied value</div><div class="v">' + usd(D.rows[0].implied_value_usd) +
      '</div><div class="n">' + esc(D.rows[0].name) + '</div></div>' +
    '<div class="stat b"><div class="k">On the watchlist</div><div class="v">' + D.watchlist_size +
      '</div><div class="n">floor ' + usd(D.floor_usd) + ' TVL, no token recorded</div></div>' +
    '<div class="stat c"><div class="k">Early radar</div><div class="v">' + D.early_size +
      '</div><div class="n">below the floor, ranked on their own record</div></div>' +
    '<div class="stat d"><div class="k">Live tokens</div><div class="v">' + D.live_size +
      '</div><div class="n">set aside at the market\'s own value</div></div>';

  // ---------------------------------------------------------------- filters
  var cats = {}, chains = {};
  D.rows.forEach(function (r) {
    cats[r.category || 'Unclassified'] = (cats[r.category || 'Unclassified'] || 0) + 1;
    (r.chains || []).forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
  });
  Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c + ' (' + cats[c] + ')';
    $('cat').appendChild(o);
  });
  Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a]; }).slice(0, 40).forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c + ' (' + chains[c] + ')';
    $('chain').appendChild(o);
  });

  // ---------------------------------------------------------------- table
  var COLS = [
    { k: 'rank', sk: 'rank', t: '#', cls: 'rk' },
    { k: 'name', sk: 'name', t: 'Protocol' },
    { k: 'category', sk: 'category', t: 'Sector' },
    { k: 'chains', sk: 'chains', t: 'Chains', cls: 'hide-s' },
    { k: 'tvl_usd', sk: 'tvl', t: 'TVL', right: true },
    { k: 'change_7d', sk: 'change', t: '7d', right: true },
    { k: 'age_days', sk: 'age', t: 'No token for', right: true },
    { k: 'implied_value_usd', sk: 'implied', t: 'Implied value', right: true }
  ];

  function visible() {
    var q = state.q.toLowerCase();
    var list = D.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.on_watchlist) return false;
      if (state.cat !== 'all' && (r.category || 'Unclassified') !== state.cat) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(q) >= 0;
    });
    var FIELD = {
      rank: 'rank', name: 'name', category: 'category', chains: 'chains',
      tvl: 'tvl_usd', change: 'change_7d', age: 'age_days', implied: 'implied_value_usd'
    };
    var key = FIELD[state.sort] || 'implied_value_usd';
    list.sort(function (a, b) {
      var x = a[key], y = b[key];
      if (key === 'name' || key === 'category') return String(x || '').localeCompare(String(y || '')) * state.dir;
      if (key === 'chains') return String((x || []).join()).localeCompare(String((y || []).join())) * state.dir;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x - y) * state.dir || a.rank - b.rank;
    });
    return list;
  }

  function drawHead() {
    $('head').innerHTML = COLS.map(function (c) {
      var on = state.sort === c.sk ? 'on ' + (c.cls || '') : (c.cls || '');
      var ar = state.sort === c.sk ? '<span class="ar">' + (state.dir === -1 ? '\u25bc' : '\u25b2') + '</span>' : '';
      return '<th class="' + on + '" data-k="' + c.k + '" data-sk="' + c.sk + '"' +
        (c.right ? ' style="text-align:right"' : '') + '>' + c.t + ar + '</th>';
    }).join('');
    Array.prototype.forEach.call($('head').children, function (th) {
      th.addEventListener('click', function () {
        var sk = th.getAttribute('data-sk');
        if (state.sort === sk) state.dir = -state.dir;
        else { state.sort = sk; state.dir = sk === 'name' || sk === 'category' || sk === 'chains' ? 1 : -1; }
        var sel = $('sort');
        for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === sk) sel.value = sk;
        drawHead(); drawRows();
      });
    });
  }

  function drawRows() {
    var list = visible();
    $('count').textContent = list.length + ' of ' + D.rows.length + ' rows';
    $('empty').hidden = list.length > 0;
    $('rows').innerHTML = list.slice(0, 400).map(function (r) {
      var w = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
      var tag = r.on_watchlist ? '<span class="tag wl">watchlist</span>' : '<span class="tag early">early</span>';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="rk">' + r.rank + '</td>' +
        '<td><div class="nm">' + esc(r.name) + '<span class="slug">' + esc(r.slug) + ' ' + tag + '</span></div></td>' +
        '<td><span class="tag">' + esc(r.category || 'Unclassified') + '</span></td>' +
        '<td class="ch hide-s">' + esc((r.chains || []).slice(0, 3).join(' · ')) + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="val">' + usd(r.implied_value_usd) + '<div class="bar"><i style="width:' + w + '%"></i></div></td>' +
        '</tr>';
    }).join('');
    Array.prototype.forEach.call($('rows').children, function (tr) {
      tr.addEventListener('click', function () { open(tr.getAttribute('data-slug')); });
    });
  }

  // ---------------------------------------------------------------- live set
  var liveWrap = document.createElement('section');
  liveWrap.innerHTML = '<div class="livehead"><h2>Set aside: tokens that already trade</h2>' +
    '<p>' + D.live_size + ' of the snapshot\'s protocols record a token, so the board never ranks them. Their market cap is the market\'s own number, not the model\'s.</p></div>' +
    '<table class="board"><thead><tr><th>Protocol</th><th>Sector</th><th style="text-align:right">TVL</th>' +
    '<th style="text-align:right">Market cap</th><th style="text-align:right">Cap / TVL</th></tr></thead><tbody>' +
    D.live.map(function (r) {
      var ratio = r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '\u00d7' : 'n/a';
      return '<tr><td><div class="nm">' + esc(r.name) + '<span class="slug">' + esc(r.slug) + '</span></div></td>' +
        '<td><span class="tag">' + esc(r.category || 'Unclassified') + '</span></td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td><td class="num">' + usd(r.mcap_usd) + '</td>' +
        '<td class="num flat">' + ratio + '</td></tr>';
    }).join('') + '</tbody></table>';
  $('board').insertBefore(liveWrap, $('board').querySelector('footer'));

  // ---------------------------------------------------------------- drawer
  function byslug(slug) {
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) return D.rows[i];
    return null;
  }

  function open(slug) {
    var r = byslug(slug);
    if (!r) return;
    state.sel = slug;
    var steps = [];
    // The board's farm_steps live in board.json; data.js carries the plan rebuilt from the same record.
    steps = plan(r);
    var base = r.tvl_usd * r.comps_multiple;
    $('drawer').innerHTML =
      '<div class="dh"><button class="close" aria-label="Close detail">&times;</button>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<div class="s">' + esc(r.slug) + ' &middot; rank ' + r.rank + ' of ' + D.board_size + '</div>' +
      '<div class="tags"><span class="tag ' + (r.on_watchlist ? 'wl' : 'early') + '">' +
        (r.on_watchlist ? 'on the watchlist' : 'early radar, below the floor') + '</span>' +
        '<span class="tag">' + esc(r.category || 'Unclassified') + '</span>' +
        '<span class="tag">' + esc((r.chains || []).slice(0, 5).join(' · ') || 'chain not recorded') +
          ((r.chains || []).length > 5 ? ' +' + (r.chains.length - 5) : '') + '</span></div></div>' +
      '<div class="db">' +
        '<div class="sec"><h3>Implied value, line by line</h3><div class="math">' +
          line('TVL in the snapshot', exact(r.tvl_usd)) +
          line('Comps multiple &middot; ' + esc(r.category || 'unclassified') + (r.comps_source === 'category' ? ' (' + r.comps_n + ' tokenized peers)' : ' (global, ' + r.comps_n + ' protocols)'), '\u00d7 ' + num(r.comps_multiple, 4)) +
          line('Base, TVL &times; multiple', exact(base)) +
          line('Seven-day growth &middot; ' + (r.change_7d === null ? 'unreported' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%'),
            '\u00d7 ' + num(r.growth_multiplier, 4)) +
          line('No token for ' + (r.age_days === null ? 'an unknown time' : r.age_days + ' days'), '\u00d7 ' + num(r.maturity_multiplier, 4)) +
          '<div class="tot"><span>Implied value</span><b>' + exact(r.implied_value_usd) + '</b></div>' +
        '</div><p class="meta">Multiply the two factors into the base and the product is the implied value; ' +
          'the same three factors score every row. Listed ' + esc(r.listed_at || 'at an unrecorded date') +
          ' &middot; the record shows no token, which is not proof it has none.</p></div>' +
        '<div class="sec"><h3>Farm it in six steps</h3><ul class="steps">' +
          steps.map(function (s) {
            var cut = s.indexOf(' Cost: ');
            var body = cut > 0 ? s.slice(0, cut) : s;
            var tail = cut > 0 ? s.slice(cut + 1) : '';
            return '<li>' + esc(body) + (tail ? '<div class="meta">' + esc(tail) + '</div>' : '') + '</li>';
          }).join('') +
        '</ul></div>' +
        '<div class="sec"><h3>Why it sits here</h3><p class="note">' +
          esc(r.name) + ' ranks ' + r.rank + ' because its ' + usd(r.tvl_usd) + ' of TVL carries a ' +
          num(r.comps_multiple, 4) + ' comps multiple' + (r.comps_source === 'category'
            ? ' — the median market-cap-to-TVL of ' + r.comps_n + ' tokenized ' + (r.category || 'peer') + ' protocols in this snapshot'
            : ' — the global median of ' + r.comps_n + ' tokenized protocols, its own category being too thin to price') +
          ', its seven-day growth scales the base by ' + num(r.growth_multiplier) +
          ' and its ' + (r.age_days === null ? 'unrecorded age' : r.age_days + ' days') + ' with no token scales it by ' +
          num(r.maturity_multiplier) + '. The same three factors score every protocol on the board; no name is special-cased.' +
        '</p></div>' +
      '</div>';
    $('drawer').classList.add('on');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('scrim').classList.add('on');
    $('drawer').querySelector('.close').addEventListener('click', close);
    drawRows();
  }
  function line(a, b) { return '<div class="l"><span>' + a + '</span><span>' + b + '</span></div>'; }

  function close() {
    state.sel = null;
    $('drawer').classList.remove('on');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('scrim').classList.remove('on');
    drawRows();
  }
  $('scrim').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // The farm plan, rebuilt from the protocol's own record: sector action, capital from TVL, hold from age.
  function plan(r) {
    var chain = (r.chains && r.chains[0]) || 'its main chain';
    var cap = r.tvl_usd >= 5e9 ? 250 : r.tvl_usd >= 1e9 ? 150 : r.tvl_usd >= 1e8 ? 100 : 50;
    var hold = r.age_days === null ? 30 : r.age_days < 180 ? 60 : r.age_days < 365 ? 45 : 30;
    var c = (r.category || '').toLowerCase();
    var action;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) action = 'Supply $' + cap + ' of USDC to ' + r.name + ' on ' + chain + ' and keep the position open.';
    else if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) action = 'Provide $' + cap + ' of liquidity to ' + r.name + "'s deepest pool on " + chain + ' and keep the LP position open.';
    else if (c.indexOf('bridge') >= 0) action = 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + r.name + ' and use the bridged funds in its app.';
    else if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) action = "Stake $" + cap + " of the chain's staking asset through " + r.name + ' and keep the receipt token.';
    else if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) action = 'Deposit $' + cap + ' of USDC as margin on ' + r.name + ' and open one small hedge.';
    else if (c.indexOf('prediction') >= 0) action = 'Fund $' + cap + ' and place one market position on ' + r.name + '.';
    else if (c.indexOf('rwa') >= 0) action = "Mint $" + cap + " of the protocol's yield asset on " + chain + ' and hold it.';
    else action = 'Deposit $' + cap + ' of USDC into ' + r.name + ' on ' + chain + ' and keep the position open.';
    return [
      'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
      action + ' Cost: $' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas. Time: 15 minutes to set up.',
      'Make one qualifying action each week on ' + r.name + ': a deposit, a borrow, a swap or a governance vote. Cost: about $2 of gas a week. Time: 10 minutes a week.',
      'Hold the position for at least ' + hold + ' days so the activity lands in more than one snapshot of the protocol\'s own usage. Cost: the $' + cap + ' stays in the position. Time: ' + hold + ' days.',
      "Watch " + r.name + "'s own announcements for a points program or an airdrop page, and claim only from a link the protocol publishes itself. Cost: no fee to check, and never pay to claim. Time: 10 minutes.",
      'Log the wallet, the entry date, the gas paid and every transaction, so the position can be repeated or unwound. Cost: nothing but the log. Time: 5 minutes.'
    ];
  }

  // ---------------------------------------------------------------- wiring
  $('q').addEventListener('input', function (e) { state.q = e.target.value; drawRows(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; drawRows(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; drawRows(); });
  $('sort').addEventListener('change', function (e) {
    state.sort = e.target.value; state.dir = e.target.value === 'name' ? 1 : -1; drawHead(); drawRows();
  });
  $('sc-all').addEventListener('click', function () { state.scope = 'all'; press(); });
  $('sc-wl').addEventListener('click', function () { state.scope = 'watchlist'; press(); });
  function press() {
    $('sc-all').setAttribute('aria-pressed', String(state.scope === 'all'));
    $('sc-wl').setAttribute('aria-pressed', String(state.scope === 'watchlist'));
    drawRows();
  }

  $('fmodel').textContent = 'Model ' + D.model_version + ': implied = TVL x comps multiple x growth x maturity';
  var topComps = Object.keys(D.comps.by_category).map(function (k) {
    return { k: k, c: D.comps.by_category[k] };
  }).sort(function (a, b) { return b.c.n - a.c.n || (a.k < b.k ? -1 : 1); }).slice(0, 8);
  $('fconst').innerHTML =
    '<li>comps multiple, fitted on this snapshot: global median ' + num(D.comps.global.median, 4) + ' from ' +
      D.comps.global.n + ' tokenized protocols; a category uses its own median once it has ' + D.comps.min_n +
      ' or more readings</li>' +
    '<li>largest category samples: ' + topComps.map(function (x) {
      return esc(x.k) + ' ' + num(x.c.median, 4) + ' (n=' + x.c.n + ')';
    }).join(', ') + '</li>' +
    '<li>growth: clamp(change_7d, ' + D.model.growth_floor + '%, ' + D.model.growth_cap + '%) x ' + D.model.growth_weight + ' + 1</li>' +
    '<li>maturity: ' + D.model.maturity_floor + ' + min(age_days, ' + D.model.maturity_days + ') / ' + D.model.maturity_days +
      ' x ' + D.model.maturity_range + ', ' + D.model.unknown_age_multiple + ' when the age is unknown</li>' +
    '<li>snapshot: ' + esc(D.source) + '</li>';

  // A screenshot can open straight into a state: #d=<slug>, #f=watchlist, #c=<sector>, #q=<text>, #s=<sort>
  (function fromHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    var p = {};
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    if (p.q) { state.q = p.q; $('q').value = p.q; }
    if (p.c) { state.cat = p.c; $('cat').value = p.c; }
    if (p.ch) { state.chain = p.ch; $('chain').value = p.ch; }
    if (p.s) { state.sort = p.s; $('sort').value = p.s; state.dir = p.s === 'name' ? 1 : -1; }
    if (p.f === 'watchlist') { state.scope = 'watchlist'; press(); }
    drawHead(); drawRows();
    if (p.d) open(p.d);
  })();

  drawHead();
  drawRows();
})();
