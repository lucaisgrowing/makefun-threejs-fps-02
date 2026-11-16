// The round: buy phase, live round, end banner, next round. Money, score, the spike
// and the bomb timer live here; the bots and the player ask it what phase it is.
import { WEAPONS, GRENADES } from './weapon.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 40;
export const WIN_ROUNDS = 5;
const WIN_MONEY = 3250;
const LOSS_MONEY = 1900;
const KILL_MONEY = 300;
const PLANT_MONEY = 300;

export function createRounds(world) {
  const state = {
    phase: 'buy', // buy | live | end | match
    phaseLeft: BUY_SECONDS,
    round: 1,
    scoreAttack: 0,
    scoreDefend: 0,
    money: 800,
    lossStreak: 0,
    kills: 0,
    deaths: 0,
    bomb: { state: 'carried', site: null, pos: null, left: BOMB_SECONDS },
    spike: { carrier: 'player', dropped: false, pos: null },
    banner: null,
    matchWinner: null,
  };

  function startBuy() {
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.bomb = { state: 'carried', site: null, pos: null, left: BOMB_SECONDS };
    state.spike = { carrier: 'player', dropped: false, pos: null };
    state.banner = null;
  }

  function startLive() {
    state.phase = 'live';
    state.phaseLeft = ROUND_SECONDS;
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return;
    state.phase = 'end';
    state.phaseLeft = 4;
    const won = winner === 'attack';
    if (won) {
      state.scoreAttack += 1;
      state.money += WIN_MONEY;
      state.lossStreak = 0;
    } else {
      state.scoreDefend += 1;
      state.money += LOSS_MONEY + Math.min(2, state.lossStreak) * 500;
      state.lossStreak += 1;
    }
    state.banner = { winner, reason };
    if (state.scoreAttack >= WIN_ROUNDS || state.scoreDefend >= WIN_ROUNDS) {
      state.matchWinner = won ? 'attack' : 'defend';
    }
  }

  function nextRound() {
    state.round += 1;
    startBuy();
  }

  function step(dt, alive) {
    if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'end') {
      state.phaseLeft -= dt;
    }
    if (state.phase === 'buy' && state.phaseLeft <= 0) startLive();
    if (state.phase === 'live') {
      if (state.bomb.state === 'planted') {
        state.bomb.left -= dt;
        if (state.bomb.left <= 0) endRound('attack', 'Spike detonated');
      } else if (state.phaseLeft <= 0) {
        endRound('defend', 'Time expired — spike never planted');
      }
      if (alive.attack === 0 && alive.defend > 0) endRound('defend', 'Sable team wiped out');
      if (alive.defend === 0 && alive.attack > 0) endRound('attack', 'Wardens wiped out');
      if (alive.attack === 0 && alive.defend === 0) endRound('defend', 'Both teams down');
    }
    if (state.phase === 'end' && state.phaseLeft <= 0) {
      if (state.matchWinner) state.phase = 'match';
      else nextRound();
    }
  }

  return {
    state,
    startBuy,
    startLive,
    endRound,
    nextRound,
    step,
    onKill(killerTeam) {
      state.kills += 1;
      if (killerTeam === 'attack') state.money += KILL_MONEY;
    },
    onDeath() {
      state.deaths += 1;
    },
    // The player plants by holding E inside a site; called every live step.
    tryPlant(player, inSite, holding, dt, onPlanted) {
      if (state.phase !== 'live' || state.bomb.state !== 'carried') return 0;
      if (state.spike.carrier !== 'player' || !inSite || !holding || !player.state.alive) return 0;
      state.bomb.plant = (state.bomb.plant ?? 0) + dt;
      if (state.bomb.plant >= 3.5) {
        state.bomb = { state: 'planted', site: inSite, pos: player.body.pos.clone(), left: BOMB_SECONDS, plant: 0 };
        state.money += PLANT_MONEY;
        onPlanted(inSite);
      }
      return (state.bomb.plant ?? 0) / 3.5;
    },
    tryDefuse(player, holding, dt, onDefused) {
      if (state.phase !== 'live' || state.bomb.state !== 'planted') return 0;
      const d = Math.hypot(player.body.pos.x - state.bomb.pos.x, player.body.pos.z - state.bomb.pos.z);
      if (d > 1.6 || !holding || !player.state.alive) {
        state.bomb.defuse = 0;
        return 0;
      }
      state.bomb.defuse = (state.bomb.defuse ?? 0) + dt;
      if (state.bomb.defuse >= 5) {
        state.bomb.state = 'defused';
        onDefused();
      }
      return (state.bomb.defuse ?? 0) / 5;
    },
    dropSpike(pos) {
      state.spike = { carrier: null, dropped: true, pos: pos.clone() };
    },
    siteAt(pos) {
      for (const [name, site] of Object.entries(world.sites)) {
        if (Math.hypot(pos.x - site.center.x, pos.z - site.center.z) < site.radius) return name;
      }
      return null;
    },
    canBuy(id) {
      const item = WEAPONS[id] ?? GRENADES[id];
      if (!item) return false;
      if (WEAPONS[id] && id === 'pistol') return false;
      return state.money >= item.price;
    },
    buy(id) {
      const item = WEAPONS[id] ?? GRENADES[id];
      if (!item || state.money < item.price) return false;
      state.money -= item.price;
      return true;
    },
    buyArmour() {
      if (state.money < 650) return false;
      state.money -= 650;
      return true;
    },
  };
}
