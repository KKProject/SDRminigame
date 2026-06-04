## 1. Project Restructure

- [x] 1.1 Create `js/game/` modules for cards, rule config, rule evaluation, engine, AI, layout, renderer, input, and assets.
- [x] 1.2 Replace shooter-oriented DataBus fields with card-game state fields for seats, deck, hands, melds, discards, phase, pending actions, selected card, feedback, result, and mute state.
- [x] 1.3 Update `js/main.js` to initialize the card-game engine, renderer, input router, and audio manager while retaining the canvas animation loop for redraws.
- [x] 1.4 Remove active imports and runtime usage of player, enemy, bullet, scrolling background, collision detection, and shooter score logic.

## 2. Rules And Round Engine

- [x] 2.1 Define the default Shang Da Ren card symbols, copies, display colors, sequence groups, special-card metadata, and scoring constants in a configurable rules file.
- [x] 2.2 Implement deck creation, shuffle, seat creation, dealer assignment, hand dealing, draw pile tracking, and round reset.
- [x] 2.3 Implement turn phases for draw, discard, response selection, meld resolution, win resolution, exhausted-deck draw, and restart.
- [x] 2.4 Implement legal discard validation and selected-card discard handling for the human player.
- [x] 2.5 Implement chi-style sequence, peng-style triple, and gang-style four-of-a-kind detection from configured rule patterns.
- [x] 2.6 Implement response priority so win actions outrank gang, peng, chi, and pass actions.
- [x] 2.7 Implement winning-hand evaluation and return winner, source, winning card, hand groups, and scoring summary.
- [x] 2.8 Add pure-function checks or lightweight tests for deck counts, legal meld detection, priority resolution, win detection, and exhausted-deck result.

## 3. Table Rendering And Input

- [x] 3.1 Implement responsive table layout calculations for phone canvas sizes, including player hand, opponent zones, meld zones, discard zones, deck count, action buttons, prompts, and result overlay.
- [x] 3.2 Implement canvas card rendering with readable symbols, configured color, selected-card lift, special-card markers, and card-back rendering.
- [x] 3.3 Implement table rendering for all seats, visible player hand, hidden opponent hands, discards, melds, current turn marker, recent discard, feedback prompt, and round result.
- [x] 3.4 Implement a single WeChat touch input router that maps touches to generated hand-card and button hit regions.
- [x] 3.5 Implement human interactions for select, deselect, discard, chi, peng, gang, hu, pass, mute, and restart.
- [x] 3.6 Ensure illegal taps leave game state unchanged and produce a short feedback prompt.

## 4. AI Opponents

- [x] 4.1 Implement AI active-turn execution for draw, win evaluation, discard choice, and turn advancement.
- [x] 4.2 Implement deterministic AI response selection using win, gang, peng, chi, pass priority.
- [x] 4.3 Implement AI discard heuristic that preserves likely pairs, triples, and configured sequences before isolated cards.
- [x] 4.4 Add a short AI thinking delay state that is visible in the renderer and does not block touch handler lifecycle.
- [x] 4.5 Add checks or scripted scenarios that verify AI can finish a turn and can choose a legal win response.

## 5. Assets And Audio

- [x] 5.1 Create an asset manifest that maps semantic table, card, button, result, and audio names to existing `images/` and `audio/` files.
- [x] 5.2 Implement image loading with success/failure state and canvas fallback rendering for missing images.
- [x] 5.3 Update the music/audio manager for discard, meld, win, draw result, button tap, and optional background music cues.
- [x] 5.4 Implement mute state so background music and effects respect the current in-game setting.
- [x] 5.5 Verify missing or failed asset/audio loads do not throw runtime errors or block gameplay.

## 6. Integration And Verification

- [x] 6.1 Run the game in the WeChat minigame runtime or compatible local validation path and verify a new round starts successfully.
- [x] 6.2 Play through a human discard, AI turn, response prompt, meld action, and restart flow.
- [x] 6.3 Verify at least one scripted or seeded round can reach a win result and one can reach an exhausted-deck draw result.
- [x] 6.4 Verify layout on narrow and tall screen sizes for non-overlapping hand cards, action buttons, prompts, and result overlay.
- [x] 6.5 Remove or quarantine unused shooter modules only after confirming no active imports remain.
- [x] 6.6 Update `README.md` with the new game description, source layout, and rule-variant notes.
