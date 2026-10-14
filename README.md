# Stagehand

A simpler alternative to Google Slides and PowerPoint. Write a talk in
Markdown, or hand it to Claude, and present it across two windows. The one you share
shows only the slides. The one you keep has your script, the next slide, a
timer and every control. A deck is one HTML file. There is no build step and
nothing to install.

Open it at https://rantbot.github.io/stagehand/. It is one of
thoughtbot's experiments, kept on Ran's account.

This repository is the whole tool:

```
index.html        the start page: drop or paste Markdown, pick a design, present or save it
start.js          runs the start page
md.html, md.js    show a Markdown file as a deck, a preview grid or pages to print
markdown.js       turns Markdown into slides, picks each slide's layout and checks it
format.md         the whole Markdown format, for people and for Claude
example.md        a Markdown deck that uses every layout
demo.html         the demo deck, which is also a full example of every feature
blank.html        a short starting deck to copy
template-paper.html   a light, editorial look for retros and case studies
template-signal.html  a bold, bright look for updates and pitches
themes/           classic.css, paper.css and signal.css
stagehand.js      the engine: the two windows, reveals, timer, script editing
stagehand.css     the stage, the slide kit and the presenter window
sound.js          optional sound beds and narration
experiments-web.js  anonymous usage counts for the experiments catalog
sample.svg        a placeholder picture for the photo layouts
skill/            the Claude skill that writes decks in this format
tests/            tests for markdown.js, run with `npm test`
```

CONTRIBUTING.md has a tour of how the code fits together.

## From Markdown

The quickest way in. Open the start page, drop in or paste a Markdown file, pick a look and
press Present. Save as HTML gives you a deck file that loads Stagehand from
this site, so it works wherever you host it.

Put a line with three dashes between slides, or leave them out and every `#`
or `##` heading starts a new slide. Each slide's layout comes from what is on
it.

[format.md](format.md) is the whole format, from the settings at the top to
how each slide picks its layout. It is the one copy kept current, and the
Claude skill reads it too. Your own colors and fonts go in the front matter with
`accent`, `background`, `text`, `font` and `body-font`, on top of any theme.

The start page checks the deck as you type, with each problem pointing to its
slide and line. Click one to jump to it. Save as PDF opens every slide on its
own page for the print window.

To keep a Markdown deck on the site, put the `.md` file next to `md.html` and
link to `md.html?src=talk.md`. Add `&theme=paper` to override its theme.

### With Claude

The `skill` folder beside `app` is a Claude skill. Add it to Claude, or copy it
into `.claude/skills/`, then attach your Markdown and ask for a Stagehand deck.
It tightens the words on each slide, moves the rest into your script, picks
layouts and hands back Markdown in the format above, plus an HTML deck if you
ask for one.

## Making a deck by hand

Copy this folder, then edit `blank.html`, `demo.html`, or one of the
templates. Open it through a web
server rather than by double-clicking, since sound files and modules will not
load from a `file://` address. GitHub Pages works, and so does
`python3 -m http.server` in the folder.

A deck is a `div.deck` holding one `section` per slide:

```html
<div class="deck" data-title="My talk" data-length="5">

  <header class="title-card" data-voice="intro.mp3">
    <p class="eyebrow">Where · When</p>
    <h1>My talk</h1>
    <hr class="rule">
    <p class="sub">One line on what it is about</p>
    <p class="credit">Your name</p>
    <aside>Notes for yourself while the title is up.</aside>
  </header>

  <section data-title="Short name" data-sound="room.mp3">
    <p class="eyebrow">Part one</p>
    <h2>A heading</h2>
    <aside>What you say. (click) What you say once the next thing appears.</aside>
  </section>

</div>
<script type="module" src="stagehand.js"></script>
```

### On the deck

| Attribute | What it does |
| --- | --- |
| `data-title` | The talk's name, shown in your window. |
| `data-length` | The length in minutes. The timer turns red past it. Defaults to 5. |
| `data-sound` | A recording that loops under every slide without its own. |
| `data-numbers="off"` | Hides the slide numbers in the corner. |
| `data-grain="off"` | Turns off the faint film grain. |

### On a slide

| Attribute | What it does |
| --- | --- |
| `data-title` | A short name for your window and the slide dots. Defaults to the heading. |
| `data-sound` | A recording that loops quietly under this slide. Slides sharing one carry it through. |
| `data-voice` | A recording that plays once when you first arrive. The bed dips under it. |
| `data-number="off"` | Hides this slide's number. |

The title card is optional. Leave it out and the deck opens on its title alone.
With `data-voice` on it, the first press of Next plays the narration over the
card and the second brings up slide 1.

### The script

The `aside` in each slide is your script. It never shows on the shared screen.

- `(click)` marks where a reveal happens. It becomes a numbered button in your
  window, so you can see where you are.
- Anything else in brackets, like `(pause)`, shows as a small cue.
- A line starting with a capital label and a colon, like `NOTE:` or
  `SOURCES:`, ends the spoken part. Everything after it is left out of your
  window, so it is a good place for sources and reminders.

### Reveals

Add `class="reveal"` to anything. It stays hidden until you press Next, in the
order it appears in the page. Add `only` as well, `class="reveal only"`, and it
shows during its own click and hides at the next one. That is how a ring moves
around a diagram.

### The slide kit

Each slide is a 1920 by 1080 canvas with 128px of padding, its content centered
from top to bottom. Pixel sizes always mean the same thing on any screen.

| Class | What it is |
| --- | --- |
| `eyebrow` | A small, spaced, accent colored label above a heading. |
| `caption` | Small spaced capitals for sources and credits. |
| `lede` | A large italic line. |
| `rule` | A short accent line, on an `hr`. |
| `centered` | On a section, centers everything. |
| `narrow` | Keeps a block to a readable width. |
| `photo` | A box that fills the slide with its `img`, drifting slowly. |
| `photo right` | The same, on the right with a fade into the background. |
| `photo shade` | A darker wash so text reads over a full photo. |
| `photo still` | No drift. |
| `over-photo` | Keeps text to the left of a right side photo. |
| `rows` | Labels and values in two columns that always line up. |
| `columns` | Equal columns side by side. |
| `card` | A bordered box. |
| `stat` | A big number, as a `b`, with a caption under it. |
| `points` | A numbered list with accent numbers. |
| `ring` | An ellipse with a dim around it, positioned with `left`, `top`, `width`, `height`. |

### Templates

Three looks come with it. Each is a whole deck you can copy and rewrite.

| File | Look | Good for |
| --- | --- | --- |
| `demo.html` | Dark, warm, documentary | Story talks, demos |
| `template-paper.html` | Light paper, serif, one red accent | Retros, case studies, research |
| `template-signal.html` | Dark with flood colored section slides | Updates, pitches, kickoffs |

### Your own look

A theme is a stylesheet in `themes/` that sets these variables on `:root`, linked
after `stagehand.css`. A `style` tag in one deck works the same way.

| Variable | What it sets |
| --- | --- |
| `--sh-bg`, `--sh-ink` | The slide, and the space around it |
| `--sh-text`, `--sh-soft`, `--sh-muted` | Headings, body copy, labels |
| `--sh-accent`, `--sh-accent-strong` | Eyebrows, rules, numbers, rings |
| `--sh-display`, `--sh-ui` | The heading font and the label font |
| `--sh-head-case`, `--sh-head-track`, `--sh-head-weight` | Capitals or not, letter spacing, weight |
| `--sh-title-weight`, `--sh-lede-style` | The title card's weight, italic or not |
| `--sh-gate`, `--sh-glow` | The title card background and its soft light |
| `--sh-frame`, `--sh-fill`, `--sh-dim` | Card borders and fill, the shade around a ring |

Variables also work on a single slide. Signal sets a few on `.loud` so any
section with that class floods the screen in its accent color. Your own window
keeps the same dark look whatever theme the deck uses.

## Presenting

1. Open the deck and click it once. That turns the sound on and opens your
   window. If the browser blocks the window, allow pop-ups and press P.
2. Click the deck once more to go full screen, then share that window.
3. Run everything from your window, or with a clicker.

Opening your window first, at the same address with `#presenter` on the end,
lets one click on the deck turn the sound on and go full screen together.

| Key | What it does |
| --- | --- |
| → Space PageDown | Next, in either window |
| ← PageUp | Back. Back from slide 1 brings the title card up again |
| F | Full screen |
| M | Mute |
| P | Opens your window |

In your window, the dots along the bottom jump to any slide, Start over goes
back to the title and resets the timer, and Edit lets you rewrite the script
for a slide. Edits stay in that browser. Copy edits puts them all on the
clipboard, ready to paste back into the deck, or to Claude.

Refreshing the deck by accident brings it back to the same slide.

## Asking Claude for a deck

Hand Claude your outline and this README, and ask for a Stagehand deck. The
format above is all it needs. Ask it to keep the words on the slides short and
put the rest in the script.

## Contributing

Stagehand is open source under the [MIT license](LICENSE). Bug reports, ideas,
new designs and new layouts are all welcome. [CONTRIBUTING.md](CONTRIBUTING.md)
says how to try a change and send it.

## What it records

`experiments-web.js` counts a few named actions, like opening a deck or using a
reveal, so the catalog can show which parts get used. It never sends the
slides, the script or anything typed. Set `slug` to an empty string in that
file to switch it off.
