// Tests for markdown.js. Run them with `node --test` from the repository's root.
// No packages to install: node:test and node:assert come with Node 18 and later.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  markdownToDeck,
  checkMarkdown,
  brandStyle,
  withFrontMatter,
  inline,
  codeSteps,
} from '../markdown.js';

const example = readFileSync(new URL('../example.md', import.meta.url), 'utf8');

// The HTML for a deck made of these slides, after a title card.
const deckOf = (...slides) => markdownToDeck(['# Talk', ...slides].join('\n\n---\n\n')).html;

test('the first slide with only a # heading becomes the title card', () => {
  const { html, meta } = markdownToDeck('# My talk\n\nOne line on it\n\n---\n\n## Next');
  assert.match(html, /<header class="title-card"[^>]*>[\s\S]*<h1>My talk<\/h1>/);
  assert.match(html, /<p class="sub">One line on it<\/p>/);
  assert.equal(meta.title, 'My talk');
  assert.equal(meta.slides, 1);
  assert.equal(meta.firstIsCard, true);
});

test('front matter fills in the title card', () => {
  const { html, meta } = markdownToDeck(
    '---\ntitle: From settings\nauthor: Ran\nlength: 7\n---\n\n## One',
  );
  assert.equal(meta.title, 'From settings');
  assert.match(html, /<p class="credit">Ran<\/p>/);
  assert.match(html, /data-length="7"/);
});

test('slides split on --- lines, but never inside code', () => {
  const html = deckOf('## Code\n\n```yaml\n---\nkey: value\n```', '## After');
  assert.equal(html.match(/<section/g).length, 2);
});

test('without --- lines, each # or ## heading starts a slide', () => {
  const { meta } = markdownToDeck('# Talk\n\n## One\n\nText\n\n## Two\n\nMore');
  assert.equal(meta.slides, 2);
});

test('each layout rule picks the layout format.md promises', () => {
  const cases = [
    ['# 1. Why', /class="divider"[\s\S]*<p class="big-num">01<\/p>/],
    ['### Label\n## Heading\n\nA line under it.', /<p class="eyebrow">Label<\/p><h2>Heading<\/h2>/],
    ['## Heading\n\nA short lede.', /<p class="lede narrow">A short lede.<\/p>/],
    ['## Numbers\n\n- **68%** finish setup\n- **1.1** days', /<div class="columns stats">/],
    [
      '> The quote.\n> — Who said it',
      /<p class="quote">The quote.<\/p><p class="caption">Who said it<\/p>/,
    ],
    ['![A view](view.jpg)', /<div class="photo shade"><img src="view.jpg" alt="A view">/],
    ['## Side\n\n![A view](view.jpg)\n\nText beside it', /<div class="photo right">/],
    ['## Plan\n\n### Keep\nOne.\n\n### Change\nTwo.', /<div class="columns cards">/],
    ['## Team\n\n- **Team**: Three people\n- **Length**: Eight weeks', /<div class="rows">/],
    ['One sentence, nothing else.', /class="centered statement"/],
    ['## Data\n\n| A | B |\n| --- | --- |\n| 1 | 2 |', /<table class="table">/],
  ];
  for (const [slide, expected] of cases) assert.match(deckOf(slide), expected, slide);
});

test('notes become the script, and each (click) reveals one item', () => {
  const html = deckOf(
    '## Steps\n\n1. One\n2. Two\n3. Three\n\nNotes: First (click) second (click)',
  );
  assert.match(html, /<aside>First \(click\) second \(click\)<\/aside>/);
  assert.equal(html.match(/class="reveal"/g).length, 2);
});

test('HTML comments are notes too', () => {
  assert.match(deckOf('## Hi\n\n<!-- Say hello -->'), /<aside>Say hello<\/aside>/);
});

test('inline Markdown is escaped, so a slide cannot inject markup', () => {
  assert.equal(
    inline('**bold** and *accent* and `<b>code</b>`'),
    '<strong>bold</strong> and <em>accent</em> and <code>&lt;b&gt;code&lt;/b&gt;</code>',
  );
  assert.equal(inline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('brand colors and fonts become CSS variables', () => {
  const css = brandStyle({ accent: '#FF5A36', background: '#111116', font: 'Space Grotesk' });
  assert.match(css, /--sh-accent: #FF5A36;/);
  assert.match(css, /--sh-bg: #111116;/);
  assert.match(css, /--sh-display: 'Space Grotesk'/);
  assert.match(css, /family=Space\+Grotesk/);
});

test('invalid brand values are left out', () => {
  assert.equal(brandStyle({ accent: 'red', font: '</style><script>' }), '');
  assert.equal(brandStyle({}), '');
});

test('withFrontMatter replaces settings it is given and keeps the rest', () => {
  assert.equal(
    withFrontMatter('---\ntitle: X\naccent: #000000\n---\n# Hi', {
      accent: '#FFFFFF',
      font: 'Inter',
    }),
    '---\ntitle: X\naccent: #FFFFFF\nfont: Inter\n---\n# Hi',
  );
  assert.equal(withFrontMatter('# Hi', { accent: '#FFFFFF' }), '---\naccent: #FFFFFF\n---\n\n# Hi');
  assert.equal(withFrontMatter('# Hi', {}), '# Hi');
});

test('the example deck has nothing to fix', () => {
  assert.deepEqual(checkMarkdown(example).issues, []);
});

test('checks name the slide and the line of each problem', () => {
  const text = [
    '---',
    'title: T',
    'accent: blue',
    '---',
    '', // lines 1 to 5
    '# T',
    '',
    '---',
    '', // the title card, slide 1
    '## Long list',
    '', // slide 2 starts on line 10
    ...Array.from({ length: 8 }, (_, k) => `- item ${k}`), // the list starts on line 12
    '',
    'Notes: (click) and (click)',
    '',
    '---',
    '',
    '## Code',
    '',
    '```js',
    'open()', // the fence is on line 27
  ].join('\n');
  const { issues } = checkMarkdown(text);
  const find = start => issues.find(issue => issue.message.startsWith(start));

  assert.deepEqual([find('accent needs').slide, find('accent needs').level], [0, 'error']);
  assert.deepEqual([find('This list has 8').slide, find('This list has 8').line], [2, 12]);
  assert.deepEqual([find('A code block').slide, find('A code block').line], [3, 27]);
  assert.equal(find('Your notes have'), undefined, 'eight items is plenty for two clicks');
});

test('more (click) cues than things to reveal is flagged', () => {
  const { issues } = checkMarkdown('# T\n\n---\n\n## Just a heading\n\nNotes: (click) (click)');
  assert.match(issues[0].message, /2 \(click\) cues but the slide has nothing to reveal/);
});

test('crowded slides and long headings are flagged', () => {
  const words = Array.from({ length: 80 }, () => 'word').join(' ');
  const heading = Array.from({ length: 14 }, () => 'word').join(' ');
  const { issues } = checkMarkdown(`# T\n\n---\n\n## ${heading}\n\n${words}`);
  assert.ok(issues.some(issue => issue.kind === 'words'));
  assert.ok(issues.some(issue => issue.message.startsWith('This heading is long')));
});

test('code steps become hidden reveals that name their lines', () => {
  const html = deckOf('## Code\n\n```js {1|2-3}\na()\nb()\nc()\n```\n\nNotes: (click) (click)');
  assert.match(html, /<pre class="code stepped">/);
  assert.match(html, /<i class="code-step reveal" data-lines="1"><\/i>/);
  assert.match(html, /<i class="code-step reveal" data-lines="2 3"><\/i>/);
  assert.match(html, /<span class="ln" data-n="3">c\(\)<\/span>/);
});

test('code steps only take the clicks the notes have', () => {
  const html = deckOf('## Code\n\n```js {1|2|3}\na()\nb()\nc()\n```\n\nNotes: (click)');
  assert.equal(html.match(/code-step/g).length, 1);
});

test('codeSteps reads single lines, ranges and lists', () => {
  assert.deepEqual(codeSteps('1|3-4|6,8'), [[1], [3, 4], [6, 8]]);
  assert.deepEqual(codeSteps(''), []);
});

test('code steps that name a missing line are flagged', () => {
  const { issues } = checkMarkdown('# T\n\n---\n\n## Code\n\n```js {1|9}\na()\n```');
  assert.match(issues[0].message, /The steps name line 9, but this code has 1 line/);
});

test('motion: off reaches the deck', () => {
  assert.match(markdownToDeck('---\nmotion: off\n---\n\n## Hi').html, /data-motion="off"/);
});
