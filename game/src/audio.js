// Sound, synthesized — no audio assets. Every effect is an oscillator or a burst
// of filtered noise through WebAudio, created on first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(dur, filterFreq, gain, type = 'lowpass', when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = null, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    shot(far = false) {
      if (far) noise(0.12, 900, 0.12, 'lowpass');
      else {
        noise(0.09, 3200, 0.5, 'bandpass');
        tone(160, 0.07, 0.25, 'square', 60);
      }
    },
    dry() {
      tone(1400, 0.03, 0.12, 'square');
    },
    reload() {
      tone(900, 0.03, 0.1, 'square', null, 0);
      tone(700, 0.03, 0.1, 'square', null, 0.35);
      tone(1100, 0.03, 0.12, 'square', null, 0.8);
    },
    hit(kill = false) {
      tone(kill ? 1900 : 1500, 0.05, 0.18, 'sine');
      if (kill) tone(2400, 0.08, 0.15, 'sine', null, 0.05);
    },
    hurt() {
      tone(220, 0.12, 0.2, 'sawtooth', 110);
    },
    explosion() {
      noise(0.9, 400, 0.9, 'lowpass');
      tone(90, 0.7, 0.5, 'sine', 30);
    },
    plantBeep() {
      tone(1200, 0.07, 0.15, 'square');
    },
    defuseBeep() {
      tone(900, 0.07, 0.15, 'square');
    },
    buy() {
      tone(880, 0.06, 0.15, 'sine');
      tone(1320, 0.08, 0.15, 'sine', null, 0.07);
    },
    denied() {
      tone(220, 0.12, 0.15, 'square', 160);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => tone(f, 0.16, 0.16, 'triangle', null, i * 0.1));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => tone(f, 0.18, 0.16, 'triangle', null, i * 0.11));
    },
    flash() {
      tone(2400, 0.5, 0.12, 'sine', 900);
    },
    step() {
      noise(0.04, 500, 0.05, 'lowpass');
    },
    plantStart() {
      tone(1000, 0.1, 0.15, 'square');
      tone(1000, 0.1, 0.15, 'square', null, 0.25);
    },
  };
}
