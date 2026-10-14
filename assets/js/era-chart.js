/* ERA CHART PLANNER — target-level calculator with owned, event income and
   whole-pack math. Data: assets/data/era-chart.json (synced from gamedata).
   Vanilla, no dependencies. State persists on this device only. */
(function () {
  'use strict';
  var STORE_KEY = 'swgoh-era-plan';
  var CURS = [
    { id: 'ERA_UPGRADE_CURRENCY', name: 'Era Currency', icon: 'assets/img/era/era-currency.png' },
    { id: 'era_upgrade_basic_1', name: 'MK I Grek', icon: 'assets/img/era/mat-a-1.png' },
    { id: 'era_upgrade_advanced_1', name: 'MK I Basic PC', icon: 'assets/img/era/mat-b-1.png' },
    { id: 'era_upgrade_basic_2', name: 'MK II Forn', icon: 'assets/img/era/mat-c-1.png' },
    { id: 'era_upgrade_special_1', name: 'Zerek', icon: 'assets/img/era/mat-special.png' },
    { id: 'era_upgrade_advanced_2', name: 'MK II Improved PC', icon: 'assets/img/era/mat-d-1.png' },
    { id: 'era_upgrade_basic_3', name: 'MK III Esk', icon: 'assets/img/era/mat-a-2.png' },
    { id: 'era_upgrade_advanced_3', name: 'MK III Advanced PC', icon: 'assets/img/era/mat-b-2.png' },
    { id: 'era_upgrade_basic_7', name: 'MK VII Aurek', icon: 'assets/img/era/mat-a-4.png' },
    { id: 'era_upgrade_advanced_7', name: 'MK VII Masterwork PC', icon: 'assets/img/era/mat-b-4.png' },
    { id: 'era_upgrade_basic_8', name: 'MK VIII Senth', icon: 'assets/img/era/mat-c-4.png' },
    { id: 'era_upgrade_advanced_8', name: 'MK VIII Legendary PC', icon: 'assets/img/era/mat-d-4.png' }
  ];
  function fmt(n) { return Number(n || 0).toLocaleString('en-GB'); }
  function num(v, d) { v = parseInt(v, 10); return isFinite(v) && v >= 0 ? v : (d || 0); }
  function load() {
    var s = { cur: 0, tgt: 75, units: 1, owned: {}, marqA: 0, marqB: 0, epFree: false, epPrem: false, packs: [] };
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) s = Object.assign(s, JSON.parse(raw));
    } catch (e) { /* private mode etc — run unpersisted */ }
    return s;
  }
  var state = load();
  var DATA = null;
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function costBetween(from, to, units) {
    // levels are 1-based; owning `from` means still to pay from+1..to
    var t = {};
    if (!DATA || to <= from) return t;
    for (var lv = from + 1; lv <= to && lv <= 75; lv++) {
      var row = DATA.levels[lv - 1];
      if (!row) continue;
      row.costs.forEach(function (c) { t[c.id] = (t[c.id] || 0) + c.q * units; });
    }
    return t;
  }
  function marqueeSum(nodeId, tiersCleared) {
    var t = {};
    if (!DATA || !tiersCleared) return t;
    DATA.marquee[nodeId].slice(0, tiersCleared).forEach(function (tier) {
      tier.rewards.forEach(function (r) {
        if (CURS.some(function (c) { return c.id === r.id; })) t[r.id] = (t[r.id] || 0) + r.q;
      });
    });
    return t;
  }
  function trackSum(which, on) {
    var t = {};
    if (!DATA || !on) return t;
    DATA.episode[which].forEach(function (r) {
      if (CURS.some(function (c) { return c.id === r.id; })) t[r.id] = (t[r.id] || 0) + r.q;
    });
    return t;
  }
  function packSums() {
    var t = {};
    state.packs.forEach(function (p) {
      if (!p || !p.cur || !(p.per > 0) || !(p.n > 0)) return;
      t[p.cur] = (t[p.cur] || 0) + p.per * p.n; // whole packs only: never fractional
    });
    return t;
  }
  function incomeSums() {
    var t = {};
    [marqueeSum('ADELPHIRANGER_L80', state.marqA), marqueeSum('B1MERCDROID_L80', state.marqB),
     trackSum('free', state.epFree), trackSum('premium', state.epPrem), packSums()].forEach(function (part) {
      Object.keys(part).forEach(function (k) { t[k] = (t[k] || 0) + part[k]; });
    });
    return t;
  }
  function curMeta(id) {
    for (var i = 0; i < CURS.length; i++) if (CURS[i].id === id) return CURS[i];
    return { id: id, name: id, icon: '' };
  }
  function iconImg(m, size) {
    if (!m.icon) return '';
    return '<img src="' + m.icon + '" alt="" loading="lazy" decoding="async" width="' + size + '" height="' + size + '">';
  }
  function render() {
    var root = document.getElementById('eraPlanner');
    if (!root || !DATA) return;
    var need = costBetween(state.cur, state.tgt, state.units);
    var income = incomeSums();
    var html = '';
    html += '<table class="era-table"><thead><tr><th scope="col">Currency</th><th scope="col">Need (Lv ' + state.cur + ' → ' + state.tgt + (state.units > 1 ? ' × 2 units' : '') + ')</th><th scope="col">Owned</th><th scope="col">Left to farm</th></tr></thead><tbody>';
    CURS.forEach(function (m) {
      var nd = need[m.id] || 0;
      var ow = num(state.owned[m.id], 0);
      var left = Math.max(0, nd - ow);
      html += '<tr><td><span class="cur-name">' + iconImg(m, 22) + esc(m.name) + '</span></td>' +
        '<td class="cell-num">' + fmt(nd) + '</td>' +
        '<td class="cell-num"><input class="plan-num" data-owned="' + m.id + '" type="number" min="0" step="1" value="' + ow + '" aria-label="Owned ' + esc(m.name) + '"></td>' +
        '<td class="cell-num"><b>' + fmt(left) + '</b></td></tr>';
    });
    html += '</tbody></table>';
    var iht = '<table class="era-table"><thead><tr><th scope="col">Currency</th><th scope="col">Events</th><th scope="col">Packs</th><th scope="col">Still needed</th></tr></thead><tbody>';
    var events = {};
    [marqueeSum('ADELPHIRANGER_L80', state.marqA), marqueeSum('B1MERCDROID_L80', state.marqB),
     trackSum('free', state.epFree), trackSum('premium', state.epPrem)].forEach(function (part) {
      Object.keys(part).forEach(function (k) { events[k] = (events[k] || 0) + part[k]; });
    });
    var packs = packSums();
    var anyLeft = false;
    CURS.forEach(function (m) {
      var nd = need[m.id] || 0;
      if (!nd) return;
      var ow = num(state.owned[m.id], 0);
      var still = Math.max(0, nd - ow - (events[m.id] || 0) - (packs[m.id] || 0));
      if (still > 0) anyLeft = true;
      iht += '<tr><td><span class="cur-name">' + iconImg(m, 22) + esc(m.name) + '</span></td>' +
        '<td class="cell-num">' + fmt(events[m.id] || 0) + '</td>' +
        '<td class="cell-num">' + fmt(packs[m.id] || 0) + '</td>' +
        '<td class="cell-num"><b>' + fmt(still) + '</b></td></tr>';
    });
    iht += '</tbody></table>';
    if (!anyLeft && Object.keys(need).length) iht = '<p class="era-notes"><b>Covered.</b> Owned + events + packs meet the target.</p>' + iht;
    document.getElementById('planNeed').innerHTML = html;
    document.getElementById('planIncome').innerHTML = iht;
    renderPacks();
  }
  function renderPacks() {
    var host = document.getElementById('packRows');
    if (!host) return;
    host.innerHTML = state.packs.map(function (p, i) {
      var opts = CURS.map(function (c) {
        return '<option value="' + c.id + '"' + (p.cur === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('');
      var rowTotal = (num(p.per) * num(p.n));
      return '<tr><td><input class="plan-pack-name" data-pack="' + i + '" data-field="name" value="' + esc(p.name || '') + '" maxlength="60" placeholder="Pack name" aria-label="Pack name"></td>' +
        '<td><select data-pack="' + i + '" data-field="cur" aria-label="Pack currency">' + opts + '</select></td>' +
        '<td class="cell-num"><input class="plan-num" data-pack="' + i + '" data-field="per" type="number" min="0" step="1" value="' + num(p.per) + '" aria-label="Per pack"></td>' +
        '<td class="cell-num"><input class="plan-num" data-pack="' + i + '" data-field="n" type="number" min="0" step="1" value="' + num(p.n) + '" aria-label="Packs (whole packs only)"></td>' +
        '<td class="cell-num"><b>' + fmt(rowTotal) + '</b></td>' +
        '<td class="cell-num"><button type="button" class="gear-btn" data-pack-del="' + i + '">Remove</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="small">No packs yet — add one below. Packs are whole units only: total = per-pack × packs.</td></tr>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function bind() {
    var root = document.getElementById('eraPlanner');
    if (!root) return;
    document.getElementById('planCur').value = state.cur;
    document.getElementById('planTgt').value = state.tgt;
    syncUnits();
    document.getElementById('planMarqA').value = state.marqA;
    document.getElementById('planMarqB').value = state.marqB;
    document.getElementById('planEpFree').checked = !!state.epFree;
    document.getElementById('planEpPrem').checked = !!state.epPrem;
    root.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.id === 'planCur') { state.cur = Math.max(0, Math.min(74, num(t.value, 0))); }
      else if (t.id === 'planTgt') { state.tgt = Math.max(1, Math.min(75, num(t.value, 75))); }
      else if (t.hasAttribute('data-owned')) { state.owned[t.getAttribute('data-owned')] = num(t.value, 0); }
      else if (t.hasAttribute('data-pack')) {
        var i = +t.getAttribute('data-pack'), f = t.getAttribute('data-field'), p = state.packs[i];
        if (!p) return;
        if (f === 'name') p.name = t.value.slice(0, 60);
        else if (f === 'cur') p.cur = t.value;
        else p[f] = num(t.value, 0);
      }
      save(); render();
    });
    root.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.id === 'planMarqA') state.marqA = Math.max(0, Math.min(7, num(t.value, 0)));
      else if (t.id === 'planMarqB') state.marqB = Math.max(0, Math.min(7, num(t.value, 0)));
      else if (t.id === 'planEpFree') state.epFree = t.checked;
      else if (t.id === 'planEpPrem') state.epPrem = t.checked;
      else return;
      save(); render();
    });
    root.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.hasAttribute('data-units')) { state.units = +t.getAttribute('data-units') === 2 ? 2 : 1; syncUnits(); save(); render(); }
      else if (t.id === 'packAdd') { state.packs.push({ name: '', cur: CURS[0].id, per: 0, n: 0 }); save(); render(); }
      else if (t.hasAttribute('data-pack-del')) { state.packs.splice(+t.getAttribute('data-pack-del'), 1); save(); render(); }
      else if (t.id === 'planReset') {
        state = { cur: 0, tgt: 75, units: 1, owned: {}, marqA: 0, marqB: 0, epFree: false, epPrem: false, packs: [] };
        save(); bind(); render();
      }
    });
  }
  function syncUnits() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-units]'), function (b) {
      var on = +b.getAttribute('data-units') === state.units;
      if (on) b.setAttribute('aria-pressed', 'true'); else b.removeAttribute('aria-pressed');
      b.classList.toggle('is-on', on);
    });
  }
  function init() {
    if (!document.getElementById('eraPlanner')) return;
    fetch('assets/data/era-chart.json', { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('data ' + res.status);
      return res.json();
    }).then(function (json) {
      DATA = json; bind(); render();
    }).catch(function () {
      var el = document.getElementById('planNeed');
      if (el) el.innerHTML = '<p class="era-notes">Planner data failed to load. The static tables above are unaffected.</p>';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
