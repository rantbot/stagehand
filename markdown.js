/*
 * markdown.js
 *
 * Turns a Markdown file into a Stagehand deck. No libraries, no build step.
 * It reads ordinary Markdown and picks a layout for each slide from what is
 * on it, so a lone number becomes a big stat and a quote becomes a pull quote.
 * README.md beside this file lists every rule. example.md shows them all.
 *
 *   import { markdownToDeck } from './markdown.js';
 *   const { html, meta } = markdownToDeck(text);
 */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Inline Markdown: code, images, links, bold, italics. Escapes everything else.
export function inline(text) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)|(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, (m, p1, a, p3, b) => `${p1 ?? p3 ?? ''}<em>${a ?? b}</em>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${esc(codes[n])}</code>`);
}
const plain = s => String(s).replace(/[*_`]/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();

/* ---------- front matter and slides ---------- */

function frontMatter(text) {
  const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '');
  }
  return { meta, body: text.slice(m[0].length) };
}

// Splits on --- (or *** / ___) lines outside code. With none, splits before each # or ## heading.
function splitSlides(body) {
  const lines = body.split(/\r?\n/);
  let fence = false;
  const parts = [[]];
  const isRule = l => /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
  const hasRules = lines.some((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    return !fence && isRule(l);
  });
  fence = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!fence && hasRules && isRule(l)) { parts.push([]); continue; }
    if (!fence && !hasRules && /^#{1,2}\s/.test(l) && parts[parts.length - 1].some(x => x.trim())) parts.push([]);
    parts[parts.length - 1].push(l);
  }
  return parts.map(p => p.join('\n')).filter(p => p.replace(/<!--[\s\S]*?-->/g, '').trim() || /<!--/.test(p));
}

// Pulls the script out of a slide: HTML comments, and anything after a Notes: or ??? line.
function takeNotes(src) {
  const notes = [];
  src = src.replace(/<!--([\s\S]*?)-->/g, (_, c) => { notes.push(c.trim()); return ''; });
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

function blocks(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^\s*(```|~~~)\s*([\w-]*)/))) {
      const end = m[1]; const code = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(end)) code.push(lines[i++]);
      i++; out.push({ t: 'code', lang: m[2], text: code.join('\n') }); continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { out.push({ t: 'h', level: m[1].length, text: m[2] }); i++; continue; }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push({ t: 'quote', lines: q }); continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = row(l); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(row(lines[i++]));
      out.push({ t: 'table', head, rows }); continue;
    }
    if ((m = l.match(listRe))) {
      const ordered = /\d/.test(m[2]); const items = [];
      while (i < lines.length && lines[i].trim()) {
        const lm = lines[i].match(listRe);
        if (lm && lm[1].length < 2) items.push(lm[3]);
        else if (items.length) items[items.length - 1] += ' ' + lines[i].trim();
        else break;
        i++;
      }
      out.push({ t: 'list', ordered, items }); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*>|\s*```|\s*~~~)/.test(lines[i]) && !(para.length && listRe.test(lines[i]))) para.push(lines[i++].trim());
    const text = para.join(' ');
    const img = text.match(/^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/);
    out.push(img ? { t: 'img', alt: img[1], src: img[2] } : { t: 'p', text });
  }
  return out;
}

/* ---------- layouts ---------- */

const STAT = /^\s*(?:\*\*|__)?\s*([+\-−~]?[$€£]?\d[\d.,]*\s?(?:%|x|×|k|K|m|M|B|bn)?\+?)\s*(?:\*\*|__)?\s*[—–:-]?\s*(.*)$/;
const ROW = /^\s*(?:\*\*|__)?([^*_:]{1,28}?)(?:\*\*|__)?\s*:\s+(.+)$/;
const statOf = s => { const m = s.match(STAT); return m && m[2] && plain(m[2]).length > 1 ? { n: m[1].trim(), text: m[2] } : null; };

function render(b, reveal) {
  const r = () => (reveal.left-- > 0 ? ' reveal' : '');
  switch (b.t) {
    case 'h': return b.level <= 2 ? `<h2>${inline(b.text)}</h2>` : `<h3>${inline(b.text)}</h3>`;
    case 'p': return `<p>${inline(b.text)}</p>`;
    case 'img': return `<img class="figure" src="${esc(b.src)}" alt="${esc(b.alt)}">`;
    case 'code': return `<pre class="code">${esc(b.text)}</pre>`;
    case 'quote': return `<p class="quote">${inline(b.lines.join(' '))}</p>`;
    case 'table': return `<table class="table"><thead><tr>${b.head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row => `<tr>${row.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'list': {
      if (b.items.length >= 2 && b.items.length <= 4 && b.items.every(statOf)) {
        return `<div class="columns stats">${b.items.map(it => { const s = statOf(it); return `<div class="stat${r()}"><b>${esc(s.n)}</b><p>${inline(s.text)}</p></div>`; }).join('')}</div>`;
      }
      if (b.items.length >= 2 && b.items.every(it => ROW.test(it))) {
        const pairs = b.items.map(it => it.match(ROW));
        return `<div class="rows">${pairs.map(m => { const c = r().trim(); return `<span class="${c}">${inline(m[1].trim())}</span><span class="${c}">${inline(m[2])}</span>`; }).join('')}</div>`;
      }
      return `<ol class="points narrow${b.ordered ? '' : ' dots'}">${b.items.map(it => `<li class="${r().trim()}"><p>${inline(it)}</p></li>`).join('')}</ol>`;
    }
  }
  return '';
}

function slideHTML(src, notes, index, ctx) {
  let bs = blocks(src);
  const clicks = (notes.match(/\(click\)/gi) || []).length;
  const reveal = { left: clicks };
  const attrs = [];
  const classes = [];

  // A ### before the slide's main heading is its eyebrow.
  let eyebrow = '';
  const main = bs.findIndex(b => b.t === 'h' && b.level <= 2);
  if (main > 0 && bs.slice(0, main).every(b => b.t === 'h' && b.level >= 3)) { eyebrow = bs[main - 1].text; bs.splice(0, main); }
  const head = bs[0] && bs[0].t === 'h' && bs[0].level <= 2 ? bs.shift() : null;
  const title = head ? plain(head.text) : '';
  if (title) attrs.push(`data-title="${esc(title)}"`);
  const eb = eyebrow ? `<p class="eyebrow">${inline(eyebrow)}</p>` : '';
  let body = '';

  const only = t => bs.length && bs.every(b => b.t === t);
  const kinds = bs.map(b => b.t);
  const img = bs.find(b => b.t === 'img');
  const quote = bs.find(b => b.t === 'quote');

  if (head && head.level === 1 || (head && !bs.length)) {
    // A heading on its own opens a section.
    classes.push('divider');
    const num = head.text.match(/^\s*(\d{1,2})[.):]?\s+(.+)$/);
    const n = num ? num[1].padStart(2, '0') : '';
    body = `${eb}${n ? `<p class="big-num">${n}</p>` : ''}<h1>${inline(num ? num[2] : head.text)}</h1>${bs.map(b => b.t === 'p' ? `<p class="lede">${inline(b.text)}</p>` : render(b, reveal)).join('')}`;
    if (num) attrs.push('data-number="off"');
  } else if (quote && bs.every(b => b === quote || b.t === 'p')) {
    // A pull quote. A last line starting with a dash, or a line after the quote, credits it.
    classes.push('centered');
    const lines = [...quote.lines];
    let credit = '';
    const dash = /^\s*(?:—|–|--|-)\s*(.+)$/;
    if (lines.length > 1 && dash.test(lines[lines.length - 1])) credit = lines.pop().match(dash)[1];
    const after = bs.filter(b => b.t === 'p').map(b => b.text.replace(dash, '$1')).join(' ');
    credit = credit || after;
    body = `${head ? `<p class="eyebrow">${inline(head.text)}</p>` : eb}<p class="quote">${inline(lines.join(' ').trim())}</p>${credit ? `<p class="caption">${inline(credit)}</p>` : ''}`;
  } else if (!head && bs.length === 1 && bs[0].t === 'p' && statOf(bs[0].text)) {
    const s = statOf(bs[0].text);
    body = `${eb}<div class="stat big"><b>${esc(s.n)}</b><p>${inline(s.text)}</p></div>`;
  } else if (img) {
    // A picture. On its own it fills the slide, with anything else beside it.
    const rest = bs.filter(b => b !== img);
    const full = !rest.length;
    const box = `<div class="photo ${full ? 'shade' : 'right'}"><img src="${esc(img.src)}" alt="${esc(img.alt)}"></div>`;
    const caption = img.alt && full ? `<p class="caption">${esc(img.alt)}</p>` : '';
    body = `${box}<div class="over-photo stack">${eb}${head ? render(head, reveal) : ''}${rest.map(b => render(b, reveal)).join('')}${full && !head ? caption : ''}</div>`;
    if (index % 2) classes.push('alt');
  } else if (bs.filter(b => b.t === 'h' && b.level >= 3).length >= 2 && bs[0].t === 'h') {
    // Two to four ### headings, each with something under it, become cards.
    const cards = [];
    for (const b of bs) {
      if (b.t === 'h' && b.level >= 3) cards.push({ h: b, items: [] });
      else if (cards.length) cards[cards.length - 1].items.push(b);
    }
    body = `${eb}${head ? render(head, reveal) : ''}<div class="columns cards">${cards.map(c => `<div class="card${reveal.left-- > 0 ? ' reveal' : ''}"><h3>${inline(c.h.text)}</h3>${c.items.map(b => render(b, { left: 0 })).join('')}</div>`).join('')}</div>`;
  } else {
    // Everything else: a heading, then each block in order. A short lone paragraph reads as a lede.
    const paras = bs.filter(b => b.t === 'p');
    const lede = paras.length === 1 && bs.length <= 2 && plain(paras[0].text).length <= 160 && !kinds.includes('code') && !kinds.includes('table');
    body = eb + (head ? render(head, reveal) : '') + bs.map(b => (lede && b === paras[0] ? `<p class="lede narrow">${inline(b.text)}</p>` : render(b, reveal))).join('');
    if (!head && bs.length === 1 && bs[0].t === 'p') classes.push('centered', 'statement');
  }

  const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
  const aside = notes ? `\n  <aside>${esc(notes)}</aside>` : '';
  return `<section${cls}${attrs.length ? ' ' + attrs.join(' ') : ''}>\n  ${body}${aside}\n</section>`;
}

function titleCard(src, notes, meta) {
  const bs = blocks(src);
  const h1 = bs.find(b => b.t === 'h' && b.level === 1);
  const sub3 = bs.filter(b => b.t === 'h' && b.level >= 2 && b !== h1);
  const paras = bs.filter(b => b.t === 'p');
  const title = meta.title || (h1 ? h1.text : 'Untitled');
  const eyebrow = meta.event || meta.eyebrow || (sub3[0] && bs.indexOf(sub3[0]) < bs.indexOf(h1) ? sub3[0].text : '');
  const subtitle = meta.subtitle || (paras[0] && paras[0].text) || (sub3.find(b => bs.indexOf(b) > bs.indexOf(h1)) || {}).text || '';
  const credit = meta.author || meta.credit || (paras[1] && paras[1].text) || '';
  return `<header class="title-card"${meta.voice ? ` data-voice="${esc(meta.voice)}"` : ''}>
  ${eyebrow ? `<p class="eyebrow">${inline(eyebrow)}</p>` : ''}
  <h1>${inline(title)}</h1>
  <hr class="rule">
  ${subtitle ? `<p class="sub">${inline(subtitle)}</p>` : ''}
  ${credit ? `<p class="credit">${inline(credit)}</p>` : ''}${notes ? `\n  <aside>${esc(notes)}</aside>` : ''}
</header>`;
}

/* ---------- the whole deck ---------- */

export function markdownToDeck(text) {
  const { meta, body } = frontMatter(String(text || ''));
  const raw = splitSlides(body);
  const slides = raw.map(takeNotes);
  let card = '';
  // The first slide is the title card when it leads with a # heading and has little else on it.
  if (slides.length) {
    const bs = blocks(slides[0].src);
    const isCard = bs.some(b => b.t === 'h' && b.level === 1) && bs.every(b => b.t === 'h' || b.t === 'p') && bs.filter(b => b.t === 'p').length <= 2;
    if (isCard) {
      const first = slides.shift();
      card = titleCard(first.src, first.notes, meta);
      if (!meta.title) meta.title = plain(bs.find(b => b.t === 'h' && b.level === 1).text);
    }
  }
  if (!card && meta.title) card = titleCard('', '', meta);
  const title = meta.title || 'Untitled';
  const sections = slides.map((s, i) => slideHTML(s.src, s.notes, i, meta));
  const attrs = [`data-title="${esc(title)}"`, `data-length="${esc(meta.length || meta.minutes || Math.max(3, Math.round(sections.length * 0.75)))}"`];
  if (meta.sound) attrs.push(`data-sound="${esc(meta.sound)}"`);
  if ((meta.numbers || '').toLowerCase() === 'off') attrs.push('data-numbers="off"');
  if ((meta.grain || '').toLowerCase() === 'off' || (meta.theme || '').toLowerCase() !== 'classic' && meta.grain !== 'on') attrs.push('data-grain="off"');
  const html = `<div class="deck" ${attrs.join(' ')}>\n\n${card ? card + '\n\n' : ''}${sections.join('\n\n')}\n\n</div>`;
  return { html, meta: { ...meta, title, slides: sections.length } };
}

// Shrinks the type on any slide whose words run past the bottom edge.
export function fitSlides(deck) {
  for (const s of deck.querySelectorAll(':scope > section')) {
    for (const step of ['dense', 'denser']) {
      if (s.scrollHeight <= s.clientHeight + 2) break;
      s.classList.add(step);
    }
  }
}

export const THEMES = {
  classic: { name: 'Classic', note: 'Dark, warm and quiet' },
  paper: { name: 'Paper', note: 'Light and editorial' },
  signal: { name: 'Signal', note: 'Bold and bright' },
};
