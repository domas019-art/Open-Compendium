# Open Compendium

An offline compendium, character builder and character sheet for the 4th edition D&D, as a portable Windows program.

**It contains no game content.** It reads your own library files (the web compendium files and the Character Builder's
`combined.dnd40.merged.xml` made by CBLoader) from the `Libraries` folder next to the programs. The only library it
comes with is `Libraries/open-compendium-core.part`: short rules summaries and lists the program needs (point buy and
ability arrays, Charge, combat actions, conditions, book names, the counters shown on the character sheet), written for
this project, with no book text.

**Homebrew.** The Homebrew tab makes your own content, or changes official content, without editing any file by hand:
classes and their powers, backgrounds, feats, powers that belong to no class, themes, paragon paths, epic destinies,
items (magic items, weapons, armor, gear) and races with subraces. Everything goes into a pack (one `.part` file in `Libraries\Homebrew`) written in the original Character
Builder's own format, so packs also work in the original builder through CBLoader, and old homebrew `.part` files load
here. Official files are never changed, and characters using homebrew are marked HB. A class feature can give powers, bonuses, resistances,
skills, proficiencies, feats, other features, choices (of features, powers, feats or a companion), extra power picks (a
wizard-style spellbook), extra damage dice, and changes to powers or weapons, each from a level on, only with another
feature, only if untrained in a skill, or only in some armor. Powers can have secondary powers, be usable as basic
attacks, or be psionic augmentable at-wills. Every original-style class can be rebuilt this way (Essentials and hybrid
classes not yet).

**Character sheet.** Hit points, surges, action points, conditions and effects, used powers, the worked-out attack and
damage of every power, companions and mounts. Wizards, mages, bladesingers and witches prepare their spells on a
Prepared Spells tab. Psionic power points (with an Augment button for each augmented version of a power), and other
counters such as entropy points, soul shards and assassin's shrouds, sit under the action points. Powers usable more
than once ("twice per encounter", "times per day equal to your Wisdom modifier") count their uses, and Channel Divinity
powers share theirs.

**Newer monster math.** A switch in the compendium shows older monsters with the damage, defenses and solo hit points of
the Monster Manual 3 era, with a note listing what changed. The tables it uses are in the core library.

## Folders

| Folder | What is in it |
|---|---|
| `app/` | The program itself: `main.js` (the window, files, no internet), `preload.js`, and `web/` (the screens, below) |
| `dist-files/` | Files that go next to the program in a release (the user README and the core library, `Libraries/open-compendium-core.part`) |
| `tools/` | The icon, and `brand.ts` (puts the icon and version into the .exe) |

### The program's files (`app/web/`)

Each file starts with a comment saying what it does. In short:

| File | What it does |
|---|---|
| `index.html`, `app.css` | The page and its look (light parchment and dark themes) |
| `compendium.js` | Reading the libraries, the compendium tab, search, book lists; `APP_VERSION` |
| `rules.js` | The rules engine: reads the Character Builder's library and works out a character from its choices; the core library |
| `builder.js` | The character builder screens (Start, Build, the character list and folders) |
| `shop.js` | The shop: equipment, rituals, alchemy, martial practices |
| `manage.js` | Manage: details, level up, portrait, journal, companions, summary, campaign settings |
| `charsheet.js` | The character sheet: play tracking, power cards with their numbers, Prepared Spells, counters |
| `homebrew.js` | The Homebrew tab: making and changing content, written as `.part` packs |
| `monsters.js` | Newer monster math for older monsters |
| `importer.js` | Importing the original builder's `.dnd4e` characters |
| `portraits.js`, `units.js` | Portraits and pictures; imperial or metric measurements |

Game numbers and lists are not written into these files: they come from the libraries (the program reads the entries'
own fields and wording), and the few tables the program needs (point buy, experience, monster math, the sheet's counters) are in `dist-files/Libraries/open-compendium-core.part`,
which can be edited like any other library file.

## Making a release

See [tools/BUILD.md](tools/BUILD.md). A full release is the Electron engine with `app/` copied into
`resources/app`. An update release is just the `app/` folder, zipped as `resources/app`.

## Version

The version is in `app/package.json` and `APP_VERSION` in `app/web/compendium.js` (shown at the foot of the Start page).

## Made with AI

This program was written by Claude, an AI assistant made by Anthropic, working with the project's owner, who
designed it, tested every version and decided what goes in. The owner is a player, not a programmer: the code,
the build and most of the documentation are AI-written. Bug reports and suggestions are welcome all the same.

## Download

Get the latest version from [Releases](https://github.com/domas019-art/Open-Compendium/releases): the full zip for a new
install, or the update zip to unzip over an existing copy.

- **New install:** download `Open-Compendium-<version>.zip`, unzip it anywhere and run `Open Compendium.exe`. This zip is
  the complete program; it does not need the update zip.
- **Updating:** download `Open-Compendium-<version>-update.zip` and unzip it over your existing program folder (it holds
  only the program's own files, so your characters, library and settings stay).
- **You need your own library files.** The program contains no game content. Put the D&D Compendium files in
  `Libraries\Compendium` and the Character Builder files (`combined.dnd40.merged.xml` and any `.part` files) in
  `Libraries\Character Builder`. Without them it opens with a "No library found" notice. Either library on its own works.
- The program is not code-signed, so Windows may show "Windows protected your PC" the first time. Click
  **More info**, then **Run anyway**.

## Plans

- Linux and Android versions (Windows only for now)
- More homebrew: feats, powers, magic items, backgrounds, themes and races of your own
- DM tools based on Masterplan: encounters and changing a monster's level (using the same monster math as the compendium)

## Reporting a bug

Open an [issue](https://github.com/domas019-art/Open-Compendium/issues/new?template=bug_report.md) and include:

- the version number (at the foot of the Start page);
- what happened and what you expected, and the steps to make it happen again;
- a screenshot of the problem;
- for anything about a character, its file: "Show file" on the Start page finds it (a `.json` in the Characters folder; zip it to attach it).

Please don't attach anything from the Libraries folder: it is game content and can't be shared publicly.

## Building

The program is built by GitHub from this repository (Actions → Build): `tools/build.sh` downloads Electron 44.9.3,
checks it against Electron's published checksums, brands the exe and adds `app/`. Every release zip comes from that build.

## Privacy

This program does not transfer any information to other networked systems. It makes no internet connections at all;
every web address is refused.

## Legal

Open Compendium contains no game content: it reads library files you already own. It is an unofficial fan project, not affiliated with or endorsed by Wizards of the Coast. Dungeons & Dragons and D&D are trademarks of Wizards of the Coast LLC. The program's own code is under the MIT licence (see LICENSE); the Electron engine it runs on is under its own MIT licence.
