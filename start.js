/*
 * start.js
 *
 * Runs the start page, index.html. Someone drops or pastes Markdown, picks a
 * design and maybe their own colors, and sees the slides as they type, with
 * any problems listed above them.
 *
 * The preview, Present and Save as PDF all open md.html with the deck's id.
 * The Markdown itself waits for md.html in this browser's localStorage, under
 * stagehand:md:<id>, so nothing is ever uploaded.
 *
 * Sections, top to bottom:
 *
 *   state and helpers
 *   adding Markdown        the file, drag and drop, pasting and the example
 *   the preview            md.html in an iframe, refreshed as you type
 *   checks                 problems from checkMarkdown plus what the preview found
 *   notes for Claude       click a slide in the preview, write what should change
 *   your own colors        the color and font fields, laid over the front matter
 *   designs                the template cards further down the page
 *   present and save       Present, Save as PDF and Save as HTML
 *   copy buttons and start
 */

import { markdownToDeck, checkMarkdown, withFrontMatter, THEMES } from './markdown.js';
import { track } from './experiments-web.js';

/* ---------- state and helpers ---------- */

const LAST_DECK_KEY = 'stagehand:make:last'; // the last Markdown, restored on the next visit
const NOTES_KEY = 'stagehand:make:notes'; // notes for Claude on that Markdown
const PREVIEW_DELAY_MS = 250; // waits for a pause in typing before redrawing the preview
const PREVIEW_MIN_HEIGHT = 480;

const $ = id => document.getElementById(id);
const dropZone = $('drop');
const fileInput = $('file');
const textArea = $('text');
const previewFrame = $('frame');

let markdown = ''; // exactly what they dropped or typed
let fileName = 'deck'; // used to name a saved HTML file
const brand = {}; // their own colors and fonts, by front matter key, from the fields
let fileChecks = { issues: [], lines: [], firstIsCard: false }; // from checkMarkdown
let previewReport = null; // what md.html found laying the slides out, or null while it loads
let notes = []; // notes for Claude: { slide, line, title, text }

// The Markdown that gets presented: theirs, with their own colors and fonts laid
// over its front matter. What they wrote is never changed.
const deckMarkdown = () => withFrontMatter(markdown, brand);

// The design picked on the page, or the file's own theme line, or Classic.
function chosenTheme() {
  const picked = document.querySelector('input[name=theme]:checked').value;
  if (picked !== 'auto') return picked;
  const own = (markdownToDeck(markdown).meta.theme || '').toLowerCase();
  return THEMES[own] ? own : 'classic';
}

// Puts the deck where md.html can read it and returns its id. The id is a hash
// of the Markdown, so the same deck always gets the same id.
function storeDeck() {
  const text = deckMarkdown();
  const id = hash(text);
  try {
    localStorage.setItem(`stagehand:md:${id}`, text);
    localStorage.setItem(LAST_DECK_KEY, JSON.stringify({ md: markdown, name: fileName }));
  } catch {
    // Private windows can refuse storage. The page still works without it.
  }
  return id;
}

const deckUrl = view =>
  `md.html?id=${storeDeck()}&theme=${chosenTheme()}${view ? `&view=${view}` : ''}`;

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* ---------- adding Markdown ---------- */

// Everything that changes the Markdown comes through here.
function useMarkdown(text, name) {
  markdown = text;
  if (name) fileName = name.replace(/\.(md|markdown|txt)$/i, '') || 'deck';
  if (textArea.value !== markdown) textArea.value = markdown;

  const hasSlides = markdown.trim().length > 0;
  for (const id of ['present', 'pdf', 'save']) $(id).disabled = !hasSlides;
  if (!hasSlides) return showEmptyPreview();

  const { meta } = markdownToDeck(markdown);
  dropZone.classList.add('has');
  $('dropTitle').textContent = name || meta.title;
  $('dropNote').textContent = 'Drop another to replace it';
  $('previewTitle').textContent = meta.title;
  $('previewCount').textContent = `${meta.slides} ${meta.slides === 1 ? 'slide' : 'slides'}`;

  $('notes').hidden = false;
  fillColorFields();
  fileChecks = checkMarkdown(markdown);
  drawChecks();
  schedulePreview();
}

function showTab(paste) {
  $('tabFile').setAttribute('aria-selected', String(!paste));
  $('tabPaste').setAttribute('aria-selected', String(paste));
  $('paneFile').hidden = paste;
  $('panePaste').hidden = !paste;
  if (paste) textArea.focus();
}
$('tabFile').addEventListener('click', () => showTab(false));
$('tabPaste').addEventListener('click', () => showTab(true));

async function readFile(file) {
  if (!file) return;
  setNotes([]);
  useMarkdown(await file.text(), file.name);
  showTab(false);
  track('made-a-deck-from-markdown');
}

dropZone.addEventListener('click', event => {
  if (event.target !== fileInput) fileInput.click();
});
dropZone.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  fileInput.click();
});
fileInput.addEventListener('change', () => readFile(fileInput.files[0]));

// A file dropped anywhere on the page counts, not only on the drop zone.
for (const type of ['dragenter', 'dragover']) {
  addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add('over');
  });
}
for (const type of ['dragleave', 'drop']) {
  addEventListener(type, event => {
    event.preventDefault();
    if (type === 'drop' || !event.relatedTarget) dropZone.classList.remove('over');
  });
}
addEventListener('drop', event => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  readFile(file);
  $('start').scrollIntoView();
});

let hasPasted = false;
textArea.addEventListener('input', () => {
  useMarkdown(textArea.value);
  if (!hasPasted && textArea.value.trim()) {
    hasPasted = true;
    track('pasted-markdown');
  }
});

$('example').addEventListener('click', async () => {
  const response = await fetch('example.md');
  setNotes([]);
  useMarkdown(await response.text(), 'example.md');
});

/* ---------- the preview ---------- */

let previewTimer;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewReport = null;
    previewFrame.style.height = '';
    previewFrame.src = deckUrl('grid');
    previewFrame.hidden = false;
    $('empty').hidden = true;
  }, PREVIEW_DELAY_MS);
}

function showEmptyPreview() {
  previewFrame.hidden = true;
  $('notes').hidden = true;
  $('empty').hidden = false;
  $('checks').hidden = true;
  $('previewTitle').textContent = 'Preview';
  $('previewCount').textContent = '';
}

// md.html reports its height and what it found, once laid out and again once
// every picture has loaded or failed. See reportToStartPage in md.js.
addEventListener('message', event => {
  if (event.source !== previewFrame.contentWindow) return;
  if (event.data?.type === 'stagehand-pick') return startNote(event.data);
  if (event.data?.type !== 'stagehand-grid') return;
  previewFrame.style.height = `${Math.max(PREVIEW_MIN_HEIGHT, event.data.height)}px`;
  previewReport = event.data;
  drawChecks();
  markNotedSlides();
});

/* ---------- checks ---------- */

// The preview counts slides from 0 and leaves out the title card. Problems and
// notes count from 1 in file order, with the title card first when the file's
// first slide is it.
const slideNumber = i => i + 1 + (fileChecks.firstIsCard ? 1 : 0);
const slideLine = i => fileChecks.lines[slideNumber(i) - 1] || 0;

// Every problem worth showing: what checkMarkdown read in the file, plus what
// the preview found when it laid the slides out, sorted by line.
function collectProblems() {
  let problems = [...fileChecks.issues];
  if (!previewReport) return problems;

  previewReport.fit.forEach((fit, i) => {
    if (fit === 'over') {
      problems.push({
        slide: slideNumber(i),
        line: slideLine(i),
        level: 'error',
        message:
          'Runs off the bottom of the slide, even at the smallest size. Split it in two, or move words to your notes.',
      });
    } else if (fit === 'denser') {
      problems.push({
        slide: slideNumber(i),
        line: slideLine(i),
        level: 'warn',
        message:
          'Has so much on it that the type was shrunk twice to fit. It may be hard to read from the back of the room.',
      });
    }
  });

  // A slide the preview had to shrink already says it has too much, so the
  // word count for it would only repeat that.
  const crowded = new Set(
    previewReport.fit.map((fit, i) => (fit === 'over' || fit === 'denser' ? slideNumber(i) : 0)),
  );
  problems = problems.filter(p => !(p.kind === 'words' && crowded.has(p.slide)));

  const fileLines = markdown.split('\n');
  const lineMentioning = (from, text) => {
    for (let k = Math.max(0, from - 1); k < fileLines.length; k++) {
      if (fileLines[k].includes(text)) return k + 1;
    }
    return from;
  };
  const reported = new Set();
  for (const picture of previewReport.broken || []) {
    if (reported.has(picture.src)) continue;
    reported.add(picture.src);
    problems.push({
      slide: slideNumber(picture.i),
      line: lineMentioning(slideLine(picture.i), picture.src),
      level: 'warn',
      message: `The picture ${picture.src} isn't showing. Use a full https address, or keep the file beside your saved HTML deck.`,
    });
  }

  return problems.sort((a, b) => (a.line || 0) - (b.line || 0));
}

function drawChecks() {
  const box = $('checks');
  const problems = collectProblems();
  const errors = problems.filter(p => p.level === 'error').length;

  box.className = `checks${errors ? ' error' : problems.length ? ' warn' : ''}`;
  const summary = problems.length
    ? `${problems.length} ${problems.length === 1 ? 'thing' : 'things'} to look at${errors ? `, ${errors} that will show wrong` : ''}.`
    : 'Looks good. Nothing to fix.';
  const items = problems.map(
    p => `
      <li class="${p.level}">
        <button type="button" data-line="${p.line || 1}">
          <b>${p.slide ? `Slide ${p.slide}, line ${p.line}` : 'Settings at the top'}</b>
          <span>${escapeHtml(p.message)}</span>
        </button>
      </li>`,
  );
  box.innerHTML = `<div class="sum"><span class="dot"></span>${summary}</div>${items.length ? `<ul>${items.join('')}</ul>` : ''}`;
  box.hidden = false;
}

// Clicking a problem opens the paste tab with that line selected, ready to fix.
$('checks').addEventListener('click', event => {
  const button = event.target.closest('[data-line]');
  if (button) jumpToLine(Number(button.dataset.line));
});

function jumpToLine(lineNumber) {
  showTab(true);
  const lines = textArea.value.split('\n');
  const index = Math.max(1, lineNumber) - 1;
  const start = lines.slice(0, index).join('\n').length + (index ? 1 : 0);
  textArea.focus();
  textArea.setSelectionRange(start, start + (lines[index] || '').length);
  const lineHeight = parseFloat(getComputedStyle(textArea).lineHeight) || 20;
  textArea.scrollTop = Math.max(0, index * lineHeight - textArea.clientHeight / 3);
  if (innerWidth < 900) textArea.scrollIntoView({ block: 'center' });
}

/* ---------- notes for Claude ---------- */

// Click a slide in the preview, say what should change, and repeat. Copy notes
// for Claude bundles them with the whole deck, ready to paste into Claude
// with the Stagehand skill. The deck is in the message, so nothing needs attaching.
let noteTarget = null; // the slide a note is being written for

function startNote({ i, title }) {
  const isCard = i < 0;
  noteTarget = {
    i,
    slide: isCard ? (fileChecks.firstIsCard ? 1 : 0) : slideNumber(i),
    line: isCard ? fileChecks.lines[0] || 1 : slideLine(i),
    title,
  };
  $('noteFor').textContent = noteLabel(noteTarget);
  $('noteForm').hidden = false;
  $('noteText').value = '';
  $('noteText').focus();
}

const noteLabel = note =>
  `${note.slide ? `slide ${note.slide}` : 'the title card'}${note.title ? `, "${note.title}"` : ''}`;

$('noteForm').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('noteText').value.trim();
  if (!text || !noteTarget) return;
  setNotes([...notes, { ...noteTarget, text }]);
  $('noteForm').hidden = true;
  track('left-a-note-for-claude', { once: true });
});
$('cancelNote').addEventListener('click', () => ($('noteForm').hidden = true));
$('clearNotes').addEventListener('click', () => setNotes([]));
$('noteList').addEventListener('click', event => {
  const button = event.target.closest('[data-remove]');
  if (button) setNotes(notes.filter((_, k) => k !== Number(button.dataset.remove)));
});
$('copyNotes').addEventListener('click', () => {
  copyFrom($('copyNotes'), notesForClaude());
  track('copied-notes-for-claude');
});

function setNotes(next) {
  notes = next;
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    // Notes still work for this visit.
  }
  $('noteList').innerHTML = notes
    .map(
      (note, k) => `
      <li>
        <b>${note.slide ? `Slide ${note.slide}` : 'Title card'}</b>
        <span>${escapeHtml(note.text)}</span>
        <button type="button" data-remove="${k}" aria-label="Remove this note">×</button>
      </li>`,
    )
    .join('');
  $('copyNotes').hidden = $('clearNotes').hidden = !notes.length;
  $('notesHint').textContent = notes.length
    ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} for Claude. Click another slide to add more.`
    : 'Want Claude to change something? Click a slide to leave it a note.';
  markNotedSlides();
}

// Tells the preview which slides have notes, so it can mark them.
function markNotedSlides() {
  previewFrame.contentWindow?.postMessage(
    { type: 'stagehand-noted', indices: notes.map(note => note.i) },
    '*',
  );
}

// The message to paste into Claude: the notes, then the whole deck.
function notesForClaude() {
  const deck = deckMarkdown();
  const longestRun = Math.max(2, ...(deck.match(/`+/g) || []).map(run => run.length));
  const fence = '`'.repeat(longestRun + 1);
  const list = notes.map(
    (note, k) => `${k + 1}. On ${noteLabel(note)} (line ${note.line}): ${note.text}`,
  );
  return [
    'Use the Stagehand skill to make these changes to my deck. Keep everything I did not mention as it is, and hand back the whole Markdown file.',
    '',
    ...list,
    '',
    'My deck:',
    '',
    `${fence}markdown`,
    deck,
    fence,
  ].join('\n');
}

/* ---------- your own colors ---------- */

// What each design starts with, in the order of the color fields: accent,
// background, text. Keep these in step with themes/*.css.
const THEME_COLORS = {
  classic: ['#C9A15A', '#0D0C0A', '#EDE6D8'],
  paper: ['#B3402A', '#F3EEE4', '#1C1A16'],
  signal: ['#FF5A36', '#111116', '#FFFFFF'],
};
const colorFields = [...document.querySelectorAll('#custom .field')];
const brandLines = () => Object.entries(brand).map(([key, value]) => `${key}: ${value}`);

// Fields they have not touched show what the deck is using now: the file's own
// setting, or the design's.
function fillColorFields() {
  const { meta } = markdownToDeck(markdown);
  const themeColors = THEME_COLORS[chosenTheme()] || THEME_COLORS.classic;
  colorFields.forEach((field, i) => {
    const key = field.dataset.key;
    const input = field.querySelector('input');
    if (key in brand) return;
    if (input.type === 'color') {
      input.value = /^#[0-9a-f]{6}$/i.test(meta[key] || '') ? meta[key] : themeColors[i];
    } else {
      input.placeholder = meta[key] || 'From the design';
    }
  });
}

function brandChanged() {
  colorFields.forEach(field => field.classList.toggle('set', field.dataset.key in brand));
  $('keep').hidden = !brandLines().length;
  $('keepLines').textContent = brandLines().join('\n');
  if (markdown) useMarkdown(markdown);
}

for (const field of colorFields) {
  const input = field.querySelector('input');
  // Colors update as the picker moves. Fonts wait until they finish typing.
  input.addEventListener(input.type === 'color' ? 'input' : 'change', () => {
    const value = input.value.trim();
    if (!value) delete brand[field.dataset.key];
    else brand[field.dataset.key] = value.startsWith('#') ? value.toUpperCase() : value;
    brandChanged();
    track('changed-the-colors', { once: true });
  });
}

$('resetBrand').addEventListener('click', () => {
  for (const key in brand) delete brand[key];
  for (const field of colorFields) {
    const input = field.querySelector('input');
    if (input.type === 'text') input.value = '';
  }
  fillColorFields();
  brandChanged();
});

/* ---------- designs ---------- */

// "Use with my Markdown" on a template card picks that design and scrolls up.
document.querySelectorAll('[data-use]').forEach(button =>
  button.addEventListener('click', () => {
    document.querySelector(`input[name=theme][value=${button.dataset.use}]`).checked = true;
    if (markdown) useMarkdown(markdown);
    $('start').scrollIntoView();
    const design = button.closest('.tpl').querySelector('h3').textContent;
    $('status').textContent = markdown
      ? `Showing your deck in ${design}.`
      : 'Now add your Markdown, or try our example.';
    track('picked-a-template');
  }),
);

document.querySelectorAll('input[name=theme]').forEach(radio =>
  radio.addEventListener('change', () => {
    if (markdown) useMarkdown(markdown);
  }),
);

// The template pictures are live pages, so they load only when nearly in view.
const lazyFrames = new IntersectionObserver(
  entries =>
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.src = entry.target.dataset.src;
      lazyFrames.unobserve(entry.target);
    }),
  { rootMargin: '400px' },
);
document.querySelectorAll('iframe[data-src]').forEach(frame => lazyFrames.observe(frame));

document
  .querySelectorAll('[data-demo]')
  .forEach(link => link.addEventListener('click', () => track('opened-the-demo')));
document
  .querySelectorAll('#contribute a')
  .forEach(link =>
    link.addEventListener('click', () => track('looked-at-contributing', { once: true })),
  );

/* ---------- present and save ---------- */

$('present').addEventListener('click', () => {
  window.open(deckUrl(), '_blank');
  $('status').textContent =
    'Opened in a new tab. Click the slides once to start, and your notes window opens.';
});

$('pdf').addEventListener('click', () => {
  window.open(deckUrl('print'), '_blank');
  $('status').textContent =
    'Opened every slide in a new tab. Choose Save as PDF in the print window, with background graphics on.';
  track('saved-a-deck-as-pdf');
});

$('save').addEventListener('click', () => {
  downloadFile(`${fileName.replace(/[^\w.-]+/g, '-')}.html`, deckPage(), 'text/html');
  $('status').textContent =
    'Saved. Open it from any web server, like GitHub Pages, and it presents the same way. Pictures need to sit beside it.';
  track('saved-a-deck-as-html');
});

// The deck as one HTML file that loads Stagehand from wherever this page is hosted.
function deckPage() {
  const { html, meta } = markdownToDeck(deckMarkdown());
  const base = new URL('.', location.href).href;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)}</title>
<!-- Made with Stagehand from Markdown. Edit the slides below, or add the Markdown at ${base} again. -->
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${base}stagehand.css">
<link rel="stylesheet" href="${base}themes/${chosenTheme()}.css">
</head>
<body>

${html}

<script type="module" src="${base}stagehand.js"><\/script>
</body>
</html>
`;
}

function downloadFile(name, contents, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([contents], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

/* ---------- copy buttons and start ---------- */

// Copies text and says so on the button for two seconds.
async function copyFrom(button, text) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Select and copy';
  }
  setTimeout(() => (button.textContent = label), 2000);
}

$('copyLines').addEventListener('click', () => copyFrom($('copyLines'), brandLines().join('\n')));

document.querySelectorAll('[data-copy]').forEach(button =>
  button.addEventListener('click', () => {
    copyFrom(button, $(button.dataset.copy).textContent);
    track('copied-the-claude-prompt');
  }),
);

// Pick up where they left off.
try {
  const last = JSON.parse(localStorage.getItem(LAST_DECK_KEY) || 'null');
  if (last?.md) {
    useMarkdown(last.md, `${last.name}.md`);
    setNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'));
  }
} catch {
  // Nothing saved, or storage is off.
}
