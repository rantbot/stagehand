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
4. Open a pull request saying what you changed and why. Screenshots help.

Claude is a good partner for this. Point it at `CLAUDE.md` first, which holds
the decisions behind how Stagehand works.

## A few things we keep true

- One HTML file per deck, and no build step, so anyone can open and fix one.
- The shared window never shows controls or the script.
- Themes are CSS variables, nothing more.
- Nothing a person types or drops is ever uploaded.
- Copy is plain, kind and direct, in American English.
