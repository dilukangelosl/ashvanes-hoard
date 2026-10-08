# Ashvane's Hoard: The Dragon Heist

## Story
Beneath the volcano Kharros sleeps **Ashvane, the Ember King**, an ancient dragon coiled on a mountain of gold.
A crew of four thieves has tunnelled into his vault:
- **Vex**, the rogue leader
- **Morra**, the alchemist with bottled lightning
- **Brakka**, the brute with a war-hammer
- **Nib**, the goblin pickpocket

Every spin they pry loot loose. Every win makes noise, and noise fills Ashvane's **Wrath**. Wake him and the reels
burn. Find the **Vault Keys** and the inner **Molten Treasury** opens, where loot is struck into **Ember Coins** worth
up to ×500. Legend says one crew walked out with **Ashvane's Ransom: 10,000× their stake**.

## Design
- **Grid:** 6×5, pay anywhere (8+ of a kind), tumbling reels.
- **Symbols:**
  - Low: Ruby, Sapphire, Amethyst, Topaz.
  - High: Nib, Morra, Brakka, Vex.
  - Specials: Dragon Egg (Wild, only from Dragonfire), Vault Key (scatter), Ember Coin (multiplier).
- **Dragon's Wrath:** each tumble adds Wrath. When it's full, Ashvane wakes, breathes fire across the reels and turns 3–8 symbols into Burning Wilds.
- **Ember Coins:** ×2–×500. Their values are summed and applied to the tumble sequence's total win.
- **Molten Treasury:** 4/5/6 keys award 10 free spins (and pay 3×/5×/100× the bet). In free spins, coin multipliers add to a persistent global multiplier. 3+ keys retrigger (+5 spins).
- **Bonus Buy:** 100× the bet.
- **RTP:** target about 96%, set by simulation. Max win 10,000×.

## Opal showcase
Every symbol is a looping transparent video, and so are the dragon host (idle, roar, fire breath), the tumble shatter,
fire blast, coin burst, multiplier explosion, keys, coins, and the win sequences. Everything is rendered with
[`opal-sprites`](https://www.npmjs.com/package/opal-sprites) from npm.
