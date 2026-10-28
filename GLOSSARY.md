# PocketCheck

A personal NFL pregame research journal. The record is the product: an analysis, a placed bet, and a model forecast stay distinguishable after kickoff.

## Language

**Research offer**:
The sportsbook price an analysis studies: market, selection, point line, rules, sportsbook, American odds, and observation time.
_Avoid_: Contract, bet, ticket

**Contract**:
The terms of an actual bet as placed, which can differ from the research offer.
_Avoid_: Offer (for a placed bet)

**Actual bet**:
A bet the user placed, recorded with its own contract, placement time, stake units, and submission identifier.
_Avoid_: Pick, play

**Analysis snapshot**:
The frozen record of one analysis: game, research offer, decision cutoff, evidence, gaps, model identity, and policy result.
_Avoid_: Report draft, result

**Freeze**:
The moment an analysis snapshot becomes unchangeable; later prices become a refresh, not an edit.
_Avoid_: Save, submit (when the frozen nature matters)

**Refresh**:
A later analysis linked to its parent that keeps the market and selection but may change the point line, sportsbook, odds, and observation time.
_Avoid_: Update, edit, re-run

**Primary**:
The earliest completed analysis of a game whose decision cutoff is strictly before kickoff.
_Avoid_: Main analysis, first pick

**Game board**:
The sportsbook prices for one game as entered together: both sides of any of the moneyline, spread, and total from one sportsbook at one observation time.
_Avoid_: Slate, ticket, offer (for the whole board)

**Model pick**:
The side the forecasting model prefers in one market of a game board, with its strength grade and reasons. It is a system assessment, not a bet.
_Avoid_: Pick (alone), play, recommendation, tip

**Primary model pick**:
The earliest completed model pick for one game and market whose decision cutoff is strictly before kickoff.
_Avoid_: Primary (alone, when the research analysis is meant), first pick

**Strength grade**:
How strongly the numbers support a model pick: strong, lean, or no edge. It comes from expected value at the entered prices, never from the drafter.
_Avoid_: Confidence, stars, rating

**Unvalidated model pick**:
A model pick in a market that has not passed the release gate. It is shown and tracked but is not evidence of an edge.
_Avoid_: Value candidate, released pick

**Forecasting model**:
The fitted statistical artifact that produces outcome probabilities from game history.
_Avoid_: Model (when the drafter could be meant), AI

**Drafter**:
The AI provider model or fixture that writes a thesis or pick explanation from supplied evidence. It cannot choose a side or a number.
_Avoid_: Model (alone), AI pick

**Anchor line**:
The no-vig market probability or line a forecast starts from before the forecasting model adjusts it. At decision time it comes from the game board; in history it comes from the recorded close.
_Avoid_: Prior (alone), opening line (unless it is one)

**Best available price**:
The highest decimal odds among the sportsbook quotes the user entered for one side of one market at one time.
_Avoid_: Best line (when the point line differs), market price
