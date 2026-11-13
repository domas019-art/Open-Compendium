Open Compendium VERSION
====================

Double-click "Open Compendium.exe". Nothing needs to be installed, and the whole folder can be
moved or copied anywhere (another drive, a flash drive) and run from there.

Your folders (next to the program)
  Libraries\Compendium          the compendium: armor, class, power, ... folders
  Libraries\Character Builder   combined.dnd40.merged.xml and the .part files
  Libraries\open-compendium-core.part
                                the core library that comes with the program: point buy and
                                ability arrays, Charge, combat actions, conditions, book names
                                and other lists the program needs. It has no book text and
                                may be shared. Updates replace it.
  Libraries\Homebrew            your homebrew packs (made in the Homebrew tab), one .part file
                                each. Give a pack's file to someone to share it; take it out of
                                the folder to switch it off. Homebrew\Deleted holds the packs you
                                deleted. Old homebrew .part files from the original builder's
                                community can go here too.
  portraits\                    pictures; any picture put here shows up in the Portrait tab
  Characters\                   your characters, one file each (saved automatically).
                                Each folder inside is a character folder in the program
                                (Killed is made for you when a character is ticked Killed).
  Characters\Deleted\           characters you deleted (delete these files yourself if you
                                really want them gone)
  Data\                         the program's own memory: settings, window size, and the
                                prepared library so it starts quickly. Safe to delete: the
                                program reads the Libraries folder again and rebuilds it.

The library is read once and remembered. When files in Libraries change, the program reads
them again (at the next start, or straight away from the bar it shows). Keep the library (apart from
the core library) and the Data folder private: they contain the game content.

The program never connects to the internet; every web address is refused.

Homebrew
  The Homebrew tab makes your own classes, or changes official ones (hit points, skills,
  proficiencies, class features, builds, which powers a class can choose). Everything goes into
  a pack in Libraries\Homebrew, in the original Character Builder's own format, so the packs
  also work with CBLoader. The official files are never changed. Characters using homebrew are
  marked HB.
  A class feature can give powers, bonuses, resistances, skills, proficiencies, feats, other
  features, choices (of features, powers, feats or a companion), extra power picks (a wizard-style
  spellbook), extra damage dice, and changes to powers or weapons; each of these can apply from a
  level on, only with another feature, only if untrained in a skill, or only in some armor.
  Powers can have secondary powers, be usable as basic attacks, or be psionic augmentable
  at-wills. Every original-style class can be rebuilt this way (Essentials and hybrid classes
  not yet).
  Backgrounds can be made or changed too: kind, campaign, prerequisite, common knowledge,
  associated skills and languages, a list of their own benefits, and rules of their own.
  Feats (tier, prerequisites, benefit, feat group, rules) and powers that belong to no class (feat,
  racial and skill powers) can be made or changed as well. Rules the friendlier choices can't show
  appear as "Builder rule (advanced)", so every official entry can be rebuilt; each one says
  in plain words what it does. "Done" saves and goes back to the pack.
  Themes can be made or changed too: their features by level (usually a power at 1st level and
  benefits at 5th and 10th), and the utility powers characters with the theme can choose.
  Paragon paths and epic destinies are made the same way: features by level, and the powers they
  give (a path: an attack at 11th level, a utility at 12th and an attack at 20th; a destiny: a utility
  at 26th).
  Items: magic items (with their +2 to +6 versions made in one click), weapons (characters proficient
  with the weapon's category are proficient with it), armor and gear.
  Races: size, speed, vision, ability score bonuses (fixed, a choice of two, or any one), skill
  bonuses, languages, and racial traits (which can give racial powers).

Prepared Spells
  Wizards, mages and witches get a Prepared Spells tab on the Character Sheet:
  wizard     the spellbook holds two spells of each daily and utility level; tick the one of each
             level you prepare. The other one is left off the Powers tab.
  mage       tick the encounter, daily and utility spells you prepare; your level sets how many,
             and no two of one kind may share a level.
  bladesinger  like the mage, with attack and utility spells; its attack spells are used once per day
             (Boon Spell: one more, which may share a level).
  witch      swap one daily or utility spell for another wizard spell of the same kind and level.
             With Expanded Spellbook she also prepares one of each pair, like the wizard.
  "Done preparing" keeps them until the next extended rest ("Change anyway" if your DM allows).
  The spells are still chosen in the builder; homebrew classes with a wizard-style spellbook work
  like the wizard.

Power points and other limited uses (Character Sheet)
  Psionic characters see their power points under the action points; each augmentable power has
  Augment buttons with that version's numbers, which spend the points. Entropy points, soul shards
  and assassin's shrouds are counted there too, for the characters who have them (with shrouds
  on your target, attack cards suggest the damage invoking them would add). Points come back
  (or empty) on a rest.
  Powers usable more than once ("twice per encounter", "a number of times per day equal to your
  Wisdom modifier") show how many uses are left; Channel Divinity powers share one use per encounter
  (two while bloodied with Dervish Ecstasy; "+1 use" for Medic's Weapon, Symbol of Divinity and
  Implacable Mettle; once per day each without the Channel Divinity class feature), healing infusions
  share theirs.

Imperial / Metric
  The button next to Light/Dark shows every measurement in feet and pounds, or in meters and
  kilograms (rounded to the nearest half). Areas on the grid ("a 5-foot radius") become squares.

Keys
  Ctrl + / Ctrl - / Ctrl 0   bigger / smaller / normal size
  F11                        full screen
  F5                         reload the page (your characters are saved first)

Program folder
  Open Compendium.exe and the files beside it (locales, resources, .dll, .pak, ...) are the
  engine (Electron, MIT licence). The app itself is in resources\app; updates replace only
  that folder. (The version shown by the .exe's file properties is the engine's; the app's own
  version is at the foot of the Start page.)
