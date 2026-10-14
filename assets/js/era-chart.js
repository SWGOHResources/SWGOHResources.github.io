/* Era material checklist: upgrade costs, full episode tracks and independent
   marquee first-clear/daily rewards, and independent boss milestones.
   Tier 7 at 100% and all of tier 8 count Era Currency only. */
(function () {
  'use strict';
  var STORE_KEY = 'swgoh-era-checklist-v2';
  var CURS = [
    { id: 'ERA_UPGRADE_CURRENCY', name: 'Era Upgrade Currency', icon: 'assets/img/era/era-currency.png' },
    { id: 'era_upgrade_special_1', name: 'Zerek', icon: 'assets/img/era/mat-special.png' },
    { id: 'era_upgrade_basic_1', name: 'MK I Grek', icon: 'assets/img/era/mat-a-1.png' },
    { id: 'era_upgrade_advanced_1', name: 'MK I Basic Cores', icon: 'assets/img/era/mat-b-1.png' },
    { id: 'era_upgrade_basic_2', name: 'MK II Forn', icon: 'assets/img/era/mat-c-1.png' },
    { id: 'era_upgrade_advanced_2', name: 'MK II Improved Cores', icon: 'assets/img/era/mat-d-1.png' },
    { id: 'era_upgrade_basic_3', name: 'MK III Esk', icon: 'assets/img/era/mat-a-2.png' },
    { id: 'era_upgrade_advanced_3', name: 'MK III Advanced Cores', icon: 'assets/img/era/mat-b-2.png' },
    { id: 'era_upgrade_basic_7', name: 'MK VII Aurek', icon: 'assets/img/era/mat-a-4.png' },
    { id: 'era_upgrade_advanced_7', name: 'MK VII Masterwork Cores', icon: 'assets/img/era/mat-b-4.png' },
    { id: 'era_upgrade_basic_8', name: 'MK VIII Senth', icon: 'assets/img/era/mat-c-4.png' },
    { id: 'era_upgrade_advanced_8', name: 'MK VIII Legendary Cores', icon: 'assets/img/era/mat-d-4.png' }
  ];
  var DATA, COLISEUM, canSave = true;
  function num(v) { var n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function clamp(v, max) { return Math.min(max, num(v)); }
  function defaults() { return { tgt: 75, units: 1, epFree: false, epPrem: false, marqA: 0, marqueeDaily: {}, bosses: {} }; }
  function load() {
    var s = defaults();
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem('swgoh-era-plan'));
      if (!raw || typeof raw !== 'object') return s;
      s.tgt = raw.tgt == null ? 75 : clamp(raw.tgt, 75); s.units = raw.units === 2 ? 2 : 1;
      s.epFree = raw.epFree === true; s.epPrem = raw.epPrem === true;
      s.marqA = clamp(raw.marqA, 7);
      var daily = raw.marqueeDaily && typeof raw.marqueeDaily === 'object' ? raw.marqueeDaily : {};
      [3,4,5,6,7].forEach(function (tier) {
        s.marqueeDaily[tier] = daily[tier] == null ? 1 : clamp(daily[tier], 7);
      });
      var bosses = raw.bosses && typeof raw.bosses === 'object' ? raw.bosses : {};
      ['KRAYTDRAGON','ZEFFOTOMBGUARDIAN','JOTAZ','DRYAX'].forEach(function (id) {
        var b = bosses[id] || {};
        s.bosses[id] = { tier: Math.max(1, clamp(b.tier, 8)), percent: clamp(b.percent, 100) };
      });
    } catch (e) { canSave = false; }
    return s;
  }
  var state = load();
  function text(id, value) { var el = document.getElementById(id); if (el) el.textContent = value; }
  function savedNote() { text('planSaveStatus', canSave ? 'Saved on this device' : 'Storage unavailable · this visit only'); }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
    savedNote();
  }
  function fmt(n) { return Number(n || 0).toLocaleString('en-GB'); }
  function known(id) { return CURS.some(function (m) { return m.id === id; }); }
  function add(sums, rewards) {
    rewards.forEach(function (r) { if (known(r.id)) sums[r.id] = (sums[r.id] || 0) + r.q; });
  }
  function costs() {
    var sums = {};
    DATA.levels.forEach(function (row) {
      if (row.lvl <= state.tgt && row.lvl <= 75) row.costs.forEach(function (r) {
        sums[r.id] = (sums[r.id] || 0) + r.q * state.units;
      });
    });
    return sums;
  }
  function episodeRewards() {
    var sums = {};
    if (state.epFree) add(sums, DATA.episode.free);
    if (state.epPrem) add(sums, DATA.episode.premium);
    return sums;
  }
  function marqueeRewards() {
    var sums = {};
    DATA.marquee.ADELPHIRANGER_L80.slice(0, state.marqA).forEach(function (tier, index) {
      add(sums, tier.rewards);
      var days = state.marqueeDaily[index + 1] || 0;
      add(sums, (tier.dailyRewards || []).map(function (r) { return {id:r.id,q:r.q * days}; }));
    });
    return sums;
  }
  function bossRewards(boss) {
    var sums = {};
    COLISEUM.tiers.forEach(function (tier) {
      if (tier.tier > boss.tier) return;
      var reached = boss.percent;
      tier.bands.forEach(function (band) {
        if (tier.tier < boss.tier || band.at <= reached) add(sums, band.rewards);
      });
    });
    return sums;
  }
  function shipmentRewards(boss) {
    var total = 0;
    COLISEUM.tiers.forEach(function (tier) {
      if (tier.tier > boss.tier) return;
      tier.bands.forEach(function (band) {
        if (tier.tier < boss.tier || band.at <= boss.percent) total += band.shipmentCurrency || 0;
      });
    });
    return total;
  }
  function coliseumRewards() {
    var sums = {};
    COLISEUM.bosses.forEach(function (b) {
      var part = bossRewards(state.bosses[b.id]);
      Object.keys(part).forEach(function (id) { sums[id] = (sums[id] || 0) + part[id]; });
      document.querySelector('[data-boss-shipment="' + b.id + '"]').textContent = fmt(shipmentRewards(state.bosses[b.id]));
    });
    return sums;
  }
  function buildChecklist() {
    document.getElementById('planNeed').innerHTML = '<table class="era-table plan-checklist"><caption class="sr-only">Material costs to the target era level, episode, marquee and Coliseum rewards, and remaining materials</caption><thead><tr><th scope="col">Material</th><th scope="col">Required</th><th scope="col">Episode track</th><th scope="col">Marquees</th><th scope="col">Coliseum</th><th scope="col">Remaining</th></tr></thead><tbody>' + CURS.map(function (m) {
      return '<tr data-material="' + m.id + '"><th scope="row"><span class="cur-name"><img src="' + m.icon + '" alt="" width="28" height="28" loading="lazy" decoding="async">' + m.name + '</span></th>' +
        ['Required','Episode track','Marquees','Coliseum','Remaining'].map(function (label, i) {
          return '<td data-label="' + label + '" data-amount="' + ['need','episode','marquee','coliseum','remaining'][i] + '" class="cell-num"></td>';
        }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }
  function buildBossControls() {
    document.getElementById('bossControls').innerHTML = COLISEUM.bosses.map(function (b) {
      if (!state.bosses[b.id]) state.bosses[b.id] = { tier:1, percent:0 };
      return '<div class="boss-control"><div class="boss-name"><img src="' + b.icon + '" alt="" width="36" height="36"><span>' + b.name + '</span></div><div class="boss-fields">' +
        '<label>Tier<select class="tz-select" data-boss="' + b.id + '" data-field="tier" aria-label="' + b.name + ' tier">' + COLISEUM.tiers.map(function (tier) { return '<option value="' + tier.tier + '">' + tier.tier + '</option>'; }).join('') + '</select></label>' +
        '<label><span data-boss-label="' + b.id + '">Reached %</span><input class="plan-num tz-select" type="number" min="0" max="100" step="1" data-boss="' + b.id + '" data-field="progress" aria-label="' + b.name + ' percentage"></label></div>' +
        '<div class="boss-shipment"><img src="assets/img/atlases/standard_rgba_atlas/icon_currency_coliseum.png" alt="" width="22" height="22"><span>Era Currency</span><b data-boss-shipment="' + b.id + '">0</b></div></div>';
    }).join('');
  }
  function syncMarquee() {
    document.getElementById('planMarqA').value = state.marqA;
    var tiers = DATA.marquee.ADELPHIRANGER_L80.slice(0, state.marqA).filter(function (tier) {
      return (tier.dailyRewards || []).some(function (r) { return known(r.id); });
    });
    document.getElementById('marqueeCustomOpen').disabled = tiers.length === 0;
    document.getElementById('marqueeDaily').innerHTML = tiers.map(function (tier) {
      var n = +tier.tier.replace('TIER','');
      if (state.marqueeDaily[n] == null) state.marqueeDaily[n] = 1;
      return '<label>Tier ' + n + '<input class="tz-select plan-num" type="number" min="0" max="7" step="1" data-marquee-daily="' + n + '" value="' + state.marqueeDaily[n] + '" aria-label="Adelphi Ranger tier ' + n + ' daily reward claims" title="Daily claims, including the first day; maximum 7"></label>';
    }).join('');
    syncMarqueeDays();
  }
  function syncMarqueeDays() {
    var active = [3,4,5,6,7].filter(function (tier) { return tier <= state.marqA; });
    if (!active.length) active = [3,4,5,6,7];
    var days = active.map(function (tier) { return state.marqueeDaily[tier] == null ? 1 : state.marqueeDaily[tier]; });
    document.getElementById('planMarqDays').value = days.every(function (n) { return n === days[0]; }) ? String(days[0]) : 'custom';
  }
  function syncEpisode() {
    [['planEpFree', state.epFree], ['planEpPrem', state.epPrem]].forEach(function (entry) {
      var button = document.getElementById(entry[0]);
      button.setAttribute('aria-pressed', String(entry[1])); button.classList.toggle('on', entry[1]);
    });
  }
  function syncGear() {
    var level = [55,65,66,68,70,71,72,73,74,75].filter(function (n) { return n <= state.tgt; }).pop();
    document.getElementById('planGear').value = level == null ? 'below' : String(level);
  }
  function syncBoss(id) {
    var b = state.bosses[id], meta = COLISEUM.bosses.find(function (x) { return x.id === id; });
    document.querySelector('[data-boss="' + id + '"][data-field="tier"]').value = b.tier;
    var input = document.querySelector('[data-boss="' + id + '"][data-field="progress"]');
    input.value = b.percent; input.max = 100;
    input.setAttribute('aria-label', meta.name + ' percentage');
  }
  function syncControls() {
    document.getElementById('planTgt').value = state.tgt;
    syncGear();
    syncEpisode();
    syncMarquee();
    document.querySelectorAll('[data-units]').forEach(function (b) {
      var on = +b.getAttribute('data-units') === state.units;
      b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on);
    });
    COLISEUM.bosses.forEach(function (b) { syncBoss(b.id); }); savedNote();
  }
  function update() {
    var need = costs(), episode = episodeRewards(), marquee = marqueeRewards(), coliseum = coliseumRewards();
    CURS.forEach(function (m) {
      var nd = need[m.id] || 0, ep = episode[m.id] || 0, mq = marquee[m.id] || 0, cq = coliseum[m.id] || 0;
      var row = document.querySelector('[data-material="' + m.id + '"]');
      var values = { need:nd, episode:ep, marquee:mq, coliseum:cq, remaining:Math.max(0, nd - ep - mq - cq) };
      Object.keys(values).forEach(function (key) { row.querySelector('[data-amount="' + key + '"]').textContent = fmt(values[key]); });
      row.classList.toggle('is-covered', nd > 0 && values.remaining === 0);
    });
  }
  function edit(ev) {
    var t = ev.target;
    if (t.type === 'number' && t.value === '') { if (ev.type === 'change') t.value = '0'; else return; }
    if (t.id === 'planTgt') { state.tgt = clamp(t.value, 75); syncGear(); }
    else if (t.id === 'planGear') { state.tgt = clamp(t.value, 75); document.getElementById('planTgt').value = state.tgt; }
    else if (t.id === 'planMarqA') { state.marqA = clamp(t.value, 7); syncMarquee(); }
    else if (t.id === 'planMarqDays') {
      if (t.value === 'custom') return;
      [3,4,5,6,7].forEach(function (tier) { state.marqueeDaily[tier] = clamp(t.value, 7); }); syncMarquee();
    }
    else if (t.hasAttribute('data-marquee-daily')) { state.marqueeDaily[t.getAttribute('data-marquee-daily')] = clamp(t.value, 7); syncMarqueeDays(); }
    else if (t.hasAttribute('data-boss')) {
      var id = t.getAttribute('data-boss'), b = state.bosses[id];
      if (t.getAttribute('data-field') === 'tier') { b.tier = Math.max(1, clamp(t.value, 8)); syncBoss(id); }
      else b.percent = clamp(t.value, 100);
    } else return;
    if (ev.type === 'change' && t.type === 'number') t.value = t.id === 'planTgt' ? state.tgt : t.hasAttribute('data-marquee-daily') ? state.marqueeDaily[t.getAttribute('data-marquee-daily')] : b.percent;
    save(); update();
  }
  function bind() {
    var root = document.getElementById('eraPlanner');
    root.addEventListener('input', edit); root.addEventListener('change', edit);
    root.addEventListener('click', function (ev) {
      var button = ev.target.closest('button'); if (!button) return;
      if (button.id === 'marqueeCustomOpen') { document.getElementById('marqueeCustomize').showModal(); return; }
      if (button.id === 'marqueeCustomFinish') { document.getElementById('marqueeCustomize').close(); return; }
      if (button.hasAttribute('data-units')) state.units = +button.getAttribute('data-units') === 2 ? 2 : 1;
      else if (button.id === 'planEpFree' || button.id === 'planEpPrem') {
        if (button.id === 'planEpFree') state.epFree = !state.epFree; else state.epPrem = !state.epPrem;
        syncEpisode(); save(); update(); return;
      }
      else if (button.id === 'planReset') { state = defaults(); COLISEUM.bosses.forEach(function (b) { state.bosses[b.id] = {tier:1,percent:0}; }); }
      else return;
      syncControls(); save(); update();
    });
    document.getElementById('marqueeCustomize').addEventListener('close', function () { document.getElementById('marqueeCustomOpen').focus(); });
  }
  function init() {
    if (!document.getElementById('eraPlanner')) return;
    var controls = document.querySelectorAll('#eraPlanner input:not([disabled]), #eraPlanner button:not([disabled]), #eraPlanner select:not([disabled])');
    controls.forEach(function (el) { el.disabled = true; });
    Promise.all(['era-chart','era-coliseum'].map(function (name) {
      return fetch('assets/data/' + name + '.json', {cache:'no-store'}).then(function (res) { if (!res.ok) throw Error('data'); return res.json(); });
    })).then(function (files) {
      DATA = files[0]; COLISEUM = files[1]; buildBossControls();
      controls.forEach(function (el) { el.disabled = false; });
      syncControls(); buildChecklist(); update(); bind();
    }).catch(function () {
      document.getElementById('planNeed').innerHTML = '<p class="era-notes" role="alert">Planner data could not load. Reload to try again.</p>';
      text('planSaveStatus', 'Planner unavailable');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
