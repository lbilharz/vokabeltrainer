# First steps for new families and small joys while practising

Date: 25 November 2026.

## Result

A new family can start without the owner sitting next to them. A round that goes well now feels a little better.

## Trigger

The owner wants to hand the app to a colleague and their children. Until now a new account saw one sentence and one button. The second wish: "a little joy, small grins in between", for 15-year-olds.

## Steps

### First steps

1. **Welcome screen** (`src/screens/Welcome.tsx`). Three points say what the app does. The field for the invite word says where the word comes from. A block "Für Eltern" names what is stored and which services read the photos and words.
2. **The link `/start`** opens the account form directly. An invited person otherwise sees "Anmelden" first.
3. **Empty account** (`src/components/FirstSteps.tsx`). Three steps replace "Noch keine Vokabeln". A hint explains how to put the app on the home screen. It only shows when the app does not run from there (`src/lib/install.ts`).
4. **Sample lesson** (`src/data/sample.ts`). "Erst ohne Buch ausprobieren" adds ten self-written words. It is a normal lesson and can be deleted in the settings.
5. **Tip card** (`src/components/TipCard.tsx`). After the first lesson a card explains "Heute", the stations and the reminder. It stays until it is closed.

### Small joys

1. **Pure logic** in `shared/cheer.ts` with tests: the run of right answers, the lines at 3, 5, 10, 15 and 20, "this answer made the word stick", and the headline of the end screen.
2. **In the round** (`src/screens/Session.tsx`). The check mark pops. A chip shows the run. "Das sitzt jetzt." appears once when a word reaches box 4, and the word gets a line under it.
3. **At the end** (`src/screens/Done.tsx`). A round without a mistake is called "Fehlerfrei" and gets a short confetti (`src/components/Confetti.tsx`). Every round shows how many words stick now and the longest run from 3.

## Decisions

- **Understated on purpose.** No sound, no mascot, no extra tap. Every effect ends within about a second. A wrong answer gets nothing, also no consolation.
- **A hint breaks the run.** An answer that needed the article hint or the form hint is right, but it does not count as a first try.
- **Reduced motion:** the texts stay, the movement is gone. The confetti is not rendered at all.
- **The tip card is remembered on the device** (`localStorage`, key `travok_tips:<account>`), not in the synced data. A second device shows it once more. That is acceptable for a hint.
- **The sample lesson does not use the templates.** The templates hold textbook words.
- **Styles live next to their feature** (`src/onboarding.css`, `src/celebrate.css`), not in `src/index.css`. Two agents built the two features at the same time in one checkout.

## Compromises

- The sample lesson says "Heute fotografiert" like every lesson.
- A closed tip card cannot be opened again.
- The wording of the lines is a first proposal. The owner reviews it with the demo page.

## Checked

Type check, 298 tests and the build pass. Locally in the browser at phone width: the welcome screen, `/start`, the empty account, the sample lesson, the tip card, a round with a run of three, "Das sitzt jetzt", and the end screen with confetti. Not checked on a real iPhone.
