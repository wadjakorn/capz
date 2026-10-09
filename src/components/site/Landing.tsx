import { Nav } from "./Nav";
import { HeroScene } from "./HeroScene";
import { CaptureChapter } from "./CaptureChapter";
import { BackdropPlayground } from "./BackdropPlayground";
import { Annotate, Loop, Ocr, ThaiFirst, TryWeb, Workspaces } from "./Sections";
import { Install } from "./Install";
import { Footer } from "./Footer";
import { chonburi } from "./fonts";

/**
 * Direction contract (impeccable). Rendered as an HTML comment at the top of
 * the landing so it survives the static export and can be audited in out/.
 */
const CONTRACT = `<!--
THESIS: capture is the entry, not the product — any image in (paste, drop, capture), pointed out with capz's own default tools, copied straight back out; the measured Thai type specimen is the proof of the Thai claim, set in its own chapter; refuses the dark dev-tool bento landing.
OWN-WORLD: alternates a white specimen sheet with the app's own screen (app tokens, light by default to match the bright page and the light-theme shots; switchable by data-app-theme); annotation grammar = app defaults (arrow #ef4444 w4 filled head, pins #E5342B white numeral, magnify/highlighter #facc15, text on a white box); one action colour, indigo; Chonburi display, Noto Sans Thai body.
STORY: read the promise (any image → point it out → copy it on) → watch the real editor do it → download the .dmg / .exe (or copy brew) or open /paste → ways in (paste, drop, capture modes), mark up, combine + copy loop, backdrops, Thai (specimen as proof), OCR, workspaces, web, install.
FIRST VIEWPORT: index nav with TH/EN; category kicker (pin dot) + two-line headline with the highlighter band + lede left; right: OS-aware indigo download (Mac .dmg by chip, Windows .exe; brew as the alternative; phones and Linux lead with /paste); the editor window sits right under the headline, playing, and rises to centre on scroll.
FORM: Thai type specimen ↔ app screen, IMPECCABLE'S PICK (grounded candidate 1); seed ce51cb18.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export function Landing() {
  return (
    <div className={`site-landing ${chonburi.variable}`} data-app-theme="light">
      <div hidden dangerouslySetInnerHTML={{ __html: CONTRACT }} />
      <Nav />
      <main>
        <HeroScene />
        <CaptureChapter />
        <Annotate />
        <Loop />
        <BackdropPlayground />
        <ThaiFirst />
        <Ocr />
        <Workspaces />
        <TryWeb />
        <Install />
      </main>
      <Footer />
    </div>
  );
}
