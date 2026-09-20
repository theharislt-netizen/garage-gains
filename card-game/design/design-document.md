# Card Game App - Design Document

## Overview

This document defines the design for a mobile card game app, built around a homemade shedding-style card game (see the separate rules document for the base game's mechanics: setup, turn structure, and the three special cards - 2, 5, and 10). The app wraps that game in a UNO-style structure: a coin economy, buy-in tiers for matches, a placement-based payout system, and (planned for later) a cosmetics shop and progression system.

This is a living document, built section by section as design decisions are locked in. The goal is for it to be detailed enough that a developer (human or AI) can build the app's economy and reward systems from it without needing further clarification.

## Coin Economy - Core Numbers

- **Starting balance:** new players begin with 400 coins.
- **Daily login reward:** 50 coins per day, just for logging in.
- **Buy-in tiers (updated - now locked to bot difficulty, see below):** players pick a stake tier before entering a match. Tiers are 30, 100, 500, and 1000 coins.

These numbers were set to mirror the real-world ratio found in the official UNO mobile app, where a plain daily login reward (about 50 coins) covers a little more than one match at the cheapest buy-in (around 30 coins). Matching that ratio here means a player who only logs in daily, without spending real money, can still comfortably afford to play.

**Buy-in tier locked to bot difficulty (resolved - closes a loophole):** each buy-in tier is locked to a specific bot difficulty, rather than difficulty being a free choice independent of stakes. This was added specifically to prevent a player from selecting Easy difficulty while betting at the highest buy-in tier for a near-guaranteed win. The mapping is: 30 coins is locked to Easy bots, 100 coins is locked to Medium bots, 500 coins is locked to Hard bots, and 1000 coins is locked to Expert bots. A player can't buy into the 1000 coin tier and face anything but Expert bots.

## Navigation and Match Setup Flow

Modeled loosely on how UNO's mobile app structures its mode and match selection screens.

**Mode selection (resolved - restructured):** the top-level menu offers four modes: **Standard**, **Ranked**, **Practice**, and **Custom**. For launch, only Standard and Practice are built; Ranked and Custom are deferred (see below), with Ranked deliberately left until the very end.

**Standard (resolved):** real matchmaking, modeled on UNO's quick play. The player picks a buy-in tier (30, 100, 500, or 1000 coins), which locks in the bot difficulty they'll face if bot seats are needed (see Buy-in tier locked to bot difficulty, above). Standard first tries to fill the match with real online players; if there aren't enough, it fills the remaining seats with bots at the difficulty matching that buy-in tier.

**Mid-match disconnect handling (resolved - bot takeover, penalty still open):** if a human player disconnects mid-match in Standard, a bot matching that match's tier difficulty takes over their seat and continues playing on their behalf. The disconnected player receives a penalty for leaving - the exact penalty (coins, XP, or otherwise) is still to be defined.

**Friend system and social layer (resolved):** every mode (Standard, Ranked, Practice, Custom) starts in a pre-match lobby with up to four slots. Pressing Start immediately fills any empty slots with matchmaking or bots as appropriate to that mode. Tapping an empty slot instead opens the friends panel to invite someone directly into that slot.

Separately, each mode's lobby also has a Join Session option, where a player pastes in a session code to join a specific match directly (distinct from the friends panel - this is the raw code-based join, similar to UNO Mobile's Room Key system).

A full friend system exists: players log in with Google, choose a nickname, and get a unique profile ID. Other players can find and add them by nickname or profile ID. Sending a friend request notifies the recipient, who can accept via a button. Once friends, a plus button lets you invite them directly into an open lobby slot.

Friends are not a top-level game mode - they're accessed via the Friends button in the bottom navigation bar (see UI and Screen Structure section), available everywhere, not just inside a match mode. That screen includes: Add Friend, a Friends list (shows online status, tapping a friend opens their profile), and a Messages icon for direct messages between friends. This is intentionally minimal for now; a fuller social hub (profiles, search, etc.) may be built out later.

**Main screen header and profile (resolved):** the main screen (where mode selection lives) displays a persistent header at the top of the screen, showing the player's profile photo (with their equipped border), name, and level badge - following the common convention used in mobile games like Mobile Legends, rather than being tucked into a menu. Tapping this header opens the player's profile screen, where they can manage their equipped cosmetics (card skin, chat bubble skin, profile border, etc.) and view their stats.

**Settings menu (resolved):** a separate settings menu (accessible via a gear icon) holds app-level and account options, distinct from the cosmetic/profile screen above: sound and music volume, notifications on/off, language, account/login management, and help/support. Account login is Google-only: a "Sign in with Google" option doubles as both login for returning players and account creation for new ones (no separate signup flow). A logout option also lives in settings, letting a player sign out of their account. This follows the standard split used by most mobile games - profile and appearance are about self-expression and cosmetics, while settings covers app behavior and account management.

**Running out of coins (resolved - no safety net, intentional):** there is no low-balance safety net. If a player's balance hits zero, they simply wait for the next daily login bonus to start rebuilding - this is meant to feel like going bankrupt, a deliberate gamble-style low point rather than something softened by the game. Future additional coin sources may be added later (for example, watching a capped number of ads per day for small coin rewards), but these are not designed yet - just noted as a future direction.

**Buy-in sub-tiers and progressive unlock (resolved - replaces simple one-buy-in-per-difficulty model):** to let lower-skill players gamble larger amounts without being forced against high-difficulty bots (which would either be unbeatable for them, or, if difficulty and buy-in were simply decoupled, would let skilled players farm Easy bots at max stakes), buy-in is restructured as sub-tiers nested within each difficulty.

Easy remains a single flat tier at 30 coins, no sub-tiers. Medium, Hard, and Expert each contain three buy-in sub-tiers: Medium is 100 / 200 / 300 coins, Hard is 500 / 700 / 900 coins, Expert is 1200 / 1500 / 1800 coins.

Within a difficulty, each sub-tier must be unlocked by winning the previous one - you cannot buy into Medium-200 until you've won at Medium-100, and so on. This progression also carries across difficulties (winning through Medium's sub-tiers feeds into unlocking Hard, and so on up to Expert). What happens after winning Expert's top sub-tier (1800 coins) is not yet defined - left as a future addition once more content/coin sinks exist.

**UI layout (resolved):** to avoid cluttering the mode-selection screen, each difficulty is represented by a single card (Easy, Medium, Hard, Expert). The Medium, Hard, and Expert cards each contain their three nested buy-in sub-tiers within that one card, rather than surfacing all sub-tiers as separate top-level options.

**Practice (resolved):** deliberate bot-only play, no matchmaking wait, always just the player against bots. Practice has three sub-modes mirroring the top-level structure: Practice Standard (player plus three bots, four total), Practice One-on-one (player against a single bot), and Practice Custom (player chooses a player count from two to four and fills the rest with bots). In every Practice sub-mode, bot difficulty is set once, universally for all bots in that match, rather than per individual bot - the player picks one difficulty tier (Easy, Medium, Hard, or Expert) and every bot in the match uses it.

**Custom (resolved - deprioritized placeholder, same treatment as the shop):** a fully flexible match setup, where a player can freely mix real invited players, bots, or a blend, choosing a total player count between two and four. Whenever bots are added, a single universal difficulty applies to all bots in that match (one to three bots, depending on how many human seats are filled), rather than setting difficulty per bot. For launch, this is just a placeholder button leading nowhere - full custom-lobby functionality is left for later, after everything else in this document is built.

**Ranked (resolved - deferred placeholder, built last):** a future ranked mode sitting in the top-level mode selection alongside Standard, Practice, and Custom. For now it is a placeholder only, with no functionality defined - it is deliberately abandoned/deferred until the very end, after everything else in this document, including Custom, is built.

## UI and Screen Structure

This section maps out the app's screen layout and navigation shell - where things live on screen, not how the underlying systems work (those are defined elsewhere in this document, or, for future/unbuilt features, only sketched as rough ideas below).

**Bottom navigation bar (resolved):** a persistent bottom dashboard bar with equal-width buttons provides the app's main navigation, always accessible. The buttons are: Home (opens mode selection - Standard, Ranked, Practice, Custom), Shop, Inventory, Subscription, Friends, and Settings. This replaces having Friends live only in a dropdown and Settings only behind a gear icon - both now also have a fixed spot in this bottom bar.

**Main screen header (resolved):** a persistent header at the top of the main screen shows the player's profile photo (with equipped border), name, and level badge, following the convention used in mobile games like Mobile Legends. Tapping it opens the player's profile screen.

**Profile screen (resolved structure, empty content):** built the same way as the shop - a proper, neatly organized profile UI following the pattern used in UNO and similar games, with a clear slot/section for each cosmetic category the player can equip (card skin, chat bubble skin, profile border, emotes). The layout is fully built now, even though there are no actual cosmetic items to choose yet - this is part of building out the app's core structure, with content to follow later. Also shows the player's stats.

**Inventory (resolved):** accessed via the Inventory button in the bottom navigation bar above. Holds owned cosmetics and item fragments, and contains the Enchant and Craft sections (replacing what was earlier described as a separate crafting menu - both now live inside Inventory rather than in the Shop). The Inventory screen overall, and the Enchant and Craft screens specifically, should be made to look exactly like the equivalent screens in the user's Rig Core workout app - not just the same animations and functionality, but the same visual design and layout overall, since that design already took real effort to build. Reuse those existing pages/files as a base rather than rebuilding from scratch, adapting only what's needed to fit this card game's content.

**Friends (resolved):** accessed via the Friends button in the bottom navigation bar above. Includes Add Friend, a Friends list (online status, tap to view profile), and Messages. See Navigation section above for the full friend system.

**Settings (resolved):** accessed via the Settings button in the bottom navigation bar above - sound/music volume, notifications, language, account/login (Google sign-in doubles as account creation, plus a logout option), and help/support.

**Shop (resolved structure, empty content):** a dedicated shop screen with a row of category tabs across the top, one tab per cosmetic type (card skins, table themes, emotes, chat bubble skins, profile borders) plus a coins tab for real-money purchases. Tabs are visually built now; items inside them are not (see Planned Future Sections below).

**Subscription (rough idea, not finalized):** a subscription/VIP offering is planned, likely anchored around granting free daily reward boxes (see Planned Future Sections below for the box/cosmetic gambling concept), rather than any gameplay advantage - this game is skill-based and nothing purchasable affects match outcomes, only cosmetics. Because it needs to be highly visible and tempting rather than buried in a menu, it should NOT live inside the shop - it needs its own prominent entry point on the main screen (e.g. a banner or icon), separate from the shop. Exact placement and visual design still to be decided.

**Inventory and enchanting (resolved concept, not yet built):** a future inventory screen holds owned cosmetics and item fragments earned from box duplicates. Fragments are crafted into enchanting stones (a secondary currency), which are spent at an enchanting menu to upgrade a cosmetic item's visual tier - this replaces the earlier "crafting" idea, since nothing is being assembled from scratch, an owned item is being upgraded in place.

Each upgradable item has four tiers: tier zero is its base, unmodified look, and tiers one through three add a progressively bigger and brighter visual effect on top of that same base look. The effect's style is fixed per item and matches its theme (for example, a dragon-themed border burns with flame that grows at each tier, while a plainer item gets a white glow that intensifies at each tier) - color and style are not player-chosen, so every upgraded item stays visually coherent by design. Before committing stones, a player can open an item's detail page to preview all four tiers (and read a short description or flavor text for the item) so they know exactly how it will look at each stage.

Upgrading is a regrade-gamble system (Lost Ark/Diablo-style), not a guaranteed buyout: each attempt to move up a tier has a success chance, and that chance gets lower at each successive tier. Failing an attempt below the top tier simply fails safely - the stones spent are lost, but the item stays at its current tier. Only the final attempt (tier two to tier three) carries downgrade risk - failing it can knock the item back down one tier. Only some items are upgradable in this way, at least at launch - making every single item upgradable is not feasible.

## Payout Structure

The game is a four-player shedding game where every player keeps playing until their hand (plus face-up and face-down cards) is empty, except for whichever player finishes last still holding cards. Because of that, the payout works differently from a simple winner-takes-all pot.

### Placement floors (baseline share of the pool)

**Baseline model (replaces the old buy-in-relative floors):** the pool is split by placement using a poker-style top-heavy structure - the same shape most widely used and preferred for small single-table payouts (a 50/30/20 split among the top 3, popularized by home poker tournaments). Applied to our 4-player game:

| Place | Baseline share of the pool |
| --- | --- |
| 1st | 50% of the pool |
| 2nd | 30% of the pool |
| 3rd | 20% of the pool |
| 4th | 0% (gets nothing back) |

**Worked example:** 4 players buy in at 50 coins each, so the pool is 200 coins. Baseline payout: 1st gets 100 coins, 2nd gets 60 coins, 3rd gets 40 coins, 4th gets 0 coins (loses their full 50 coin buy-in).

4th place never scales - it is always a flat total loss of the buy-in, regardless of how many cards that player was holding when the match ended.

### Speed bonus (separate house-funded top-up, not a pool split)

**Funding source (resolved):** the speed bonus is paid entirely by the house, on top of whatever a player already earned from their baseline pool share. It is never subtracted from the pool or from other players' shares - the 50/30/20/0 pool split above always stays exactly as calculated, untouched by speed. This keeps the pool fair (nobody loses pool share just because someone else played fast) while still letting a fast, skillful finish feel extra rewarding.

**No bonus for normal or slow play.** There is no bonus by default - a normal-paced win just earns the baseline 50% pool share, nothing more. The house bonus only activates when the winner clears the endgame phase faster than an expected baseline pace. Beating that baseline is what triggers a bonus, and the bonus scales up the further above baseline the winner performs. There is no separate "slow finish" penalty tier - slow or normal play is simply the default, un-bonused outcome.

**Worked examples (illustrative numbers only, not final):** using the 200 coin pool example (1st place's baseline is 100 coins) - a win right at the expected baseline pace earns 100 coins, no bonus. A win moderately faster than baseline might earn a house bonus of +10 coins (110 total). A win dramatically faster than baseline - clearing the endgame in very few turns - might earn a bigger house bonus, e.g. +25 coins (125 total).

**Important - needs real playtest data before the baseline is set.** The "expected pace" itself (what counts as normal vs. faster-than-expected) should not be guessed - it needs to be calibrated from real games. Plan: once the app has a functional prototype, build in a data-recording/calibration mode that logs real match data (cards remaining when the draw pile empties, how many turns/cards it then took the winner to go out, etc.) across many played matches. Use that recorded data to define what "expected pace," "faster than expected," and "dramatically faster" actually mean in practice, and to tune the bonus amounts accordingly - rather than locking in guessed numbers now.

**Design intent:** the multiplier must reward speed/efficiency, not raw card count alone, and must not reward players for recklessly discarding valuable cards just to dodge a penalty. This is a skill-based game built on card counting and calculated play - a payout formula that rewards dumping cards randomly would undermine that core skill element.

### Multiplier formula

**Core insight:** since players keep drawing back up to their working hand size as long as the draw pile has cards, nobody can actually finish while the draw pile is still live. The real "race" only begins once the draw pile runs dry - everything before that is a setup phase, not the endgame.

Because of that, the ratio is measured from **the moment the draw pile empties**, not from the start of the match:

- **Denominator:** total cards still in circulation (hands + face-up + face-down, across all players, draw pile excluded since it's now empty) at the instant the draw pile empties.
- **Numerator:** how many of those cards the eventual winner still had to clear from that instant until they went out.

The ratio is `(numerator / denominator)`, inverted so that clearing a larger share of the remaining cards in fewer turns produces a higher multiplier - mirroring the way UNO's own points-to-coins scale rewards a bigger gap (more points left in the loser's hand) with a bigger payout swing. A player who enters the endgame phase already thin (few cards) and closes it out fast pushes the multiplier toward its top end; a player who barely survives to the finish late, after most cards are already gone, sits near the floor.

*(Note: skillful setup-phase play - like burning piles to shrink circulation, or timing a 5 to enter the endgame with a free bonus play - is player strategy that this formula rewards as a side effect. It's not a separate rule; it just naturally produces a better ratio for players who use it well.)*

### Still to be defined

- **UI note (resolved):** the multiplier is never a player-facing dial or setting - mirroring how 8 Ball Pool keeps its stakes model simple (pick a buy-in tier, win or lose that stake), players only ever pick a buy-in tier here too. The speed-based multiplier runs invisibly behind the scenes and simply shapes the payout they receive - there is no separate multiplier-tier picker in the UI.
  - Exact numeric curve mapping the speed ratio to a multiplier value (e.g. is it linear, stepped into tiers, or exponential toward the top end) is still to be defined.

* **Pot funding: resolved.** Mirroring UNO's own model, the pot in a match is funded purely by player buy-ins - there is no house or bonus contribution added into the pot itself. Any generosity from the house (like the 50 coin daily login reward) happens outside of matches, as a balance top-up, never as bonus money injected into a specific match's pot.

## Planned Future Sections

- **1v1 mode:** a separate mode planned for later. Because 1v1 matches are shorter and play differently (players can track and deduce the opponent's exact hand, rather than just counting cards), this mode needs its own reward/payout curve, separate from the multiplayer formula above.

  **Core scaling principle (resolved):** 1v1 rewards should be scaled down proportionally to how much shorter a 1v1 match is compared to a standard 4-player match, so the coins-earned-per-minute rate stays roughly consistent between modes, rather than a 1v1 match paying out the same as a much longer 4-player match. Illustrative example: if a typical 4-player match takes about 10 minutes and a typical 1v1 match takes about 5 minutes (half the time), then 1v1 payouts should be roughly half of the 4-player payouts. This ratio is illustrative only - the real average match durations need to be measured during testing (see the new Testing and Calibration section below) and the actual scaling factor calculated from that real data, not assumed.
- **Shop and cosmetics (resolved - deliberately deprioritized):** for launch, the shop's actual items are not built - but the shop's UI structure and all of its functions are: a real shop screen with a row of category tabs across the top (mirroring the mode-selection screen's layout), one tab per item type, plus a dedicated currency tab for buying coins with real money. Each category below gets its own tab in that layout, visually ready and fully functional, just empty of real items until built out. The same applies to the profile screen's cosmetic-equipping menu - every slot and category listed below should already be built and working end to end (browsing, selecting, equipping), just with no items populated yet. The goal is that once the core game is solid, the only work left for cosmetics is adding new items into an already-complete menu structure, not building new screens or logic. This layout is a starting point and can change later if needed. Building out actual cosmetic content is intentionally left for last, after everything else in this document (the core game) is built and working well. Nothing in this section should be built until the core is solid and it's explicitly decided to move forward - these are future-scope ideas being written down now so they aren't lost, not a build queue.

  Planned cosmetic and shop categories, all obtainable via direct coin purchase, gambling for a chance at rarer ones, or other future means, unless noted otherwise:
  - **Card skins:** each player picks a deck skin for their own cards. A card shows the skin of whichever player currently holds or plays it - so when a player draws a card, it displays in their own skin, and when they play a card onto the shared pile, it keeps showing their skin to everyone at the table (not a single shared table-wide skin). Other players can see the skin of any card as it's played.
  - **Table themes:** cosmetic reskins of the table/background itself.
  - **Emotes:** animated reactions a player can trigger for themselves during a match, deliberately made hard to obtain, alongside a set of free default emotes everyone starts with.
  - **Chat bubble skins:** the visual style of a player's in-match text chat messages.
  - **Gifts:** unlike the other categories, gifts are not a shop-browsable item - they're used live, aimed at another seated player during a match (e.g. snowballs, tomatoes, hearts, kisses, mirroring UNO's in-match gifting), costing the sender coins. Gifting only works inside a live match, not outside of one. Gifts don't get their own shop tab for this reason.
  - **Coins (currency tab):** a dedicated shop tab for buying coins with real money, following the standard mobile game pattern (like UNO's coins/diamonds top-up store). This tab is part of the shop's core structure, not deferred like the cosmetic categories, since it's the real-money monetization entry point.
  - **Profile picture borders:** a decorative frame around a player's profile image.
  - **Regrade/enchant gambling (not yet designed):** a Lost Ark/Diablo-style mechanic where coins or items are spent for a chance to upgrade a cosmetic item, adding another gambling dynamic on top of the ones above. Only the concept is noted so far - not designed.
- **Post-match rematch flow (resolved):** when a match ends, players see a Play Again button. Anyone who presses it stays together in the same lobby for another round. Anyone who doesn't press it (leaves instead) simply drops out of that lobby, and the remaining players continue on together (with new matchmaking/bots filling any seats that opened up, per the usual lobby rules).

  **In-match text chat (resolved):** beyond the planned emote system above, there should also be actual text chat available during matches. With four players taking turns, there's natural downtime between moves, so chat gives players something to do with that time and adds to the social feel.
- **Progression/rewards system (resolved - level and XP core, achievements/rewards deferred):** for launch, this is just an XP and level system - no achievements, badges, or reward unlocks yet, those come later. A player's level should be shown near their name.

  XP (and coin payouts) are only earned on an actual win - simply playing a match at a given difficulty, without winning it, earns nothing. Any difficulty tier can be freely selected and challenged at any time; the XP reward is what scales with how hard the opponent was, not access to the tier itself.

  XP per win, scaled by opponent difficulty (Medium is the baseline reference point):
  - **Easy bots:** 50 XP per win (50% below the Medium baseline).
  - **Medium bots:** 100 XP per win (baseline).
  - **Hard bots:** 150 XP per win (50% above the Medium baseline).
  - **Expert bots:** 200 XP per win (100% above the Medium baseline).
  - **Human opponents (multiplayer):** earns XP at the same rate as the Hard bot tier, regardless of the actual skill of the humans faced.

  Exact XP amounts per tier, and the XP curve needed to level up, are still to be defined.
- **UI placement (resolved):** a small level number badge sitting right next to the player's name, following the common convention used in games like this.

## Testing and Calibration

Several numbers in this document are placeholders that should not be locked in from guesswork - they need to be tuned using real recorded gameplay data once the app has a functional prototype. This section defines that process, and what data gets logged.

**Bots (resolved - important context):** the app launches with AI opponents (bots) - players start out playing against AIs, not other humans. This has two consequences: (1) the calibration matches described below will mostly be human-vs-bot matches, not human-vs-human, and (2) match logging is also the raw data source for teaching the bots difficulty levels and strategies, based on how real players actually play against them. So the logging system below serves two purposes at once: tuning the coin formulas, and building a training dataset for bot AI.

**Admin panel (resolved):** every match ever played - not just calibration-mode matches - should log its data into a system queryable from an admin panel, so this data is available going forward, not just during an initial calibration burst. The calibration mode is really just an early, deliberate batch of matches played to gather a first round of data before formulas launch; the logging itself should run continuously afterward too.

### What to log per match

**Directly needed now (feeds the speed bonus and 1v1 scaling formulas):**

- Match identity: match ID, timestamp, mode (4-player or 1v1), buy-in tier, and each seated player's ID (human or bot).
- Draw-pile-empty snapshot: the exact moment the draw pile runs out, and at that instant, how many cards each player held (hand + face-up + face-down, broken out), plus the total in circulation.
- Endgame race data: for the eventual winner, how many turns and how much real time it took them to go from that snapshot to zero cards, and how many cards they cleared.
- End-of-match state: final placement and final card counts (hand + face-up + face-down) for every player, not just the winner.
- Whole-match totals: total match duration (real time) and total turn count, logged separately for 4-player vs. 1v1 matches so the two can be compared.

**Worth logging at the same time for likely future use (cheap to capture now, expensive to reconstruct later):**

- Bot-training data: every decision a human player makes against a bot (which card was played, when, and the full game state at that moment) - this is the raw material for teaching bots difficulty levels and strategy later.
- Special card play context: for every 2, 5, or 10 played, log how many cards were left in the draw pile at that moment, what other special cards the player was holding at the same time, and which one they chose to play vs. hold - this captures the hold-vs-spend strategy tradeoffs (e.g. choosing between a held 2 and a held 10 depending on how much draw pile is left).
- Pile-forcing moments: whenever a player is forced to pick up the pile, log who played the card that forced it, how many cards got picked up, and each player's hand size right before it happened.
- Seat/turn order: which seat position each player started in, to later check whether turn order creates a hidden advantage.
- Persistent player ID linkage: tie every match record to a persistent player identity (not just an anonymous one-off record), since future systems like ranks/progression will want win rate and average placement over time per player.

**Calibration plan (resolved):** play 15 standard 4-player matches and a separate batch of 15 1v1 matches (30 matches total) to gather enough data to tune the numbers. The calibration mode should track and display progress clearly while it's underway: how many matches have been completed so far, and how many remain in each batch. Once both batches are complete, the calibration mode should clearly indicate that calibration is finished, and provide a way to download the recorded data. Use the recorded data from those matches to:

- Define what "expected pace," "faster than expected," and "dramatically faster" actually mean for the speed bonus (see Speed bonus section above), instead of guessing.
- Calculate the real average match duration for 4-player vs. 1v1 matches, and use that real ratio to set the 1v1 reward-scaling factor (see 1v1 mode section above), instead of assuming a round number.

This calibration step should happen before any of the illustrative numbers in this document (speed bonus amounts, 1v1 scaling factor) are treated as final.

## Bots and AI Difficulty

The app launches with hand-tuned, rule-based bots rather than machine-learning bots - ML was considered and rejected for a first version as too resource-intensive to build and maintain. Historical match data (see Testing and Calibration above) will double as training data if ML bots are pursued in a later version, but that is not part of the initial build.

There are four difficulty tiers: Easy, Medium, Hard, and Expert. **Medium is the tier used for all calibration matches** (see Testing and Calibration above) - the speed-bonus baseline and other calibrated numbers will reflect human-vs-medium-bot pace specifically, and may need retuning later once Hard bots and real human-vs-human multiplayer data exist.

**Difficulty switcher during calibration (resolved):** the calibration mode should let the tester freely change the bot difficulty tier between matches, rather than being locked to Medium only. This is a pre-match selection, chosen before starting each match, not a setting that can be changed mid-match while playing. This way, if a bot's decisions look illogical or off at one tier while testing, the tester can pick a different tier for their next match to compare behavior, rather than being stuck running only Medium matches throughout the whole calibration process.

### Hold-a-five tendency

Each tier has a probability that the bot will choose to hold a 5 rather than play it immediately, mirroring the real hold-vs-spend tradeoff described in the base rules. This is a tendency, not a hard rule, so bots don't play identically every match:

- **Easy:** holds the 5 about 30% of the time.
- **Medium:** holds the 5 about 70% of the time.
- **Hard:** holds the 5 about 90% of the time.
- **Expert:** holds the 5 about 95% of the time.

### Easy-tier logic (resolved)

Easy is deliberately as simple as possible, to give new players a clear, beatable floor. It has no lookahead and no holding logic at all:

- Always plays the first legal card it finds in hand, scanned in a fixed order (lowest rank first).
- Treats 2, 5, and 10 as ordinary cards - it plays them whenever they happen to be legal in that scan order, with no attempt to hold or save them for a better moment.
- No multiples logic, no card-value prioritization beyond the fixed scan order.

### Card-reading (opponent hand inference)

Only Hard and Expert bots attempt to read what opponents are holding. This is not omniscient card-counting - it is a single success-rate roll representing whether the bot correctly works out something useful about an opponent's hand. A single combined success percentage was chosen deliberately over splitting it into separate "did it notice" and "did it remember correctly" rolls, since that split would not change bot behavior and was judged to be overcomplicating it.

- **Easy and Medium:** no card-reading attempted.
- **Hard:** succeeds about 20-25% of the time.
- **Expert:** succeeds about 50-60% of the time.

Card-reading is not limited to the endgame phase. It triggers off specific, high-visibility events - such as a pile being burned or wiped and revealing what was underneath - whenever those events happen in the match. Early-game play is generally too chaotic and fast-moving to track reliably, so in practice most successful reads will still cluster in the endgame, but the trigger is the event itself, not a phase gate.

## Bot Tactics: Shedding Priority, Loading, and Pile Awareness

The game is treated as three phases for the purposes of bot tactics: **Phase 1** is drawing from the deck (hand refills as long as the draw pile has cards), **Phase 2** is playing from hand once the draw pile is empty but face-up and face-down cards remain, and **Phase 3** is the endgame, going through the hidden face-down cards one at a time. Phase 2 already gives useful information, since the three face-up cards each player holds are visible to everyone - a bot can plan around that information before Phase 3 even begins.

### Shedding priority (resolved)

When a bot has more than one legal card to choose from, this is how often it prioritizes shedding its lowest-value cards first, decluttering its own hand rather than playing higher-value or special cards:

- **Easy:** sheds the lowest-value card first about 20% of the time.
- **Medium:** sheds the lowest-value card first about 70% of the time.

### Loading and pile-awareness tactic (resolved)

This is a more advanced tactic layered on top of shedding priority, used when a bot is deciding what to play against an opponent who is in Phase 2 or Phase 3 (i.e. exposed via face-up cards, or drawing blind from face-down cards):

- **The core idea:** rather than always dumping the best card available, a bot looks for the lowest-value card that is still high enough to force the opponent to pick it up ("send them home") rather than let the opponent legally clear it. Genuinely strong cards are saved for when they matter most, such as an opponent's last remaining face-down card.
- **The pile-awareness check:** before loading a card onto an opponent, the bot also looks at what is sitting in the pile itself. If the pile is small and stacked with dangerous cards - especially multiple 5s - the bot may choose to pick the pile up into its own hand instead of pushing it onto the opponent, since gifting an opponent a pile full of 5s late-game is one of the worst outcomes for the receiving player.
- **Applies in both Phase 2 and Phase 3** - Phase 2 already exposes useful information via face-up cards, so the tactic naturally extends there, not just to the blind Phase 3 endgame.

### Special-card value ranking and the 2-vs-10 tradeoff (resolved)

Under normal circumstances, the three special cards rank in value as: **2 is lowest** (pure throwaway reset), **10 is middle** (burns the pile, but a plain reset), and **5 is highest** (resets the pile AND grants a bonus play). This ranking is what drives the general hold-a-five tendency covered above.

However, a 10 can leapfrog a 5 in value in one specific situation: when the draw pile (Phase 1) still has plenty of cards left, but the bot's own face-up (Phase 2) cards are weak. In that situation, clearing the whole pile outright with a 10 is more valuable than resetting-plus-bonus with a 5, because it's better to burn everything down while there's still runway left, rather than limp toward Phase 2 exposed with bad face-up cards. This tradeoff weighs two inputs together: how many cards remain in the draw pile, and the quality of the bot's own face-up cards.

Frequency of correctly applying this combined tradeoff logic:

- **Easy:** does not apply this logic at all.
- **Medium:** applies it correctly about 50% of the time.
- **Hard and Expert:** apply it correctly 100% of the time - the card-reading layer (see above) is what differentiates Expert from Hard, not this tradeoff, since card-reading is a much bigger factor on its own.

Frequency by tier:

- **Easy:** never uses this tactic.
- **Medium:** uses it about 60% of the time (roughly memorizes the visible cards and the general situation, sometimes imperfectly).
- **Hard and Expert:** use it 100% of the time.

### Playing multiples together (resolved)

When a bot holds two or more cards of the same rank, each tier has a probability that it plays them together as a multiple, rather than playing just one at a time:

- **Easy:** plays multiples together about 40% of the time.
- **Medium:** plays multiples together about 80% of the time.
- **Hard and Expert:** always plays multiples together when available (effectively 100% of the time).
