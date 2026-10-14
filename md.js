/*
 * md.js
 *
 * Runs md.html, which shows a Markdown file as a Stagehand deck. The address
 * says which file and how to show it:
 *
 *   md.html?src=talk.md               a file on the same site
 *   md.html?src=talk.md&theme=paper   with a theme, overriding the file's own
 *   md.html?id=…                      a file dropped or pasted on the start page,
 *                                     kept in this browser's localStorage
 *   md.html?…&view=grid               every slide at once, for the start page preview
 *   md.html?…&view=cover&n=3          one slide filling the frame, n counts from 0
 *   md.html?…&view=print              every slide full size, one per page, then
 *                                     the print dialog, for saving a PDF
 *
 * With no view it presents the deck, by loading stagehand.js.
 */

import { markdownToDeck, fitSlides, THEMES } from './markdown.js';

const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'present';

const source = await readSource(params);

if (source.text == null) {
  showMissing();
} else {
  const { html, meta } = markdownToDeck(source.text);
  const theme = (params.get('theme') || meta.theme || 'classic').toLowerCase();
  if (THEMES[theme]) document.getElementById('theme').href = `themes/${theme}.css`;

  document.title = meta.title;
  document.body.insertAdjacentHTML('afterbegin', html);
  const deck = document.querySelector('.deck');
  // stagehand.js keys saved script edits and the two windows' channel by this.
  deck.dataset.key = `${source.key}:${theme}`;

  await themeLoaded();
  await document.fonts.ready;
  const fit = shrinkCrowdedSlides(deck);

  if (view === 'present') {
    await import('./stagehand.js');
  } else {
    const wrap = layOutThumbnails(deck, view);
    if (view === 'print') await printEverySlide(wrap, meta);
    else reportToStartPage(wrap, meta, fit);
  }
}

/* ---------- reading the file ---------- */

// Returns the Markdown and a key that names this deck, or text: null when it is missing.
async function readSource(params) {
  try {
    const id = params.get('id');
    if (id) return { key: `md-${id}`, text: localStorage.getItem(`stagehand:md:${id}`) };
    const src = params.get('src') || 'example.md';
    const response = await fetch(src);
    return { key: src, text: response.ok ? await response.text() : null };
  } catch {
    return { key: 'missing', text: null };
  }
}

function showMissing() {
  document.body.innerHTML = `
    <div class="sh-missing">
      <p>That deck is not here. Decks you drop or paste are kept in the browser you used,
      so open it there, or add the file again.</p>
      <p><a style="color:#E2B866" href="./">Go to Stagehand</a></p>
    </div>`;
}

// Waits for the theme's stylesheet, or a second and a half if it never says.
function themeLoaded() {
  const link = document.getElementById('theme');
  return new Promise(resolve => {
    if (link.sheet) return resolve();
    link.addEventListener('load', resolve, { once: true });
    setTimeout(resolve, 1500);
  });
}

// Lays the slides out once, at full size and off screen, so fitSlides can
// measure them and shrink the type on any that run past the bottom.
function shrinkCrowdedSlides(deck) {
  const sections = deck.querySelectorAll(':scope > section');
  deck.style.cssText = `position:absolute;left:-99999px;top:0;width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px`;
  sections.forEach(section => (section.style.visibility = 'visible'));
  const fit = fitSlides(deck);
  sections.forEach(section => (section.style.visibility = ''));
  deck.removeAttribute('style');
  return fit;
}

/* ---------- the grid, cover and print views ---------- */

// Takes every slide out of the running deck and puts each in its own frame.
// Slides keep a data-i with their place in the deck, counted from 0, so
// problems found here can be traced back to them.
function layOutThumbnails(deck, view) {
  document.body.classList.add('grid', view);
  const frames = [];

  const card = deck.querySelector(':scope > .title-card');
  if (card) {
    const cardFrame = element('div', 'sh-cardthumb');
    cardFrame.innerHTML = card.innerHTML;
    frames.push(cardFrame);
  }

  deck.querySelectorAll(':scope > section').forEach((section, i) => {
    const holder = element('div', 'deck');
    holder.dataset.i = i;
    holder.appendChild(section);
    frames.push(holder);
  });

  const which = clamp(Number(params.get('n')) || 0, 0, frames.length - 1);
  const shown = view === 'cover' ? [frames[which]] : frames;

  const wrap = element('div', 'sh-gridwrap');
  for (const frame of shown) {
    const thumb = element('div', 'sh-thumb');
    thumb.appendChild(frame);
    wrap.appendChild(thumb);
  }
  deck.remove();
  document.body.appendChild(wrap);
  return wrap;
}

async function printEverySlide(wrap, meta) {
  document.title = `${meta.title} (PDF)`;
  const note = element('p', 'sh-printnote');
  note.textContent =
    'Choose Save as PDF in the print window. Turn on background graphics if your slides look blank.';
  document.body.appendChild(note);
  await picturesSettled(wrap);
  await document.fonts.ready;
  setTimeout(() => window.print(), 300);
}

// Scales each slide down to its frame, then tells the start page, which shows
// this page in an iframe, how tall it is and what went wrong. It reports twice,
// once now and again when every picture has loaded or failed.
function reportToStartPage(wrap, meta, fit) {
  const scaleToFrames = () =>
    wrap.querySelectorAll('.sh-thumb').forEach(thumb => {
      thumb.firstChild.style.transform = `scale(${thumb.clientWidth / SLIDE_WIDTH})`;
    });
  scaleToFrames();
  addEventListener('resize', scaleToFrames);

  const report = () =>
    parent.postMessage(
      {
        type: 'stagehand-grid',
        height: document.documentElement.scrollHeight,
        slides: meta.slides,
        fit,
        broken: brokenPictures(wrap),
      },
      '*',
    );
  report();
  picturesSettled(wrap).then(report);
}

/* ---------- small helpers ---------- */

function picturesSettled(root) {
  const pending = [...root.querySelectorAll('img')].filter(img => !img.complete);
  return Promise.all(
    pending.map(img => new Promise(resolve => (img.onload = img.onerror = resolve))),
  );
}

function brokenPictures(root) {
  return [...root.querySelectorAll('.deck[data-i] img')]
    .filter(img => img.complete && !img.naturalWidth)
    .map(img => ({ i: Number(img.closest('[data-i]').dataset.i), src: img.getAttribute('src') }));
}

function element(tag, className) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}
