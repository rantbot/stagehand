/*
 * markdown.js
 *
 * Turns a Markdown file into a Stagehand deck. No libraries, no build step.
 * It reads ordinary Markdown and picks a layout for each slide from what is
 * on it, so a lone number becomes a big stat and a quote becomes a pull quote.
 * format.md lists every rule, and example.md shows them all.
 *
 *   import { markdownToDeck, checkMarkdown } from './markdown.js';
 *   const { html, meta } = markdownToDeck(text);
 *   const { issues } = checkMarkdown(text);
 *
 * How a file becomes a deck, in the order this file reads:
 *
 *   frontMatter     the settings between --- lines at the top
 *   splitWithLines  the body cut into slides, each with the line it starts on
 *   takeNotes       each slide's script pulled out of it
 *   blocks          each slide read into headings, paragraphs, lists, quotes,
 *                   tables, code and pictures
 *   slideHTML       the blocks laid out by the rules in format.md
 *   brandStyle      the front matter's own colors and fonts, as CSS
 *   markdownToDeck  all of the above, as one <div class="deck">
 *
 * Everything here is pure, so it runs in Node too. tests/markdown.test.mjs
 * covers it, and `node --test` runs that. fitSlides is the one exception, as it
 * measures slides in a real page.
 */

/* ---------- text ---------- */

const escapeHtml = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Inline Markdown inside one line: code, images, links, bold and italics.
 * Everything else is escaped, so the result is safe to put in a page.
 * Code spans are set aside first, behind a placeholder, so nothing inside
 * them is read as Markdown.
 *
 * @param {string} text
 * @returns {string} HTML
 */
export function inline(text) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = escapeHtml(s);
  s = s.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
    (_, alt, src) => `<img src="${src}" alt="${alt}">`,
  );
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
  s = s.replace(
    /(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)|(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g,
    (m, p1, a, p3, b) => `${p1 ?? p3 ?? ''}<em>${a ?? b}</em>`,
  );
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${escapeHtml(codes[n])}</code>`);
}
// The words alone, with Markdown marks, pictures and link targets taken out.
const plainText = s =>
  String(s)
    .replace(/[*_`]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();

/* ---------- front matter and slides ---------- */

// The settings between two --- lines at the very top. Keys are lower cased.
// offset is how many lines they took, so line numbers can count from the file's top.
const FRONT_MATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function frontMatter(text) {
  const m = text.match(FRONT_MATTER);
  if (!m) return { meta: {}, body: text, offset: 0 };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '');
  }
  return { meta, body: text.slice(m[0].length), offset: m[0].split('\n').length - 1 };
}

// Splits on --- (or *** / ___) lines outside code. With none, splits before each # or ## heading.
// Each slide keeps the line it starts on, counted from the top of the body.
function splitSlides(body) {
  return splitWithLines(body).map(p => p.text);
}
function splitWithLines(body) {
  const lines = body.split(/\r?\n/);
  let fence = false;
  const parts = [[]];
  const starts = [0];
  const isRule = l => /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
  const hasRules = lines.some(l => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    return !fence && isRule(l);
  });
  fence = false;
  lines.forEach((l, n) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!fence && hasRules && isRule(l)) {
      parts.push([]);
      starts.push(n + 1);
      return;
    }
    if (!fence && !hasRules && /^#{1,2}\s/.test(l) && parts[parts.length - 1].some(x => x.trim())) {
      parts.push([]);
      starts.push(n);
    }
    parts[parts.length - 1].push(l);
  });
  return parts
    .map((p, i) => ({ text: p.join('\n'), line: starts[i] + p.findIndex(x => x.trim()) }))
    .filter(p => p.text.replace(/<!--[\s\S]*?-->/g, '').trim() || /<!--/.test(p.text));
}

// Pulls the script out of a slide: HTML comments, and anything after a Notes: or ??? line.
function takeNotes(src) {
  const notes = [];
  src = src.replace(/<!--([\s\S]*?)-->/g, (_, c) => {
    notes.push(c.trim());
    return '';
  });
  const lines = src.split('\n');
  const at = lines.findIndex(l => /^\s*(\?\?\?|(speaker\s+)?notes?\s*:)/i.test(l));
  if (at >= 0) {
    const first = lines[at].replace(/^\s*(\?\?\?|(speaker\s+)?notes?\s*:)\s*/i, '');
    notes.unshift([first, ...lines.slice(at + 1)].join('\n').trim());
    src = lines.slice(0, at).join('\n');
  }
  return { src, notes: notes.filter(Boolean).join('\n\n') };
}

/* ---------- blocks ---------- */

// Reads one slide's Markdown into a list of blocks, each a plain object with a
// type: 'h' (heading, with level), 'p', 'list' (with ordered and items),
// 'quote' (with lines), 'table' (with head and rows), 'code' (with lang) or
// 'img' (a paragraph that is only a picture, with src and alt).
function blocks(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    let m;
    if ((m = l.match(/^\s*(```|~~~)\s*([\w-]*)/))) {
      const end = m[1];
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(end)) code.push(lines[i++]);
      i++;
      out.push({ type: 'code', lang: m[2], text: code.join('\n') });
      continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      out.push({ type: 'h', level: m[1].length, text: m[2] });
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push({ type: 'quote', lines: q });
      continue;
    }
    if (
      /^\s*\|.*\|\s*$/.test(l) &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])
    ) {
      const row = r =>
        r
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map(c => c.trim());
      const head = row(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(row(lines[i++]));
      out.push({ type: 'table', head, rows });
      continue;
    }
    if ((m = l.match(listRe))) {
      const ordered = /\d/.test(m[2]);
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        const lm = lines[i].match(listRe);
        if (lm && lm[1].length < 2) items.push(lm[3]);
        else if (items.length) items[items.length - 1] += ' ' + lines[i].trim();
        else break;
        i++;
      }
      out.push({ type: 'list', ordered, items });
      continue;
    }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|\s*>|\s*```|\s*~~~)/.test(lines[i]) &&
      !(para.length && listRe.test(lines[i]))
    )
      para.push(lines[i++].trim());
    const text = para.join(' ');
    const img = text.match(/^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/);
    out.push(img ? { type: 'img', alt: img[1], src: img[2] } : { type: 'p', text });
  }
  return out;
}

/* ---------- layouts ---------- */

// A list item that leads with a number, like "**68%** finish setup" or
// "$1.2M in revenue". The number is group 1, the words after it group 2.
const STAT =
  /^\s*(?:\*\*|__)?\s*([+\-−~]?[$€£]?\d[\d.,]*\s?(?:%|x|×|k|K|m|M|B|bn)?\+?)\s*(?:\*\*|__)?\s*[—–:-]?\s*(.*)$/;
// A list item shaped like "**Label**: value", up to 28 characters of label.
const ROW = /^\s*(?:\*\*|__)?([^*_:]{1,28}?)(?:\*\*|__)?\s*:\s+(.+)$/;
const statOf = s => {
  const m = s.match(STAT);
  return m && m[2] && plainText(m[2]).length > 1 ? { n: m[1].trim(), text: m[2] } : null;
};

// One block as HTML. `reveal.left` counts the (click) cues still to place:
// each list item, stat or label row takes one, in order, until none are left.
function render(b, reveal) {
  const r = () => (reveal.left-- > 0 ? ' reveal' : '');
  switch (b.type) {
    case 'h':
      return b.level <= 2 ? `<h2>${inline(b.text)}</h2>` : `<h3>${inline(b.text)}</h3>`;
    case 'p':
      return `<p>${inline(b.text)}</p>`;
    case 'img':
      return `<img class="figure" src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt)}">`;
    case 'code':
      return `<pre class="code">${escapeHtml(b.text)}</pre>`;
    case 'quote':
      return `<p class="quote">${inline(b.lines.join(' '))}</p>`;
    case 'table':
      return `<table class="table"><thead><tr>${b.head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row => `<tr>${row.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'list': {
      if (b.items.length >= 2 && b.items.length <= 4 && b.items.every(statOf)) {
        return `<div class="columns stats">${b.items
          .map(it => {
            const s = statOf(it);
            return `<div class="stat${r()}"><b>${escapeHtml(s.n)}</b><p>${inline(s.text)}</p></div>`;
          })
          .join('')}</div>`;
      }
      if (b.items.length >= 2 && b.items.every(it => ROW.test(it))) {
        const pairs = b.items.map(it => it.match(ROW));
        return `<div class="rows">${pairs
          .map(m => {
            const c = r().trim();
            return `<span class="${c}">${inline(m[1].trim())}</span><span class="${c}">${inline(m[2])}</span>`;
          })
          .join('')}</div>`;
      }
      return `<ol class="points narrow${b.ordered ? '' : ' dots'}">${b.items.map(it => `<li class="${r().trim()}"><p>${inline(it)}</p></li>`).join('')}</ol>`;
    }
  }
  return '';
}

// One slide as a <section>, its layout chosen from what is on it. The rules run
// in order and the first that fits wins, the same order format.md lists them.
// index is the slide's place among the sections, used to alternate photo sides.
function slideHTML(src, notes, index) {
  const blockList = blocks(src);
  const clicks = (notes.match(/\(click\)/gi) || []).length;
  const reveal = { left: clicks };
  const attrs = [];
  const classes = [];

  // A ### before the slide's main heading is its eyebrow.
  let eyebrow = '';
  const main = blockList.findIndex(b => b.type === 'h' && b.level <= 2);
  if (main > 0 && blockList.slice(0, main).every(b => b.type === 'h' && b.level >= 3)) {
    eyebrow = blockList[main - 1].text;
    blockList.splice(0, main);
  }
  const head =
    blockList[0] && blockList[0].type === 'h' && blockList[0].level <= 2 ? blockList.shift() : null;
  const title = head ? plainText(head.text) : '';
  if (title) attrs.push(`data-title="${escapeHtml(title)}"`);
  const eb = eyebrow ? `<p class="eyebrow">${inline(eyebrow)}</p>` : '';
  let body = '';

  const kinds = blockList.map(b => b.type);
  const img = blockList.find(b => b.type === 'img');
  const quote = blockList.find(b => b.type === 'quote');

  if ((head && head.level === 1) || (head && !blockList.length)) {
    // A heading on its own opens a section.
    classes.push('divider');
    const num = head.text.match(/^\s*(\d{1,2})[.):]?\s+(.+)$/);
    const n = num ? num[1].padStart(2, '0') : '';
    body = `${eb}${n ? `<p class="big-num">${n}</p>` : ''}<h1>${inline(num ? num[2] : head.text)}</h1>${blockList.map(b => (b.type === 'p' ? `<p class="lede">${inline(b.text)}</p>` : render(b, reveal))).join('')}`;
    if (num) attrs.push('data-number="off"');
  } else if (quote && blockList.every(b => b === quote || b.type === 'p')) {
    // A pull quote. A last line starting with a dash, or a line after the quote, credits it.
    classes.push('centered');
    const lines = [...quote.lines];
    let credit = '';
    const dash = /^\s*(?:—|–|--|-)\s*(.+)$/;
    if (lines.length > 1 && dash.test(lines[lines.length - 1])) credit = lines.pop().match(dash)[1];
    const after = blockList
      .filter(b => b.type === 'p')
      .map(b => b.text.replace(dash, '$1'))
      .join(' ');
    credit = credit || after;
    body = `${head ? `<p class="eyebrow">${inline(head.text)}</p>` : eb}<p class="quote">${inline(lines.join(' ').trim())}</p>${credit ? `<p class="caption">${inline(credit)}</p>` : ''}`;
  } else if (
    !head &&
    blockList.length === 1 &&
    blockList[0].type === 'p' &&
    statOf(blockList[0].text)
  ) {
    const s = statOf(blockList[0].text);
    body = `${eb}<div class="stat big"><b>${escapeHtml(s.n)}</b><p>${inline(s.text)}</p></div>`;
  } else if (img) {
    // A picture. On its own it fills the slide, with anything else beside it.
    const rest = blockList.filter(b => b !== img);
    const full = !rest.length;
    const box = `<div class="photo ${full ? 'shade' : 'right'}"><img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt)}"></div>`;
    const caption = img.alt && full ? `<p class="caption">${escapeHtml(img.alt)}</p>` : '';
    body = `${box}<div class="over-photo stack">${eb}${head ? render(head, reveal) : ''}${rest.map(b => render(b, reveal)).join('')}${full && !head ? caption : ''}</div>`;
    if (index % 2) classes.push('alt');
  } else if (
    blockList.filter(b => b.type === 'h' && b.level >= 3).length >= 2 &&
    blockList[0].type === 'h'
  ) {
    // Two to four ### headings, each with something under it, become cards.
    const cards = [];
    for (const b of blockList) {
      if (b.type === 'h' && b.level >= 3) cards.push({ h: b, items: [] });
      else if (cards.length) cards[cards.length - 1].items.push(b);
    }
    body = `${eb}${head ? render(head, reveal) : ''}<div class="columns cards">${cards.map(c => `<div class="card${reveal.left-- > 0 ? ' reveal' : ''}"><h3>${inline(c.h.text)}</h3>${c.items.map(b => render(b, { left: 0 })).join('')}</div>`).join('')}</div>`;
  } else {
    // Everything else: a heading, then each block in order. A short lone paragraph reads as a lede.
    const paras = blockList.filter(b => b.type === 'p');
    const lede =
      paras.length === 1 &&
      blockList.length <= 2 &&
      plainText(paras[0].text).length <= 160 &&
      !kinds.includes('code') &&
      !kinds.includes('table');
    body =
      eb +
      (head ? render(head, reveal) : '') +
      blockList
        .map(b =>
          lede && b === paras[0]
            ? `<p class="lede narrow">${inline(b.text)}</p>`
            : render(b, reveal),
        )
        .join('');
    if (!head && blockList.length === 1 && blockList[0].type === 'p')
      classes.push('centered', 'statement');
  }

  const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
  const aside = notes ? `\n  <aside>${escapeHtml(notes)}</aside>` : '';
  return `<section${cls}${attrs.length ? ' ' + attrs.join(' ') : ''}>\n  ${body}${aside}\n</section>`;
}

function titleCard(src, notes, meta) {
  const blockList = blocks(src);
  const h1 = blockList.find(b => b.type === 'h' && b.level === 1);
  const sub3 = blockList.filter(b => b.type === 'h' && b.level >= 2 && b !== h1);
  const paras = blockList.filter(b => b.type === 'p');
  const title = meta.title || (h1 ? h1.text : 'Untitled');
  const eyebrow =
    meta.event ||
    meta.eyebrow ||
    (sub3[0] && blockList.indexOf(sub3[0]) < blockList.indexOf(h1) ? sub3[0].text : '');
  const subtitle =
    meta.subtitle ||
    (paras[0] && paras[0].text) ||
    (sub3.find(b => blockList.indexOf(b) > blockList.indexOf(h1)) || {}).text ||
    '';
  const credit = meta.author || meta.credit || (paras[1] && paras[1].text) || '';
  return `<header class="title-card"${meta.voice ? ` data-voice="${escapeHtml(meta.voice)}"` : ''}>
  ${eyebrow ? `<p class="eyebrow">${inline(eyebrow)}</p>` : ''}
  <h1>${inline(title)}</h1>
  <hr class="rule">
  ${subtitle ? `<p class="sub">${inline(subtitle)}</p>` : ''}
  ${credit ? `<p class="credit">${inline(credit)}</p>` : ''}${notes ? `\n  <aside>${escapeHtml(notes)}</aside>` : ''}
</header>`;
}

/* ---------- your own colors and fonts ---------- */

// Front matter can restyle any theme: accent, background, text, font and
// body-font. Everything else in the theme follows from those.
export const BRAND_KEYS = ['accent', 'background', 'text', 'font', 'body-font'];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FONT = /^[A-Za-z0-9][\w ]{0,39}$/;
const fontStack = (name, fallback) => `'${name}', ${fallback}`;

/**
 * The front matter's own colors and fonts as a <style> tag that goes before the
 * deck, or '' when there are none. Invalid values are skipped here and
 * reported by checkMarkdown. Softer text, lines and card fills are mixed from
 * the background and text colors, so three colors restyle a whole theme.
 *
 * @param {object} meta  The front matter.
 * @returns {string} HTML
 */
export function brandStyle(meta) {
  const v = {},
    imports = [];
  const c = k => (HEX.test(meta[k] || '') ? meta[k] : null);
  if (c('background')) {
    const bg = c('background');
    Object.assign(v, {
      '--sh-bg': bg,
      '--sh-gate': bg,
      '--sh-ink': `color-mix(in srgb, ${bg} 82%, #000)`,
      '--sh-dim': `color-mix(in srgb, ${bg} 60%, transparent)`,
      '--sh-fill': `color-mix(in srgb, ${bg} 70%, var(--sh-text))`,
    });
  }
  if (c('text')) Object.assign(v, { '--sh-text': c('text') });
  if (c('background') || c('text'))
    Object.assign(v, {
      '--sh-soft': 'color-mix(in srgb, var(--sh-text) 82%, var(--sh-bg))',
      '--sh-muted': 'color-mix(in srgb, var(--sh-text) 58%, var(--sh-bg))',
      '--sh-line': 'color-mix(in srgb, var(--sh-text) 16%, transparent)',
      '--sh-frame': 'color-mix(in srgb, var(--sh-text) 24%, var(--sh-bg))',
      '--sh-fill': 'color-mix(in srgb, var(--sh-text) 5%, var(--sh-bg))',
    });
  if (c('accent'))
    Object.assign(v, {
      '--sh-accent': c('accent'),
      '--sh-accent-strong': c('accent'),
      '--sh-glow': `color-mix(in srgb, ${c('accent')} 16%, transparent)`,
    });
  for (const [key, prop, fallback] of [
    ['font', '--sh-display', 'Georgia, serif'],
    ['body-font', '--sh-ui', "'Helvetica Neue', Arial, sans-serif"],
  ]) {
    const name = (meta[key] || '').trim();
    if (!FONT.test(name)) continue;
    v[prop] = fontStack(name, fallback);
    imports.push(
      `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}&display=swap');`,
    );
  }
  const vars = Object.entries(v)
    .map(([k, x]) => `${k}: ${x};`)
    .join(' ');
  if (!vars) return '';
  return `<style class="sh-brand">${imports.join('')}:root { ${vars} }</style>`;
}

/**
 * Lays settings over a file's front matter, replacing any it already has and
 * adding a front matter block when there is none. The start page uses it to
 * apply the colors and fonts from its fields without touching what was typed.
 *
 * @param {string} text  The Markdown.
 * @param {Record<string, string>} settings  Front matter keys and values.
 * @returns {string} The Markdown with the settings in place.
 */
export function withFrontMatter(text, settings) {
  const keys = Object.keys(settings);
  if (!keys.length) return text;
  const lines = keys.map(key => `${key}: ${settings[key]}`);
  const match = text.match(FRONT_MATTER);
  if (!match) return `---\n${lines.join('\n')}\n---\n\n${text}`;
  const isReplaced = line => keys.some(key => new RegExp(`^\\s*${key}\\s*:`, 'i').test(line));
  const kept = match[1].split(/\r?\n/).filter(line => !isReplaced(line));
  return `---\n${[...kept, ...lines].join('\n')}\n---\n${text.slice(match[0].length)}`;
}

/* ---------- the whole deck ---------- */

// The first slide is the title card when it leads with a # heading and has
// little else on it, at most two short lines.
function isTitleCard(blockList) {
  return (
    blockList.some(b => b.type === 'h' && b.level === 1) &&
    blockList.every(b => b.type === 'h' || b.type === 'p') &&
    blockList.filter(b => b.type === 'p').length <= 2
  );
}

/**
 * Turns a whole Markdown file into the HTML for one deck.
 *
 * @param {string} text  The Markdown, front matter and all.
 * @returns {{ html: string, meta: object }}  The deck's HTML, ready to put in a
 *   page with stagehand.css and stagehand.js, and its settings. meta has the
 *   front matter's keys plus `title`, `slides` (how many, not counting the
 *   title card) and `firstIsCard` (whether the file's first slide became it).
 */
export function markdownToDeck(text) {
  const { meta, body } = frontMatter(String(text || ''));
  const slides = splitSlides(body).map(takeNotes);
  let card = '';
  let firstIsCard = false;
  if (slides.length && isTitleCard(blocks(slides[0].src))) {
    const first = slides.shift();
    card = titleCard(first.src, first.notes, meta);
    firstIsCard = true;
    const heading = blocks(first.src).find(b => b.type === 'h' && b.level === 1);
    if (!meta.title) meta.title = plainText(heading.text);
  }
  if (!card && meta.title) card = titleCard('', '', meta);
  const title = meta.title || 'Untitled';
  const sections = slides.map((s, i) => slideHTML(s.src, s.notes, i));
  const attrs = [
    `data-title="${escapeHtml(title)}"`,
    `data-length="${escapeHtml(meta.length || meta.minutes || Math.max(3, Math.round(sections.length * 0.75)))}"`,
  ];
  if (meta.sound) attrs.push(`data-sound="${escapeHtml(meta.sound)}"`);
  if ((meta.numbers || '').toLowerCase() === 'off') attrs.push('data-numbers="off"');
  if (
    (meta.grain || '').toLowerCase() === 'off' ||
    ((meta.theme || '').toLowerCase() !== 'classic' && meta.grain !== 'on')
  )
    attrs.push('data-grain="off"');
  const brand = brandStyle(meta);
  const html = `${brand ? brand + '\n\n' : ''}<div class="deck" ${attrs.join(' ')}>\n\n${card ? card + '\n\n' : ''}${sections.join('\n\n')}\n\n</div>`;
  return { html, meta: { ...meta, title, slides: sections.length, firstIsCard } };
}

// Shrinks the type on any slide whose words run past the bottom edge.
// Returns what it did to each slide: '' fits, 'dense' or 'denser' was shrunk,
// 'over' still runs off the slide at the smallest size.
export function fitSlides(deck) {
  const out = [];
  for (const s of deck.querySelectorAll(':scope > section')) {
    let step = '';
    for (const next of ['dense', 'denser']) {
      if (s.scrollHeight <= s.clientHeight + 2) break;
      s.classList.add(next);
      step = next;
    }
    out.push(step && s.scrollHeight > s.clientHeight + 2 ? 'over' : step);
  }
  return out;
}

/* ---------- checking a deck ---------- */

// How much is too much on one slide. The start page and the Claude skill both
// quote these, so change them together.
export const LIMITS = { words: 70, listItems: 6, headingWords: 12 };

// The words someone in the room would read on a slide, leaving out code and tables.
function visibleWordCount(blockList) {
  const text = blockList
    .map(b => {
      if (b.type === 'list') return b.items.join(' ');
      if (b.type === 'quote') return b.lines.join(' ');
      if (b.type === 'h' || b.type === 'p') return b.text;
      return '';
    })
    .join(' ');
  return plainText(text)
    .split(/\s+/)
    .filter(word => /\w/.test(word)).length;
}

/**
 * Looks for problems before you present: settings it does not understand,
 * code blocks left open, slides that say too much and clicks with nothing to
 * reveal. Problems that only show once the slides are laid out, like a slide
 * running off the bottom or a picture that will not load, are found by md.js.
 *
 * @param {string} text  The Markdown.
 * @returns {{ issues: Array<{ slide: number, line: number, level: 'error'|'warn', message: string, kind: string }>,
 *   slides: number, firstIsCard: boolean, lines: number[] }}
 *   Each issue names its slide, counted from 1 in file order (0 for the
 *   settings at the top), and the line in the file. `lines` holds the line each
 *   slide starts on.
 */
export function checkMarkdown(text) {
  const issues = [];
  const add = (slide, line, level, message, kind = '') =>
    issues.push({ slide, line, level, message, kind });
  const { meta, body, offset } = frontMatter(String(text || ''));

  // The settings at the top.
  if (meta.theme && !THEMES[meta.theme.toLowerCase()]) {
    add(
      0,
      0,
      'warn',
      `The theme "${meta.theme}" is not one we have. Use classic, paper or signal.`,
    );
  }
  for (const key of ['accent', 'background', 'text']) {
    if (meta[key] && !HEX.test(meta[key])) {
      add(0, 0, 'error', `${key} needs a color like #FF5A36, so "${meta[key]}" is ignored.`);
    }
  }
  for (const key of ['font', 'body-font']) {
    if (meta[key] && !FONT.test(meta[key].trim())) {
      add(0, 0, 'error', `${key} needs a font name from Google Fonts, like Space Grotesk.`);
    }
  }
  if (meta.length && !/^\d+(\.\d+)?$/.test(meta.length)) {
    add(0, 0, 'warn', 'length should be a number of minutes, like 10.');
  }

  // Each slide.
  const parts = splitWithLines(body);
  const firstIsCard = parts.length > 0 && isTitleCard(blocks(takeNotes(parts[0].text).src));

  parts.forEach((part, index) => {
    const slide = index + 1;
    const firstLine = offset + part.line + 1;
    const lines = part.text.split('\n');
    const leadingBlank = lines.findIndex(line => line.trim());
    // The file's line number of the first line in this slide that matches.
    const lineOf = pattern => {
      const k = lines.findIndex(line => pattern.test(line));
      return k < 0 ? firstLine : firstLine + k - leadingBlank;
    };

    const fences = lines.filter(line => /^\s*(```|~~~)/.test(line)).length;
    if (fences % 2) {
      add(
        slide,
        lineOf(/^\s*(```|~~~)/),
        'error',
        'A code block is never closed. Add ``` on its own line after the code.',
      );
    }

    const { src, notes } = takeNotes(part.text);
    const blockList = blocks(src);

    for (const b of blockList) {
      if (
        b.type === 'h' &&
        b.level <= 2 &&
        plainText(b.text).split(/\s+/).length > LIMITS.headingWords
      ) {
        add(
          slide,
          lineOf(/^#{1,2}\s/),
          'warn',
          'This heading is long. Try eight words or fewer and move the rest to your notes.',
        );
      }
      if (b.type === 'list' && b.items.length > LIMITS.listItems) {
        add(
          slide,
          lineOf(/^\s*([-*+]|\d+[.)])\s/),
          'warn',
          `This list has ${b.items.length} items. Five or fewer read better, or split it over two slides.`,
        );
      }
    }

    const words = visibleWordCount(blockList);
    if (words > LIMITS.words) {
      add(
        slide,
        firstLine,
        'warn',
        `About ${words} words on one slide. Move some to your notes, which only you see.`,
        'words',
      );
    }

    // The title card has nothing to reveal, so its clicks are not counted.
    const clicks = (notes.match(/\(click\)/gi) || []).length;
    if (clicks && !(index === 0 && firstIsCard)) {
      const reveals = (slideHTML(src, notes, index).match(/\breveal\b/g) || []).length;
      if (clicks > reveals) {
        add(
          slide,
          lineOf(/\(click\)/i),
          'warn',
          `Your notes have ${clicks} (click) cues but the slide has ${reveals || 'nothing'} to reveal. Extra clicks just move on.`,
        );
      }
    }
  });

  return {
    issues,
    slides: parts.length,
    firstIsCard,
    lines: parts.map(part => offset + part.line + 1),
  };
}

export const THEMES = {
  classic: { name: 'Classic', note: 'Dark, warm and quiet' },
  paper: { name: 'Paper', note: 'Light and editorial' },
  signal: { name: 'Signal', note: 'Bold and bright' },
};
