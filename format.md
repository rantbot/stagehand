# The Stagehand Markdown format

This is the whole format, kept current with every release. It is written for
people and for Claude alike. The start page at https://rantbot.github.io/stagehand/
reads it, checks it and shows you the result as you type.

## Slides

Put a line with three dashes between slides. Leave them out and every `#` or
`##` heading starts a new slide instead. A `---` inside a code block never
splits a slide.

```markdown
---
title: Rebuilding onboarding
theme: paper
length: 8
---

# Rebuilding onboarding

Notes: What you say while the title card is up.

---

### Today
## Three things to cover

1. Where new customers were getting stuck
2. What we changed, and what it did
3. What we would keep for next time

Notes: Here is the plan. (click) First... (click) Then... (click) And last...
```

## Settings at the top

Optional, between two `---` lines at the very top of the file.

| Setting | What it does |
| --- | --- |
| `title`, `subtitle`, `author`, `event` | Fill in the title card. `event` is the small line above the title. |
| `theme` | `classic` (dark and warm), `paper` (light and editorial) or `signal` (bold and bright). Classic if you leave it out. |
| `length` | The talk's length in minutes, for the timer in your window. |
| `accent` | Your accent color, like `#FF5A36`. |
| `background` | The slide background, like `#111116`. |
| `text` | The main text color, like `#FFFFFF`. Softer text, lines and card fills follow from it. |
| `font` | The headline font, any name from Google Fonts, like `Space Grotesk`. |
| `body-font` | The font for everything else, also from Google Fonts. |
| `sound` | A sound bed that plays under the deck, a path or URL to an audio file. |
| `numbers: off` | Hides slide numbers. |

The five color and font settings work on top of any theme. Use only the ones you
need. A client's brand is usually `accent`, `font` and maybe `background`.

## How each slide is laid out

The layout comes from what is on the slide. Write each slide to match one of
these.

| Write this | You get |
| --- | --- |
| The first slide with only `# Title` (and up to two short lines) | The title card. The settings fill in anything missing. |
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

Words in single `*asterisks*` pick up the accent color in headings.

## Your script

Everything after a `Notes:` line on a slide is your script, shown only in your
window. So is anything in an HTML comment, `<!-- like this -->`.

Write `(click)` in the script where the next thing should appear. Clicks reveal
a slide's list items, stats, label rows or cards one at a time, in order.

## Pictures

Pictures are paths relative to where the deck is hosted, or full `https`
addresses. A picture dropped or pasted on the start page only shows there if it
is online. When you save the deck as HTML, keep its pictures in the same folder.

## What the checks look for

The start page checks a deck as you type and points to the slide and line.

- A code block that is never closed.
- A setting it does not understand, like a color that is not a hex value or a
  theme that does not exist.
- A picture that does not load.
- A slide that runs off the bottom, or had its type shrunk twice to fit.
- More than about 70 words on one slide, a list longer than six items, or a
  heading longer than twelve words.
- More `(click)` cues than things to reveal.

Slides with too many words get smaller type on their own, but it is better to
cut words, or move them to your script, than to rely on that.

## Sharing it

On the start page, Present opens the deck in a new tab. Save as PDF opens every
slide on its own page, ready for the print window's Save as PDF. Save as HTML
writes one file that loads Stagehand from this site and presents anywhere it is
served from.
