Open Compendium 0.76
====================

Double-click "Open Compendium.exe". Nothing needs to be installed, and the whole folder can be
moved or copied anywhere (another drive, a flash drive) and run from there.

Your folders (next to the program)
  Libraries\Compendium          the compendium: armor, class, power, ... folders
  Libraries\Character Builder   combined.dnd40.merged.xml and the .part files
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
them again (at the next start, or straight away from the bar it shows). Keep the library and
the Data folder private: they contain the game content.

The program never connects to the internet; every web address is refused.

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
