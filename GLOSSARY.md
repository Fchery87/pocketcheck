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
