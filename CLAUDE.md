# Stagehand

A two window presentation tool, served by GitHub Pages at
https://rantbot.github.io/stagehand/ straight from this repository's root. `index.html` is the start page, where people drop or paste Markdown, pick
a design and present, with the Claude prompts and the writing guide below it.
The demo deck at `demo.html` is also the reference example. `README.md` is the
authoring guide for teammates and for Claude, and `skill/` is the Claude skill.

It is listed in thoughtbot's experiments catalog, whose `content/stagehand/`
folder holds only the card (experiment.json and hero.png) pointing here.

## Where it came from

Extracted from Ran's lightning talk "The American Dive Bar" in October 2026,
after he found himself wanting the same setup for other talks. The talk's own
content (slides, photos, field recordings, narration) stays in his dive-bars
repository and is not part of this experiment.

## History and decisions

- **One HTML file per deck, no build step.** Slides are `section` elements, the
  script is each slide's `aside`. That shape is easy to hand to Claude, and easy
  to fix by hand without tooling.
- **Two windows over a BroadcastChannel.** The shared window carries no controls
  at all, so screen sharing never shows the script. Both windows must be in the
  same browser. The channel name comes from the page path, so two decks open at
  once do not talk to each other.
- **One click on the shared window is required.** Browsers block sound and full
  screen until the page itself is clicked, and allow one of those two per click.
  If the presenter window is already open, the first click does both sound and
  full screen. The presenter window shows a banner until the shared one is armed.
- **Fixed 1920 by 1080 canvas.** Pixel sizes mean the same thing everywhere.
- **Never write to element.style on slide content.** It rewrites the style
  attribute and broke attribute-based layout rules in the original. Animation
  delays go through `rise-N` classes instead.
- **Reveals are `.reveal` in document order; `.only` hides after its own step.**
  `(click)` in the aside renders as a numbered button in the presenter window.
- **Script edits live in localStorage, keyed by page path.** "Copy edits" is how
  they get back into the file.
- **Themes are CSS variables, nothing more.** A deck restyles itself by setting
  `--sh-*` on `:root` in its own `style` tag. The templates (Paper and Signal,
  added in 1.1.0) show the range. The presenter window uses its own `--pv-*`
  palette so a light deck never makes your notes unreadable.
- **Markdown decks pick layouts by rule, in the browser.** `markdown.js` has no
  dependencies and no model behind it. Each slide's layout follows from its
  content, documented in the README table. Anything smarter, like cutting words
  or choosing between layouts, belongs to the Claude skill in `skill/`, which
  writes Markdown in the same format so both paths meet in one place.
- **The start page replaced make.html in October 2026.** Ran wanted the front
  door to feel like a landing page for the tool, with the demo one click away
  and Markdown, pasting, our designs and Claude as equal ways in. `make.html`
  redirects there, and the demo moved from `index.html` to `demo.html`.
  `md.html?view=cover&n=` draws one slide for the page's pictures.
- **Open source under MIT, October 2026.** Ran wanted it clear that anyone can
  contribute. `LICENSE` and `CONTRIBUTING.md` are at the root, and the start page
  has a Contribute section and says so under the hero.
- **Dropped files stay in the browser.** The start page keeps the Markdown in
  localStorage under a hash and opens md.html?id=… so both windows can read it.
  Nothing is uploaded.
- **Moved to rantbot/stagehand in October 2026.** It lived in
  thoughtbot/experiments under `content/stagehand/app/` until then. Ran wanted
  it on his own account. Decks made before the move load their styles from the
  old address, which no longer exists, so they need their links pointed here.
- **The crossfade holds the outgoing slide still** (`.leaving`) so nothing dips
  to black or snaps back mid fade.

## Tracking

`experiments-web.js` with slug `stagehand`, reporting to the experiments
catalog's Supabase project. Copies of the folder keep
reporting to the same slug, which counts the tool's use rather than one deck.
