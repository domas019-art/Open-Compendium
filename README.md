# Open Compendium

An offline compendium, character builder and character sheet for the 4th edition D&D, as a portable Windows program.

**It contains no game content.** It reads your own library files (the web compendium files and the Character Builder's
`combined.dnd40.merged.xml` made by CBLoader) from the `Libraries` folder next to the programs.

## Folders

| Folder | What is in it |
|---|---|
| `app/` | The program itself: `main.js` (the window, files, no internet), `preload.js`, and `web/` (the screens) |
| `dist-files/` | Files that go next to the program in a release (the user README) |
| `tools/` | The icon, and `brand.ts` (puts the icon and version into the .exe) |

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
