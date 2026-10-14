# Contributing to Stagehand

Stagehand is open source under the MIT license, and it gets better when the
people who give talks with it change it. You don't need to be a developer to
help.

## Ways to help

- **Tell us what happened.** If something broke, or you reached for something
  that wasn't there, [open an issue](https://github.com/rantbot/stagehand/issues/new).
  A sentence and a screenshot is plenty.
- **Add a design.** A theme is one small stylesheet in `themes/` that sets a few
  color and type variables. The README's "Your own look" section shows how.
  Paper and Signal are good ones to copy.
- **Teach the Markdown a new layout.** `markdown.js` decides each slide's layout
  from what is on it. If your slides keep wanting a shape it doesn't know, add it
  there and to the table in the README.
- **Improve the Claude skill.** `skill/SKILL.md` is plain writing. If Claude keeps
  getting something wrong, a clearer sentence there usually fixes it.
- **Share a deck.** A talk you gave with it is the best test there is. Link it in
  an issue so others can learn from it.

## Trying a change

There is no build step and nothing to install.

1. Fork this repository and open it on your computer, with GitHub Desktop or
   however you like.
2. In the folder, run `python3 -m http.server 8000`, then open
   http://localhost:8000.
3. Make your change and refresh. The start page, `demo.html` and the templates
   cover most of what Stagehand does, so click through them before you send it.
4. If you changed any JavaScript, run the checks below.
5. Open a pull request saying what you changed and why. Screenshots help.

## Checks

You need Node 18 or later for these, and nothing else. The first lint or format
run fetches the tool, so it takes a moment.

```sh
npm test               # markdown.js, every layout rule and every check
npm run lint           # ESLint, for mistakes like unused or undefined names
npm run format         # Prettier, so everyone's code reads the same
```

GitHub runs the same three on every push and pull request.

## How the code fits together

Plain HTML, CSS and JavaScript modules, loaded straight from the files. No
framework, no bundler, no dependencies at runtime.

```
index.html + start.js    the start page. Reads what you drop or paste, shows the
                         preview and its checks, and opens md.html to present
                         or print. Hands the Markdown over in localStorage.
md.html + md.js          reads a Markdown file, from the site or localStorage,
                         and shows it as a deck, a preview grid or print pages
markdown.js              Markdown in, deck HTML out. Also checkMarkdown, the
                         checks, and brandStyle, your own colors and fonts.
                         Pure functions, so they run and are tested in Node.
stagehand.js             presents any deck: the two windows, reveals, timer and
                         script editing. Hand written HTML decks use it directly.
sound.js                 sound beds under slides and narration over them
stagehand.css            the stage, the slide kit and the presenter window
themes/*.css             each design, as CSS variables over stagehand.css
experiments-web.js       anonymous counts of which features get used
```

Where to start for common changes:

- **A new layout from Markdown.** `slideHTML` in markdown.js picks a slide's
  layout, with the rules in the same order as format.md. Add a test in
  `tests/markdown.test.mjs`, then a line to format.md.
- **A new check.** `checkMarkdown` in markdown.js for anything you can see in
  the text, or `collectProblems` in start.js for anything that needs the slides
  laid out, like overflow.
- **A new design.** Copy `themes/paper.css`, change the variables, and add it to
  `THEMES` in markdown.js and to the start page.
- **The presenter window.** stagehand.js. Its header lists its sections, and
  the comment above the message handler lists what the two windows say to each
  other.

A few conventions:

- Each file opens with a comment saying what it does and how it is laid out.
- Names say what something is, constants are named rather than repeated, and
  comments say why rather than what.
- Anything from a file or a person goes through `escapeHtml` or `inline` before
  it reaches the page.
- `localStorage` can be off, so every use of it sits in a `try`.

Claude is a good partner for this. Point it at `CLAUDE.md` first, which holds
the decisions behind how Stagehand works.

## A few things we keep true

- One HTML file per deck, and no build step, so anyone can open and fix one.
- The shared window never shows controls or the script.
- Themes are CSS variables, nothing more.
- Nothing a person types or drops is ever uploaded.
- Copy is plain, kind and direct, in American English.
