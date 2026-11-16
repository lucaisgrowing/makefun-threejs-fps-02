// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, killfeed,
// buy menu, channel bar and the one overlay panel. It never touches the simulation;
// main.js pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADES } from './weapon.js';

const COPY = {
  start: {
    title: 'Sable Line',
    copy: 'A dusk foundry, two bomb sites, five Wardens holding them. Plant the spike or wipe them out — then buy better guns and do it again.',
    action: 'Click to play',
  },
  paused: {
    title: 'Sable Line',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team fights on. Click to spectate the round out.',
    action: 'Keep watching',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

const BUY_ITEMS = [
  { key: '1', id: 'rifle', label: 'VK-7 Repeater — rifle' },
  { key: '2', id: 'smg', label: 'Kestrel-9 — SMG' },
  { key: '3', id: 'he', label: 'Boomer HE grenade' },
  { key: '4', id: 'flash', label: 'Dazzler flash grenade' },
  { key: '5', id: 'armour', label: 'Vest — armour 50' },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const armourNum = $('armour-num');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreA = $('score-attack');
  const scoreD = $('score-defend');
  const roundNum = $('round-num');
  const pipsA = $('pips-attack');
  const pipsD = $('pips-defend');
  const bombStatus = $('bomb-status');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const channel = $('channel');
  const channelLabel = $('channel-label');
  const channelFill = $('channel-fill');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const buyRound = $('buy-round');
  const vignette = $('vignette');
  const flashWhite = $('flash-white');
  const hint = $('hint');

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function pips(el, alive, total, cls) {
    const key = `${el.id}-${alive}`;
    if (last[key]) return;
    last[key] = true;
    el.innerHTML = '';
    for (let i = 0; i < total; i += 1) {
      const dot = document.createElement('i');
      if (i < alive) dot.className = cls;
      el.appendChild(dot);
    }
  }

  const api = {
    setHealth(hp, armour) {
      setText(healthNum, 'hp', String(hp));
      healthNum.classList.toggle('low', hp <= 30);
      healthFill.style.width = `${hp}%`;
      healthFill.classList.toggle('low', hp <= 30);
      setText(armourNum, 'armour', armour > 0 ? `ARMOUR ${armour}` : '');
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(moneyEl, 'money', `$${value}`);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      if (phase === 'buy') {
        setText(timerEl, 'timer', `BUY ${s}s`);
      } else {
        setText(timerEl, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      }
      timerEl.classList.toggle('low', phase === 'live' && s <= 15);
    },
    setScore(a, d, round, aliveA, aliveD) {
      setText(scoreA, 'sa', String(a));
      setText(scoreD, 'sd', String(d));
      setText(roundNum, 'round', `ROUND ${round}`);
      pips(pipsA, aliveA, 3, 'on-sable');
      pips(pipsD, aliveD, 5, 'on-warden');
    },
    setBombStatus(text) {
      setText(bombStatus, 'bomb', text);
    },
    setHint(text) {
      setText(hint, 'hint', text);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    crosshair(spread) {
      // Spread in radians -> pixels of crosshair gap.
      const gap = Math.round(3 + Math.min(26, spread * 900));
      crosshair.style.setProperty('--gap', `${gap}px`);
      const lines = crosshair.querySelectorAll('i');
      lines[0].style.top = '0px';
      lines[0].style.height = '7px';
      crosshair.style.width = `${26 + gap * 2}px`;
      crosshair.style.height = `${26 + gap * 2}px`;
    },
    killfeed(html) {
      const line = document.createElement('div');
      line.innerHTML = html;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    banner(titleText, sub, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = sub;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), ms);
    },
    channel(label, frac) {
      if (frac === null || frac === undefined) {
        channel.style.display = 'none';
        return;
      }
      channel.style.display = 'block';
      channelLabel.textContent = label;
      channelFill.style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
    },
    damageFlash() {
      vignette.style.transition = 'none';
      vignette.style.opacity = '1';
      requestAnimationFrame(() => {
        vignette.style.transition = 'opacity 600ms linear';
        vignette.style.opacity = '0';
      });
    },
    flashWhite() {
      flashWhite.style.transition = 'none';
      flashWhite.style.opacity = '0.95';
      requestAnimationFrame(() => {
        flashWhite.style.transition = 'opacity 1200ms linear';
        flashWhite.style.opacity = '0';
      });
    },
    showBuy(round, money, owned, grenades, hasArmour) {
      buyMenu.style.display = 'block';
      setText(buyRound, 'bround', String(round));
      setText(buyMoney, 'bmoney', `$${money}`);
      buyItems.innerHTML = '';
      for (const item of BUY_ITEMS) {
        const row = document.createElement('div');
        row.className = 'item';
        let price;
        let ownedText = '';
        if (item.id === 'armour') {
          price = '$650';
          ownedText = hasArmour ? 'OWNED' : '';
        } else if (WEAPONS[item.id]) {
          price = `$${WEAPONS[item.id].price}`;
          ownedText = owned[item.id] ? 'OWNED' : '';
        } else {
          price = `$${GRENADES[item.id].price}`;
          ownedText = grenades[item.id] > 0 ? `x${grenades[item.id]}` : '';
        }
        row.innerHTML = `<span><kbd>${item.key}</kbd>${item.label}</span><span><span class="owned">${ownedText}</span> <span class="price">${price}</span></span>`;
        row.addEventListener('click', () => buyHandler?.(item.id));
        buyItems.appendChild(row);
      }
    },
    hideBuy() {
      buyMenu.style.display = 'none';
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'match' ? extra ?? '' : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
  return api;
}
