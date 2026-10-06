import { Nav } from "./Nav";
import { HeroScene } from "./HeroScene";
import { CaptureChapter } from "./CaptureChapter";
import { BackdropPlayground } from "./BackdropPlayground";
import { Annotate, Ocr, ThaiFirst, TryWeb, Workspaces } from "./Sections";
import { Install } from "./Install";
import { Footer } from "./Footer";
import { chonburi } from "./fonts";

/**
 * Direction contract (impeccable). Rendered as an HTML comment at the top of
 * the landing so it survives the static export and can be audited in out/.
 */
const CONTRACT = `<!--
THESIS: proof that capz understands Thai — a type-specimen sheet whose giant Thai line is measured, then marked up with capz's own default tools; refuses the dark dev-tool bento landing and the screenshot-in-a-browser-frame hero.
OWN-WORLD: alternates a white specimen sheet with the app's own screen (Graphite app tokens, switchable by data-app-theme); annotation grammar = app defaults (arrow #ef4444 w4 filled head, pins #E5342B white numeral, magnify/highlighter #facc15, text on a white box); one action colour, indigo; Chonburi display, Noto Sans Thai body.
STORY: see Thai measured right → believe capz is built for Thai → copy brew or open /paste → scroll the real editor clips → capture modes, backdrops, Thai, annotate, OCR, workspaces, web, install.
FIRST VIEWPORT: specimen index nav with TH/EN; full-width measured line with pins, arrow and magnifier; headline + lede left, brew + indigo /paste CTA right; the editor window peeks at the bottom and rises on scroll.
FORM: Thai type specimen ↔ app screen, IMPECCABLE'S PICK (grounded candidate 1); seed ce51cb18.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export function Landing() {
  return (
    <div className={`site-landing ${chonburi.variable}`} data-app-theme="dark">
      <div hidden dangerouslySetInnerHTML={{ __html: CONTRACT }} />
      <Nav />
      <main>
        <HeroScene />
        <CaptureChapter />
        <BackdropPlayground />
        <ThaiFirst />
        <Annotate />
        <Ocr />
        <Workspaces />
        <TryWeb />
        <Install />
      </main>
      <Footer />
    </div>
  );
}
