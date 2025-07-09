# TODO

- [] Refactor
- [] Restore is still finicky, although the configs are restored, the actual desklets do not show up
    - The following script actually makes the desklets show up. `gsettings set org.cinnamon enabled-desklets "['notes@schorschii:36:25:725','notes@schorschii:37:25:0','notes@schorschii:38:25:350','notes@schorschii:39:1475:25']"`. Documenting this because I actually use these desklets and have to re-configure them manually if it were not for this script.
- [] Make sure configs are deleted when backing up to avoid duplicates
- [] Make sure backups, caches are cleared on restore
- [] Positions are not remembered
- [] Remove unnecessary logs