# Learning steps: almost right, copying, gap word

Date: 22 and 23 November 2026. Commits `cf41241`, `328571f`, `9366a1c`.

## Result

The way from choosing to free writing has intermediate steps. The app no longer punishes small errors such as a missing accent.

## Steps

1. **Almost right answers count as right** (`cf41241`).
   - Before, every deviation was wrong. That was too hard on a phone. The owner wanted the Duolingo way.
   - There is a third state in orange: missing accents and one typo count as right. The feedback shows the right spelling.
   - The article stays strict. If it is missing, there is a hint and a second try. If it is wrong, the answer is wrong.
   - Words under four characters get no leniency.
2. **Copying and gap word** (`328571f`).
   - The jump from choosing to free writing was too big. The solution after a mistake could be clicked away.
   - Copying, letter by letter: after the introduction and after a wrongly written answer. "Weiter" comes only afterwards.
   - New task "Lückenwort": first letters are shown, the article is not. In box 1 and 2 it alternates with free writing.
   - A wrong letter is not accepted. A hint helps with accents, after two failed tries a button appears.
   - "Fast richtig" marks the place that was wrong and shows the own answer.
3. **Progress counts practised words** (`9366a1c`).
   - After the first part it said "0 von 8 sitzen" next to a green check. The bar stayed empty.
   - New is the count "geübt" for every word that was due once. The bar shows practised words light and sitting words dark.
   - The text is below the bar. Next to long names it wrapped.

## Decisions and compromises

- **Strict on the article.** The article belongs to the word. The decision was made during the build and was not objected to.
- **The gap word alternates randomly with free writing.** The ratio is 50 to 50 in box 1 and 2. From box 3 on there is only free writing. The number is not measured. It is a start.
- **A single slip** in the gap word counts as "almost right" for words with at least four gaps.
- The leniency is only a rule. It knows no grammar. The next step is in `2026-11-25-leniency-and-referee.md`.

## Learned

- A number that rises only after days shows no progress on day one. So there is a second number "geübt".
