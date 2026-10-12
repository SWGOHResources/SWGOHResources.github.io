import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as model from '../assets/js/squad-model.js';
const html = await readFile(new URL('../squads.html', import.meta.url), 'utf8');
const source = (await readFile(new URL('../assets/js/squads.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '');
const data = JSON.parse(await readFile(new URL('../assets/data/squad-planner.json', import.meta.url), 'utf8'));
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
async function fixture(url = 'https://example.test/squads/', saved) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' }), w = dom.window;
  Object.assign(w, model, { downloadPlanPng: async () => {}, TextEncoder, TextDecoder });
  w.fetch = async () => ({ ok:true, json:async () => data });
  w.navigator.clipboard = { writeText: async s => { w.sharedUrl = s; } };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  if (saved) w.localStorage.setItem(model.STORAGE_KEY, JSON.stringify(saved));
  w.eval(source); await settle();
  return { dom, w, doc:w.document, click:selector => w.document.querySelector(selector).click(),
    change:(selector, value) => { const el=w.document.querySelector(selector); el.value=value; el.dispatchEvent(new w.Event('change',{bubbles:true})); } };
}
test('faction roster shows every matching unit, marks assignments and switches leadership on swap', async () => {
  const f = await fixture();
  try {
    f.change('#factionFilter','species_droid');
    assert.equal(f.doc.querySelectorAll('[data-unit]').length, data.characters.filter(u=>u.factions.includes('species_droid')).length);
    f.change('#factionFilter',''); f.click('[data-unit="DOCTORAPHRA"]'); f.click('[data-unit="BT1"]');
    assert.match(f.doc.querySelector('.sp-leader-panel').textContent,/Suspended Doctorate/);
    assert.ok(f.doc.querySelector('[data-unit="DOCTORAPHRA"]').classList.contains('assigned'));
    f.click('[data-slot="0:0"]'); f.click('[data-unit="BT1"]');
    assert.match(f.doc.querySelector('.sp-leader-panel').textContent,/no leader ability/);
    const saved = JSON.parse(f.w.localStorage.getItem(model.STORAGE_KEY));
    assert.deepEqual(saved.banks[5][0].slots.slice(0,2),['BT1','DOCTORAPHRA']);
    f.doc.querySelector('#hideAssigned').click(); assert.equal(f.doc.querySelector('[data-unit="BT1"]'),null);
  } finally { f.dom.window.close(); }
});
test('upgrade changes persist and leader Omicrons stop matching in Territory Wars', async () => {
  const f = await fixture();
  try {
    f.click('[data-unit="DOCTORAPHRA"]'); f.click('[data-detail="DOCTORAPHRA"]');
    f.click('[data-omicron="leaderskill_DOCTORAPHRA"]');
    assert.match(f.doc.querySelector('.sp-leader-panel').textContent,/Omicron mode applies/);
    f.change('#detailRelic','8');
    assert.match(f.doc.querySelector('[data-slot-container="0:0"]').textContent,/R8/);
    f.click('[data-close]'); f.change('#battleMode','tw');
    assert.match(f.doc.querySelector('.sp-leader-panel').textContent,/Max non-Omicron tier/);
    assert.match(f.doc.querySelector('.sp-omicron-strip').textContent,/inactive/);
    f.click('[data-size="3"]'); assert.equal(f.doc.querySelectorAll('#squadBoard .sp-slot').length,3);
    f.click('[data-size="5"]'); assert.match(f.doc.querySelector('.sp-leader-panel').textContent,/Suspended Doctorate/);
  } finally { f.dom.window.close(); }
});
test('editing a shared plan removes its stale hash and reload retains the edited local copy', async () => {
  const p=model.newPlan(); p.title='Shared original';
  const f = await fixture('https://example.test/squads/?view=board#plan='+model.encodePlan(p));
  try {
    assert.equal(f.doc.querySelector('#planTitle').value,'Shared original');
    f.change('#planTitle','My edited copy'); assert.equal(f.w.location.hash,''); assert.equal(f.w.location.search,'?view=board');
    const saved=JSON.parse(f.w.localStorage.getItem(model.STORAGE_KEY)); assert.equal(saved.title,'My edited copy');
    const reopened=await fixture('https://example.test/squads/',saved);
    try { assert.equal(reopened.doc.querySelector('#planTitle').value,'My edited copy'); } finally { reopened.dom.window.close(); }
    f.click('#sharePlan'); await settle(); assert.match(f.w.sharedUrl,/\/squads\/#plan=/);
  } finally { f.dom.window.close(); }
});
test('screenshot view hides controls and treats plan names as text, including markup-like names', async () => {
  const f=await fixture();
  try {
    f.change('#planTitle','<img src=x onerror=alert(1)>'); f.click('#screenshotToggle');
    assert.ok(f.doc.body.classList.contains('sp-screenshot')); assert.equal(f.doc.querySelector('#screenshotBoard').hidden,false);
    assert.equal(f.doc.querySelector('#screenshotBoard h2').textContent,'<img src=x onerror=alert(1)>');
    assert.equal(f.doc.querySelector('#screenshotBoard img'),null);
    f.click('#screenshotToggle'); assert.equal(f.doc.querySelector('#screenshotBoard').hidden,true);
  } finally { f.dom.window.close(); }
});
test('invalid share links retain an existing saved plan', async () => {
  const p=model.newPlan(); p.title='Keep me';
  const f=await fixture('https://example.test/squads/#plan=broken',p);
  try { assert.equal(f.doc.querySelector('#planTitle').value,'Keep me'); assert.match(f.doc.querySelector('#status').textContent,/invalid.*kept/); }
  finally { f.dom.window.close(); }
});
test('opening a different share hash on the existing page loads it without overwriting storage', async () => {
  const p=model.newPlan(); p.title='Local plan'; const incoming=model.newPlan(); incoming.title='A different shared plan';
  const f=await fixture('https://example.test/squads/',p);
  try {
    f.w.location.hash='plan='+model.encodePlan(incoming); await settle();
    assert.equal(f.doc.querySelector('#planTitle').value,incoming.title);
    assert.equal(JSON.parse(f.w.localStorage.getItem(model.STORAGE_KEY)).title,'Local plan');
  } finally { f.dom.window.close(); }
});
