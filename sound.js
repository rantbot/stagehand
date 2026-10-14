/*
 * sound.js
 *
 * Two kinds of sound, both optional.
 *
 *   Beds. A looping recording under a slide, set with data-sound="room.mp3".
 *   Moving to a slide with a different bed crossfades. Slides with the same
 *   bed keep playing it without a seam. A slide with no data-sound is quiet.
 *
 *   Voices. A recording that plays once over a slide or the title card, set
 *   with data-voice="intro.mp3". The bed dips underneath while it plays.
 *
 * Browsers only allow sound after a click on the page itself, which is why
 * the presentation window asks for one click before anything plays.
 */

export const Sound = (() => {
  // The audio graph, built on the first click: everything runs through a
  // compressor into `master`, which carries the volume and mute.
  let ctx = null; // the AudioContext
  let master = null; // overall volume
  let beds = null; // the beds' shared gain, dipped while a voice plays
  let voiceSrc = null; // the voice playing now, if any
  let voiceGain = null;

  let volume = 0.7;
  let muted = false;
  let bedUrl = null; // the bed playing now, by address
  let bed = null; // its source and gain nodes
  const buffers = new Map(); // decoded recordings, by address, so each loads once

  function init() {
    if (ctx) {
      ctx.resume();
      return;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.knee.value = 12;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(comp);
    comp.connect(ctx.destination);
    beds = ctx.createGain();
    beds.gain.value = 1;
    beds.connect(master);
  }

  function load(url) {
    if (!url || !ctx) return Promise.resolve(null);
    if (!buffers.has(url)) {
      buffers.set(
        url,
        fetch(url)
          .then(r => {
            if (!r.ok) throw new Error(url);
            return r.arrayBuffer();
          })
          .then(b => new Promise((ok, bad) => ctx.decodeAudioData(b, ok, bad)))
          .catch(() => {
            console.warn('Stagehand could not load', url);
            return null;
          }),
      );
    }
    return buffers.get(url);
  }

  function fade(gain, to, secs) {
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(to, t + secs);
  }

  /** Crossfades to a slide's bed, or to quiet when url is empty. */
  function setBed(url, secs = 2.5) {
    if (!ctx || url === bedUrl) return;
    bedUrl = url || null;
    if (bed) {
      const old = bed;
      fade(old.g, 0, secs);
      setTimeout(
        () => {
          try {
            old.src.stop();
          } catch {}
        },
        secs * 1000 + 200,
      );
      bed = null;
    }
    if (!url) return;
    load(url).then(buf => {
      if (!buf || bedUrl !== url) return;
      const src = ctx.createBufferSource(),
        g = ctx.createGain();
      src.buffer = buf;
      src.loop = true;
      g.gain.value = 0;
      src.connect(g);
      g.connect(beds);
      src.start(0, Math.random() * buf.duration * 0.8);
      bed = { src, g };
      fade(g, 1, secs);
    });
  }

  function stopVoice(secs = 1.2) {
    if (!voiceSrc) return;
    const src = voiceSrc,
      g = voiceGain;
    voiceSrc = null;
    fade(g, 0, secs);
    setTimeout(
      () => {
        try {
          src.stop();
        } catch {}
      },
      secs * 1000 + 100,
    );
    beds.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
  }

  function voice(url, onEnd) {
    if (!ctx || !url) return;
    stopVoice(0.3);
    load(url).then(buf => {
      if (!buf) return;
      const t = ctx.currentTime + 0.05,
        src = ctx.createBufferSource(),
        g = ctx.createGain();
      src.buffer = buf;
      g.gain.value = 1.1;
      src.connect(g);
      g.connect(master);
      src.start(t);
      voiceSrc = src;
      voiceGain = g;
      beds.gain.setTargetAtTime(0.3, t, 0.4);
      src.onended = () => {
        if (voiceSrc === src) {
          voiceSrc = null;
          beds.gain.setTargetAtTime(1, ctx.currentTime, 0.9);
        }
        onEnd && onEnd();
      };
    });
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(muted ? 0 : v, ctx.currentTime, 0.1);
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.1);
  }

  return {
    init,
    load,
    setBed,
    voice,
    stopVoice,
    setVolume,
    setMuted,
    get started() {
      return !!ctx;
    },
    get muted() {
      return muted;
    },
    get volume() {
      return volume;
    },
    get speaking() {
      return !!voiceSrc;
    },
  };
})();
