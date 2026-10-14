/*
 * stagehand.js
 *
 * Turns a page of <section> slides into a presentation with two windows.
 * The one you share shows only the slides. The one you keep, opened at the
 * same address with #presenter on the end, has your script, the next slide,
 * a timer and every control. The two talk over a BroadcastChannel, so they
 * need to be open in the same browser.
 *
 * The page it reads:
 *
 *   <div class="deck" data-title="My talk" data-length="5">
 *     <header class="title-card" data-voice="intro.mp3"> ...optional... </header>
 *     <section data-title="Short name" data-sound="room.mp3">
 *       ...the slide...
 *       <aside>What you say. (click) What you say after the next reveal.</aside>
 *     </section>
 *   </div>
 *
 * See README.md beside this file for the whole of it.
 *
 * How this file is laid out, top to bottom:
 *
 *   build the page     wraps the deck in a stage scaled to the window, adds the
 *                      title card gate and the presenter panel (hidden unless
 *                      this is the presenter window)
 *   prepare each slide numbers slides and staggers their text so it rises in
 *   state              where the talk is: slide, reveal step, title card or not
 *   rendering          shows the current slide and step, in either window
 *   presenter window   the script, next slide preview, timer, dots and editing
 *   moving             next, prev and restart, the only things that change state
 *   the shared window  the first click, sound, full screen and the keyboard
 *   keeping together   the messages the two windows send each other
 *
 * Both windows run this same file. `presenter` says which one this is.
 */

import { Sound } from './sound.js';
import { track } from './experiments-web.js';

// Slides are designed on a fixed canvas and scaled to fit, so pixel sizes in
// stagehand.css mean the same thing on a laptop and on a projector.
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const CROSSFADE_MS = 1000; // a little longer than the 0.9s crossfade in stagehand.css
const CURSOR_IDLE_MS = 2600; // hides the pointer on the shared window after this
const TIMER_TICK_MS = 500;

const deck = document.querySelector('.deck');
const slides = [...deck.querySelectorAll(':scope > section')];
const titleCard = deck.querySelector(':scope > .title-card');
const DECK_TITLE = deck.dataset.title || document.title || 'Presentation';
const LENGTH = (parseFloat(deck.dataset.length) || 5) * 60;
const KEY =
  'stagehand:' + ((deck.dataset.key || location.pathname).replace(/[^a-z0-9]+/gi, '-') || 'deck');
const presenter = location.hash === '#presenter';
const $ = (sel, root = document) => root.querySelector(sel);
// Buttons give up focus once pressed, so the space bar and arrow keys keep
// moving through the deck instead of pressing the same button again.
const onPress = (button, action) =>
  button.addEventListener('click', event => {
    event.currentTarget.blur();
    action(event);
  });
const make = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/* ---------- build the page around the deck ---------- */

const viewport = make('div', 'sh-viewport');
const stage = make('div', 'sh-stage');
deck.parentNode.insertBefore(viewport, deck);
viewport.appendChild(stage);
stage.appendChild(deck);
if (deck.dataset.grain !== 'off') stage.appendChild(make('div', 'sh-grain'));

// The title card's own markup, reused for the opening card and the presenter's preview.
const cardHTML = titleCard
  ? [...titleCard.children]
      .filter(c => c.tagName !== 'ASIDE')
      .map(c => c.outerHTML)
      .join('')
  : `<h1>${DECK_TITLE}</h1>`;
const gate = make('div', 'sh-gate', `<div class="sh-card">${cardHTML}</div>`);
document.body.appendChild(gate);
const titlePreview = make('div', 'pv-titleprev', cardHTML);
stage.appendChild(titlePreview);

const panel = make(
  'div',
  'sh-pv',
  `
  <header class="pv-top">
    <div class="pv-id"><span class="pv-mark"></span><span class="pv-link">Looking for the presentation window…</span></div>
    <div class="pv-clock"><div class="pv-time"><span class="pv-el">0:00</span><span class="pv-of"></span></div><div class="pv-prog"><i></i></div></div>
    <div class="pv-util">
      <button class="pv-sound" type="button" aria-pressed="true">Sound on</button>
      <input class="pv-vol" type="range" min="0" max="1" step="0.05" value="0.7" aria-label="Volume">
      <button class="pv-fs" type="button">Full screen</button>
      <button class="pv-restart" type="button" title="Back to the title card and reset the timer">Start over</button>
    </div>
  </header>
  <div class="pv-arm" hidden>The presentation window is not connected yet. Click it once to turn on sound, then once more for full screen.</div>
  <section class="pv-left">
    <div class="pv-label"><span>Now</span><span class="bed"></span></div>
    <div class="pv-box pv-cur"></div>
    <div class="pv-label"><span class="pv-nextlabel">Next</span></div>
    <div class="pv-box next pv-nextbox"><div class="sh-stage pv-nextstage"></div></div>
  </section>
  <section class="pv-right">
    <div class="pv-head"><div class="pv-where"><span class="n"></span><span class="t"></span></div>
      <div class="pv-edit"><span class="note"></span><button type="button" class="undo" hidden>Undo edits</button><button type="button" class="copy" hidden>Copy edits</button><button type="button" class="edit">Edit</button></div></div>
    <div class="pv-notes"><div class="pv-say"></div><div class="pv-more done"><button type="button">More below ↓</button></div></div>
  </section>
  <footer class="pv-nav">
    <button class="pv-back" type="button" aria-label="Back">←</button>
    <div class="pv-dots"></div>
    <button class="pv-go" type="button"><span class="m">Next</span><span class="s"></span></button>
  </footer>`,
);
document.body.appendChild(panel);
$('.pv-mark', panel).textContent = DECK_TITLE;

/* ---------- prepare each slide ---------- */

slides.forEach((el, k) => {
  if (k % 2) el.classList.add('alt');
  if (deck.dataset.numbers !== 'off' && el.dataset.number !== 'off') {
    const num = make('p', 'sh-num');
    num.textContent = String(k + 1).padStart(2, '0');
    el.prepend(num);
  }
  // Text rises in, one piece after another. Delays go through a class rather than
  // element.style, so a slide's own inline styles are never rewritten.
  let n = 0;
  const walk = node =>
    [...node.children].forEach(c => {
      if (c.matches('aside, .photo, .reveal, .ring, .sh-num, img, video')) return;
      if (!c.textContent.trim()) return;
      if (
        c.children.length > 1 &&
        [...c.children].every(x => x.tagName === 'DIV' || x.tagName === 'LI')
      ) {
        walk(c);
        return;
      }
      c.classList.add('rise');
      c.classList.add('rise-' + Math.min(n++, 15));
    });
  walk(el);
});
{
  const st = document.createElement('style');
  let css = '';
  for (let n = 0; n <= 15; n++) css += `.rise-${n}{--d:${Math.min(250 + n * 95, 1700)}ms}`;
  st.textContent = css;
  document.head.appendChild(st);
}

// A slide with more words than fit gets smaller type. Checked again once the fonts arrive.
const fitWords = () =>
  slides.forEach(el => {
    for (const step of ['dense', 'denser']) {
      if (el.scrollHeight <= el.clientHeight + 2) break;
      el.classList.add(step);
    }
  });
fitWords();
document.fonts?.ready.then(fitWords);

const reveals = el => [...el.querySelectorAll('.reveal')];
const notesOf = el => {
  const a = el && el.querySelector(':scope > aside');
  return a ? a.textContent.trim() : '';
};
function slideTitle(k) {
  const el = slides[k];
  if (!el) return '';
  if (el.dataset.title) return el.dataset.title;
  const h = el.querySelector('h1, h2, h3');
  if (!h) return 'Slide ' + (k + 1);
  const t = h.textContent.replace(/\s+/g, ' ').trim();
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

/* Only the words to say: production notes (a line starting LIKE THIS:) are left out. */
function script(text) {
  const lines = text.split('\n');
  const cut = lines.findIndex(l => /^[A-Z][A-Z ']{2,}[A-Z]:/.test(l.trim()));
  return (cut < 0 ? lines : lines.slice(0, cut))
    .map(l => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ---------- state ---------- */

// Where the talk is. Both windows keep their own copy and send changes to
// each other, so these always match once the windows are connected.
let i = 0; // the current slide, counted from 0, not counting the title card
let step = 0; // how many of the current slide's .reveal items are showing
let titleOn = true; // the title card is up, covering slide 0
let titleVoiced = false; // the title card's narration has been started
let started = false; // the shared window has had its first click (always true for the presenter)

// Bookkeeping.
let applying = false; // true while applying a message from the other window, so it is not echoed back
let pvSeen = false; // the shared window has heard from a presenter window
let t0 = null; // when the presenter's timer started, or null before the first slide
let resumed = false; // the shared window was reloaded mid talk and picked up where it was
const voicePlayed = new Set(); // slides whose narration has already played
try {
  const nav = performance.getEntriesByType('navigation')[0];
  const saved = JSON.parse(sessionStorage.getItem(KEY + ':pos') || 'null');
  if (!presenter && nav && nav.type === 'reload' && saved && (saved.i > 0 || saved.step > 0)) {
    i = saved.i | 0;
    step = saved.step | 0;
    resumed = true;
    titleOn = false;
  }
} catch {}
let ch = null;
try {
  ch = new BroadcastChannel(KEY);
} catch {}
const send = m => {
  if (ch && !applying) ch.postMessage({ ...m, from: presenter ? 'presenter' : 'audience' });
};

const pvCur = $('.pv-cur', panel),
  pvNextBox = $('.pv-nextbox', panel),
  pvNextStage = $('.pv-nextstage', panel);
if (presenter) {
  document.body.classList.add('presenter');
  started = true;
  pvCur.appendChild(stage);
  document.title = 'Presenter · ' + DECK_TITLE;
}

function fit() {
  if (presenter) {
    stage.style.transform = `translate(-50%, -50%) scale(${pvCur.clientWidth / STAGE_WIDTH})`;
    pvNextStage.style.transform = `translate(-50%, -50%) scale(${pvNextBox.clientWidth / STAGE_WIDTH})`;
  } else {
    const s = Math.min(innerWidth / STAGE_WIDTH, innerHeight / STAGE_HEIGHT);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
}
addEventListener('resize', fit);
fit();

/* ---------- rendering ---------- */

let leaveT = null;
function render(arriving = true) {
  const was = slides.find(x => x.classList.contains('active'));
  if (was && was !== slides[i]) {
    slides.forEach(x => x.classList.remove('leaving'));
    was.classList.add('leaving');
    clearTimeout(leaveT);
    leaveT = setTimeout(() => was.classList.remove('leaving'), CROSSFADE_MS);
  }
  slides.forEach((el, k) => el.classList.toggle('active', k === i));
  const el = slides[i];
  showSteps(el, step);
  if (started && !presenter) {
    Sound.setBed(el.dataset.sound || deck.dataset.sound || '');
    if (arriving && step === 0) {
      if (el.dataset.voice && !voicePlayed.has(i)) {
        voicePlayed.add(i);
        setTimeout(
          () => {
            if (slides[i] === el && !titleOn) Sound.voice(el.dataset.voice);
          },
          +(el.dataset.voiceDelay || 800),
        );
      } else if (!el.dataset.voice) Sound.stopVoice();
    }
  }
  slides.forEach((s, k) =>
    s.querySelectorAll('video').forEach(v => {
      if (k === i) {
        if (v.paused) {
          try {
            v.currentTime = 0;
          } catch {}
          v.play().catch(() => {});
        }
      } else if (!v.paused) v.pause();
    }),
  );
  if (presenter) renderPresenter();
  send({ type: 'nav', i, step });
  if (started && !presenter)
    try {
      sessionStorage.setItem(KEY + ':pos', JSON.stringify({ i, step }));
    } catch {}
  if (!presenter && started && i === slides.length - 1) track('reached-the-end', { once: true });
}
function showSteps(el, s) {
  reveals(el).forEach((x, k) => {
    x.classList.toggle('on', k < s);
    x.classList.toggle('past', k < s - 1);
  });
}

/* ---------- presenter window ---------- */

const pvSay = $('.pv-say', panel),
  pvNotes = $('.pv-notes', panel),
  pvFold = $('.pv-more', panel);
const updateFold = () =>
  pvFold.classList.toggle(
    'done',
    pvNotes.scrollTop + pvNotes.clientHeight >= pvNotes.scrollHeight - 6,
  );
pvNotes.addEventListener('scroll', updateFold);
addEventListener('resize', updateFold);
onPress($('button', pvFold), () => {
  pvNotes.scrollBy({ top: pvNotes.clientHeight * 0.7 });
});

// Your own edits to the script stay in this browser, per slide, and show instead of the original.
const editKey = k => KEY + ':edit:' + k;
const getEdit = k => {
  try {
    return localStorage.getItem(editKey(k));
  } catch {
    return null;
  }
};
const setEdit = (k, v) => {
  try {
    v == null ? localStorage.removeItem(editKey(k)) : localStorage.setItem(editKey(k), v);
  } catch {}
};
let editing = false; // the script box is open for editing
let lastPvI = -2; // the slide the script was last drawn for, to scroll it back to the top on a new one

function setGo(main, sub) {
  const b = $('.pv-go', panel);
  $('.m', b).textContent = main;
  $('.s', b).textContent = sub || '';
}
function markDots() {
  panel.querySelectorAll('.pv-dots button').forEach(d => {
    const n = +d.dataset.n;
    d.classList.toggle('cur', titleOn ? n < 0 : n === i);
    d.classList.toggle('done', !titleOn && n < i);
  });
}
function preview(k, s) {
  pvNextStage.innerHTML = '';
  if (k < 0) return;
  const c = slides[k].cloneNode(true);
  c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
  c.classList.add('active');
  c.classList.remove('leaving');
  c.querySelectorAll('.rise').forEach(x => x.classList.remove('rise'));
  c.querySelectorAll('video').forEach(v => {
    v.removeAttribute('src');
    v.load();
  });
  c.querySelectorAll('aside').forEach(a => a.remove());
  showSteps(c, s);
  const d = make('div', 'deck');
  d.appendChild(c);
  pvNextStage.appendChild(d);
}
function paint(say) {
  pvSay.innerHTML = '';
  const total = reveals(slides[i]).length;
  let clickN = 0;
  say.split(/(\([^)]*\))/).forEach(part => {
    if (/^\(.*\)$/.test(part)) {
      const t = part.slice(1, -1).trim();
      if (/^click$/i.test(t)) {
        const ci = clickN++,
          b = make('button', 'cue reveal-btn');
        b.type = 'button';
        b.title = 'Click to reveal';
        b.textContent = total > 1 ? String(ci + 1) : step > ci ? 'Revealed' : 'Reveal';
        b.disabled = step !== ci || ci >= total;
        onPress(b, () => {
          next();
        });
        pvSay.appendChild(b);
      } else {
        const c = make('span', 'cue');
        c.textContent = t;
        pvSay.appendChild(c);
      }
    } else if (part) {
      part.split(/\n{2,}/).forEach((seg, k) => {
        if (k) pvSay.appendChild(make('span', 'gap'));
        if (seg) pvSay.appendChild(document.createTextNode(seg.replace(/^\n+|\n+$/g, '')));
      });
    }
  });
}
function renderPresenter() {
  if (titleOn) return presenterTitle();
  document.body.classList.remove('on-title');
  const own = getEdit(i),
    say = own != null ? own : script(notesOf(slides[i]));
  $('.undo', panel).hidden = own == null;
  $('.copy', panel).hidden = !slides.some((x, k) => getEdit(k) != null);
  $('.note', panel).textContent = own != null ? 'Your edited script' : '';
  if (editing) pvSay.textContent = say;
  else paint(say);
  if (lastPvI !== i) {
    pvNotes.style.scrollBehavior = 'auto';
    pvNotes.scrollTop = 0;
    pvNotes.style.scrollBehavior = '';
    lastPvI = i;
  }
  requestAnimationFrame(updateFold);
  const bed = slides[i].dataset.sound || deck.dataset.sound;
  $('.bed', panel).textContent = bed ? '♪ ' + bed.split('/').pop() : '';
  const total = reveals(slides[i]).length;
  let label = 'Next';
  if (step < total) {
    preview(i, step + 1);
    label = 'Next · reveal on this slide';
    setGo('Reveal', step + 1 + ' of ' + total + ' on this slide');
  } else if (i >= slides.length - 1) {
    preview(-1);
    label = 'End of the talk';
    setGo('End');
  } else {
    preview(i + 1, 0);
    setGo('Next', slideTitle(i + 1));
  }
  $('.pv-nextlabel', panel).textContent = label;
  $('.pv-where .n', panel).textContent =
    String(i + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
  $('.pv-where .t', panel).textContent = slideTitle(i);
  markDots();
  if (t0 === null) t0 = Date.now();
  tick();
}
function presenterTitle() {
  if (editing) toggleEdit(false);
  document.body.classList.add('on-title');
  $('.bed', panel).textContent = '';
  $('.pv-where .n', panel).textContent = '00';
  $('.pv-where .t', panel).textContent = 'Title card';
  const voice = titleCard && titleCard.dataset.voice;
  const own = titleCard ? script(notesOf(titleCard)) : '';
  pvSay.innerHTML = '';
  pvSay.textContent =
    own ||
    (voice
      ? titleVoiced
        ? 'The narration is playing. Press Begin when it ends.'
        : 'Press Start narration to play the opening over this card.'
      : 'Press Begin when you are ready.');
  if (voice && !titleVoiced) setGo('▶ Start narration');
  else setGo('Begin', slideTitle(0));
  $('.pv-nextlabel', panel).textContent = 'Next';
  preview(0, 0);
  markDots();
}
function tick() {
  if (!presenter) return;
  const secs = t0 === null ? 0 : Math.floor((Date.now() - t0) / 1000);
  const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  $('.pv-el', panel).textContent = fmt(secs);
  $('.pv-el', panel).classList.toggle('over', secs > LENGTH);
  $('.pv-of', panel).textContent = '/ ' + fmt(LENGTH);
  const bar = $('.pv-prog i', panel);
  bar.style.width = Math.min(100, (secs / LENGTH) * 100) + '%';
  bar.classList.toggle('over', secs > LENGTH);
}
function toggleEdit(on) {
  const eb = $('.edit', panel);
  editing = on;
  eb.classList.toggle('on', on);
  eb.textContent = on ? 'Done' : 'Edit';
  pvSay.classList.toggle('editing', on);
  if (on) {
    renderPresenter();
    pvSay.contentEditable = 'plaintext-only';
    if (pvSay.contentEditable !== 'plaintext-only') pvSay.contentEditable = 'true';
    pvSay.focus();
    track('edited-the-script');
  } else {
    pvSay.contentEditable = 'false';
    eb.blur();
    renderPresenter();
  }
}

if (presenter) {
  const dots = $('.pv-dots', panel);
  for (let n = -1; n < slides.length; n++) {
    const d = make('button', n < 0 ? 'title' : '');
    d.type = 'button';
    d.dataset.n = n;
    d.title = n < 0 ? 'Title card' : n + 1 + '. ' + slideTitle(n);
    onPress(d, () => {
      send({ type: 'goto', n });
      track('jumped-to-a-slide');
    });
    dots.appendChild(d);
  }
  setInterval(tick, TIMER_TICK_MS);
  onPress($('.pv-go', panel), () => {
    next();
  });
  onPress($('.pv-back', panel), () => {
    prev();
  });
  onPress($('.pv-restart', panel), () => {
    t0 = null;
    tick();
    send({ type: 'restart' });
    track('started-over');
  });
  onPress($('.pv-fs', panel), () => {
    send({ type: 'fsCmd' });
  });
  onPress($('.pv-sound', panel), () => {
    send({ type: 'soundCmd', toggle: true });
  });
  $('.pv-vol', panel).addEventListener('input', e =>
    send({ type: 'soundCmd', vol: +e.target.value }),
  );
  $('.edit', panel).addEventListener('click', () => {
    if (!titleOn) toggleEdit(!editing);
  });
  pvSay.addEventListener('input', () => {
    if (!editing) return;
    const v = pvSay.innerText.replace(/\n{3,}/g, '\n\n');
    setEdit(i, v.trim() === script(notesOf(slides[i])).trim() ? null : v);
    $('.note', panel).textContent = 'Saved in this browser';
  });
  onPress($('.undo', panel), () => {
    setEdit(i, null);
    renderPresenter();
  });
  onPress($('.copy', panel), () => {
    const out = slides
      .map((x, k) => {
        const v = getEdit(k);
        return v == null ? null : 'Slide ' + (k + 1) + ' (' + slideTitle(k) + ')\n' + v;
      })
      .filter(Boolean)
      .join('\n\n---\n\n');
    track('copied-edits');
    (navigator.clipboard ? navigator.clipboard.writeText(out) : Promise.reject())
      .then(() => {
        $('.note', panel).textContent = 'Copied';
      })
      .catch(() => prompt('Copy your edits:', out));
  });
  track('opened-the-notes-window', { once: true });
}

/* ---------- moving through the deck ---------- */

function showTitle(on) {
  titleOn = on;
  if (!presenter) {
    gate.style.transition = '';
    gate.classList.toggle('gone', !on);
  }
  send({ type: 'title', on, voiced: titleVoiced });
  if (presenter) {
    if (on) presenterTitle();
    else renderPresenter();
  }
  if (!on) render();
}
function next() {
  if (titleOn) {
    if (presenter) {
      send({ type: 'titleNext' });
      return;
    }
    if (!started) {
      sendSound();
      return;
    }
    const v = titleCard && titleCard.dataset.voice;
    if (v && !titleVoiced && Sound.started) {
      titleVoiced = true;
      Sound.voice(v);
      send({ type: 'title', on: true, voiced: true });
      track('played-narration');
      return;
    }
    showTitle(false);
    return;
  }
  const total = reveals(slides[i]).length;
  if (step < total) {
    step++;
    render(false);
    track('used-a-reveal');
    return;
  }
  if (i < slides.length - 1) {
    i++;
    step = 0;
    render();
  }
}
function prev() {
  if (titleOn) return;
  if (i === 0 && step === 0) {
    showTitle(true);
    return;
  }
  if (step > 0) {
    step--;
    render(false);
    return;
  }
  if (i > 0) {
    i--;
    step = reveals(slides[i]).length;
    render(false);
  }
}
function restart() {
  Sound.stopVoice(0.6);
  titleVoiced = false;
  voicePlayed.clear();
  i = 0;
  step = 0;
  render(false);
  showTitle(true);
}

/* ---------- the shared window ---------- */

function sendSound() {
  if (!presenter)
    send({ type: 'sound', started: Sound.started, muted: Sound.muted, vol: Sound.volume });
}
function toast(msg, ms = 9000) {
  const t = make('div', 'sh-toast');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function openPresenter() {
  if (presenter) return;
  const w = window.open(
    location.href.split('#')[0] + '#presenter',
    KEY + ':panel',
    'popup,width=1280,height=820',
  );
  if (!w)
    toast(
      'Your browser blocked the notes window. Allow pop-ups for this page, then press P. Or open this page again with #presenter at the end of the address.',
    );
}
function fullScreen() {
  const d = document;
  if (d.fullscreenElement) {
    d.exitFullscreen?.().catch(() => {});
    return;
  }
  d.documentElement
    .requestFullscreen?.()
    .then(() => track('went-full-screen'))
    .catch(() => {
      send({ type: 'fsNeedsClick' });
      if ($('.sh-pill.fs')) return;
      const pill = make('div', 'sh-pill fs');
      pill.textContent = 'Click anywhere to go full screen';
      document.body.appendChild(pill);
      addEventListener(
        'click',
        e => {
          e.preventDefault();
          e.stopPropagation();
          pill.remove();
          d.documentElement.requestFullscreen?.().catch(() => {});
        },
        { capture: true, once: true },
      );
    });
}

// One click on the shared window turns the sound on and opens the notes window. Browsers allow one of
// those per click, so if the notes window is already open the same click goes full screen instead.
function begin(resume) {
  if (started) return;
  started = true;
  $('.sh-pill')?.remove();
  if (resume) gate.classList.add('gone');
  Sound.init();
  Sound.setVolume(Sound.volume);
  if (titleCard && titleCard.dataset.voice) Sound.load(titleCard.dataset.voice);
  slides.forEach(s => {
    s.dataset.voice && Sound.load(s.dataset.voice);
    s.dataset.sound && Sound.load(s.dataset.sound);
  });
  render();
  poke();
  if (pvSeen && !resume) fullScreen();
  else openPresenter();
  sendSound();
  track('opened-a-deck', { once: true });
}
if (!presenter) {
  gate.addEventListener('click', () => {
    if (!started) begin();
    else if (!document.fullscreenElement) fullScreen();
  });
  viewport.addEventListener('click', e => {
    if (!started) return;
    const r = viewport.getBoundingClientRect();
    e.clientX - r.left < r.width * 0.25 ? prev() : next();
  });
  document.addEventListener('fullscreenchange', () =>
    send({ type: 'fs', on: !!document.fullscreenElement }),
  );
  if (resumed) {
    gate.classList.add('gone');
    gate.style.transition = 'none';
    const pill = make('div', 'sh-pill');
    pill.textContent = 'Click or press any key to carry on';
    document.body.appendChild(pill);
    const go = e => {
      if (started) return;
      e.preventDefault();
      e.stopPropagation();
      begin(true);
    };
    addEventListener('keydown', go, { capture: true, once: true });
    viewport.addEventListener('click', go, { capture: true, once: true });
  }
}

let idleT = null;
function poke() {
  viewport.classList.remove('hide-cursor');
  clearTimeout(idleT);
  idleT = setTimeout(() => {
    if (started) viewport.classList.add('hide-cursor');
  }, CURSOR_IDLE_MS);
}
document.addEventListener('mousemove', poke);

addEventListener(
  'keydown',
  e => {
    const a = document.activeElement,
      k = e.key;
    if (a && (a.isContentEditable || (/INPUT|TEXTAREA/.test(a.tagName) && a.type !== 'range')))
      return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (
      a &&
      a !== document.body &&
      ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '].includes(k)
    )
      a.blur();
    if (!started) {
      if (['ArrowRight', ' ', 'Enter', 'PageDown'].includes(k)) {
        e.preventDefault();
        begin();
      } else if (k === 'p' || k === 'P') openPresenter();
      return;
    }
    if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(k)) {
      e.preventDefault();
      next();
    } else if (['ArrowLeft', 'PageUp', 'ArrowUp', 'Backspace'].includes(k)) {
      e.preventDefault();
      prev();
    } else if (k === 'f' || k === 'F') {
      presenter ? send({ type: 'fsCmd' }) : fullScreen();
    } else if (k === 'm' || k === 'M') {
      presenter
        ? send({ type: 'soundCmd', toggle: true })
        : (Sound.setMuted(!Sound.muted), sendSound());
    } else if ((k === 'p' || k === 'P') && !presenter) openPresenter();
    poke();
  },
  true,
);

/* ---------- keeping the two windows together ---------- */

// Every message carries `from`, 'presenter' or 'audience', and each window
// ignores its own. While a message is being applied, `applying` stops send()
// so the change is not bounced straight back. The messages:
//
//   from the presenter                    from the shared window (audience)
//   hello      I just opened              ping      I just opened
//   goto n     jump to slide n, -1 title  nav       now on slide i, step
//   titleNext  leave the title card       title     the title card is on or off
//   restart    back to the title card     sound     sound started, muted, volume
//   fsCmd      toggle full screen         fs        full screen is on or off
//   soundCmd   mute toggle or volume      fsNeedsClick  the browser wants a click first
//
// nav and title go both ways, since either window can move the deck.

if (ch)
  ch.onmessage = ({ data: m = {} }) => {
    const fromOther = (m.from === 'presenter') !== presenter;
    if (!fromOther) return;
    if (!presenter && !pvSeen) pvSeen = true;
    if (presenter) {
      const l = $('.pv-link', panel);
      l.textContent = 'Presentation connected · share that window, not this one';
      l.classList.add('on');
    }
    applying = true;
    try {
      switch (m.type) {
        case 'hello':
          applying = false;
          if (!presenter) {
            send({ type: 'nav', i, step });
            send({ type: 'title', on: titleOn, voiced: titleVoiced });
            sendSound();
          }
          break;
        case 'ping':
          applying = false;
          if (presenter) send({ type: 'hello' });
          break;
        case 'sound': {
          const on = m.started && !m.muted,
            b = $('.pv-sound', panel);
          b.setAttribute('aria-pressed', String(on));
          b.textContent = on ? 'Sound on' : 'Sound off';
          if (typeof m.vol === 'number') $('.pv-vol', panel).value = m.vol;
          $('.pv-arm', panel).hidden = !!m.started;
          break;
        }
        case 'soundCmd':
          if (presenter) break;
          if (m.toggle && Sound.started) Sound.setMuted(!Sound.muted);
          if (typeof m.vol === 'number') Sound.setVolume(m.vol);
          applying = false;
          sendSound();
          break;
        case 'fsCmd':
          if (!presenter) fullScreen();
          break;
        case 'fs':
          if (presenter) $('.pv-fs', panel).textContent = m.on ? 'Exit full screen' : 'Full screen';
          break;
        case 'fsNeedsClick':
          if (presenter) {
            const b = $('.pv-arm', panel);
            b.textContent =
              'The browser needs one click on the presentation window itself to go full screen.';
            b.hidden = false;
            setTimeout(() => {
              b.hidden = true;
            }, 6000);
          }
          break;
        case 'restart':
          if (!presenter) {
            applying = false;
            restart();
          }
          break;
        case 'titleNext':
          if (!presenter && titleOn) {
            applying = false;
            next();
          }
          break;
        case 'goto':
          if (presenter) break;
          if (!started) {
            applying = false;
            sendSound();
            break;
          }
          applying = false;
          if (m.n < 0) {
            if (!titleOn) showTitle(true);
            break;
          }
          i = Math.max(0, Math.min(slides.length - 1, m.n));
          step = 0;
          if (titleOn) showTitle(false);
          else render();
          break;
        case 'title':
          if (typeof m.voiced === 'boolean') titleVoiced = m.voiced;
          if (m.on !== titleOn) showTitle(m.on);
          else if (presenter && titleOn) presenterTitle();
          break;
        case 'nav': {
          if (m.i === i && m.step === step) break;
          const arriving = m.i !== i && m.step === 0;
          i = Math.max(0, Math.min(slides.length - 1, m.i));
          step = m.step;
          if (titleOn && !presenter) break;
          render(arriving);
          break;
        }
      }
    } finally {
      applying = false;
    }
  };

/* ---------- start ---------- */

applying = presenter;
render(false);
applying = false;
if (presenter) {
  if (titleOn) presenterTitle();
} else if (!titleOn) gate.classList.add('gone');
fit();
if (presenter) send({ type: 'hello' });
else {
  send({ type: 'ping' });
  send({ type: 'title', on: titleOn, voiced: titleVoiced });
  sendSound();
}
