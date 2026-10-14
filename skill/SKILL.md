---
name: stagehand
description: Turns a Markdown file, outline or notes into a polished Stagehand presentation, a two window deck with a private script. Use when someone asks for slides, a deck or a talk from Markdown, or mentions Stagehand.
---

# Stagehand decks from Markdown

Stagehand is thoughtbot's presentation tool. A deck is plain Markdown, or one
HTML file. The audience window shows only the slides. A second window shows the
speaker's script, the next slide and a timer.

Your job is to turn what the person gives you, usually a Markdown file, into a
deck that looks designed and reads well out loud. You write the words and
choose the layouts. Stagehand handles the look.

## What to hand back

1. **A polished Markdown file**, named after the talk, like `onboarding-retro.md`.
   This is the source of truth. It follows the format below exactly, so
   anyone can drop or paste it on https://rantbot.github.io/stagehand/
   to preview it, change the theme and present.
2. **A one line link to present it.** Tell them to open the Stagehand page above and
   drop the file in or paste it. If they asked for a file they can present directly, also
   write the HTML deck described at the end.

Then say in two or three sentences what you changed and what they should check,
like placeholder figures or a picture they need to supply.

## How to edit

- **One idea per slide.** Split a slide that makes two points.
- **Few words on the slide, the rest in the notes.** A heading of eight words or
  fewer. Body text under about 25 words. Lists of three to five short items. Move
  explanation, stories and caveats into `Notes:`, written the way the person
  would say them.
- **Keep their words and claims.** Tighten, never invent. Do not make up
  figures, quotes or sources. If a slide needs a number they did not give, use
  an obvious placeholder like `XX%` and say so.
- **Pace.** About 45 to 60 seconds a slide. Set `length` in the front matter to
  the talk's minutes, from what they said or from the slide count.
- **Open with a title card, close with something to do or a thank you.** Use
  section slides to break a talk longer than about eight slides into parts.
- **Prefer the layouts that land.** A number that matters gets the stat layout. A
  line from a customer gets a pull quote. A list of steps gets numbered points.
  Compare before and after with stats side by side.
- **Reveals.** When points should arrive one at a time, write `(click)` in the
  notes where each one appears. The first `(click)` reveals the first item.
- **Voice.** Plain, kind and direct. American spelling. No em dashes on slides.

## The format

**Read the current format first.** It lives at
https://rantbot.github.io/stagehand/format.md and changes with every release.
If you can fetch it, it wins over anything written below, which is a copy kept
here for when you cannot.


Slides are separated by a line with three dashes. Front matter goes first.

```markdown
---
title: Rebuilding onboarding
subtitle: What eight weeks of interviews taught us
author: Your name · Your team
event: Project retro · Fall 2026
theme: paper
length: 8
---

# Rebuilding onboarding

Notes: What the speaker says while the title card is up.

---

### Today
## Three things to cover

1. Where new customers were getting stuck
2. What we changed, and what it did
3. What we would keep for next time

Notes: Here is the plan. (click) First... (click) Then... (click) And last...
```

To walk through code, put steps after the language, like ` ```ruby {1|2-3|5} `.
Each `(click)` in the notes lights up the next group of lines. Use it when the
talk explains code a piece at a time.

People may paste a list of notes from the start page, each naming a slide and
line, with their deck below. Make exactly those changes, keep the rest as it
is, and hand back the whole Markdown file.

For a brand or a look of their own, add any of `accent`, `background` and
`text` (hex colors like `#FF5A36`), `font` and `body-font` (names from Google
Fonts) to the front matter. They work on top of any theme, so this is the way to
restyle a deck while still handing back Markdown.

`theme` is `classic` (dark and warm, documentary), `paper` (light and
editorial, for retros, research and case studies) or `signal` (bold and bright,
for updates, pitches and kickoffs). Choose one that fits if they did not say.

### How each slide is laid out

The layout comes from what is on the slide. Write each slide to match one of
these.

| Write this | You get |
| --- | --- |
| The first slide with only `# Title` (and up to two short lines) | The title card. Front matter fills in anything missing. |
| A slide with only `# Heading`, or only a heading | A section opener. `# 1. Heading` adds a big section number. |
| `### Label` right above `## Heading` | A small label over the heading. |
| `## Heading` and one short paragraph | The paragraph as a large lede. |
| A list where every item starts with a number, like `- **68%** finish setup` | Two to four big stats side by side. |
| A slide that is only a number and a few words, like `**3x** faster` | One huge stat. |
| `> Quote` with a last line `> — Who said it` | A centered pull quote with its credit. |
| `![Alt text](picture.jpg)` alone, or with a heading | A full bleed photo, the heading over it. |
| A picture plus other things | The picture on the right, everything else on the left. |
| Two to four `### Headings`, each with a line or two under it | Cards in columns. |
| A list of `- **Label**: value` lines | Labels and values lined up in two columns. |
| `1.` numbered or `-` bulleted lists | Numbered points, or points with an accent dash. |
| A table or a fenced code block | A styled table, or a code panel. |
| A slide that is only one sentence | A big centered statement. |

The speaker's script is everything after a `Notes:` line on a slide, or anything
in an HTML comment, `<!-- like this -->`. Lines in the notes starting with a
capital label and a colon, like `SOURCES:` or `TODO:`, are kept out of the
script the speaker sees, so they are a good place for sources.

Slides with too many words get smaller type automatically, but it is better to
cut words than to rely on that.

### Check it before you hand it back

The start page checks every deck and points to the slide and line, so anything
you leave wrong shows up as a warning for them. Before you finish, go through
the same list: every code block closed, every setting valid, no slide over about
70 words, no list over six items, no heading over twelve words, and no more
`(click)` cues than things to reveal, and code steps only name lines the code has. If you can run code, `checkMarkdown` in
https://rantbot.github.io/stagehand/markdown.js returns the same list.

Pictures are paths relative to where the deck is hosted. Ask for the files if
the talk needs real photos, and leave a clearly named placeholder otherwise.

When they want to send the slides to someone, tell them Save as PDF on the
start page gives one slide per page.

## The HTML deck, when they want one

Write the same slides as one HTML file. Load everything from the hosted copy so
the file works on its own, anywhere it is served from.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rebuilding onboarding</title>
<link rel="stylesheet" href="https://rantbot.github.io/stagehand/stagehand.css">
<link rel="stylesheet" href="https://rantbot.github.io/stagehand/themes/paper.css">
</head>
<body>
<div class="deck" data-title="Rebuilding onboarding" data-length="8" data-grain="off">
  <header class="title-card">
    <p class="eyebrow">Project retro · Fall 2026</p>
    <h1>Rebuilding onboarding</h1>
    <hr class="rule">
    <p class="sub">What eight weeks of interviews taught us</p>
    <p class="credit">Your name · Your team</p>
    <aside>The script for the title card.</aside>
  </header>
  <section data-title="Agenda">
    <p class="eyebrow">Today</p>
    <h2>Three things to cover</h2>
    <ol class="points narrow">
      <li class="reveal"><p>Where new customers were getting stuck</p></li>
    </ol>
    <aside>The script. (click) Where the first item appears.</aside>
  </section>
</div>
<script type="module" src="https://rantbot.github.io/stagehand/stagehand.js"></script>
</body>
</html>
```

In HTML you may go past the Markdown layouts with the slide kit: `eyebrow`,
`caption`, `lede`, `rule`, `centered`, `narrow`, `photo` (with `right`, `shade`,
`still`), `over-photo`, `rows`, `columns`, `card`, `stat`, `points` (with
`dots`), `quote`, `big-num`, `code`, `table`, `ring` and `reveal` (with `only`).
Slides are a fixed 1920 by 1080 canvas with 128px padding, so sizes are in
pixels. Never put inline `style` on elements to animate them, and keep any
custom CSS in one `style` tag in the head. The full guide is at
https://github.com/rantbot/stagehand/blob/main/README.md

## Presenting, for when they ask

Open the deck and click it once. That turns on sound and opens the speaker
window. Click again for full screen, then share that window. Arrow keys or a
clicker drive both windows. The speaker window can edit the script on the fly.
