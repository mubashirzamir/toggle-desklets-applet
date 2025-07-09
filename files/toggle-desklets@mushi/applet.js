const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Main = imports.ui.main;

function MyApplet(metadata, orientation, panel_height, instance_id) {
    this._init(metadata, orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(metadata, orientation, panel_height, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        let TESTING = false;
        this.set_applet_label("📎️");
        this.set_applet_tooltip("Toggle desklets");

        this._settings = new Gio.Settings({ schema: 'org.cinnamon' });

        let uuid = metadata.uuid || 'toggle-desklets@mushi';

        if (TESTING) {
            uuid += '-testing';
        }

        this._cacheRoot = GLib.build_filenamev([GLib.get_user_cache_dir(), uuid]);
        this._cacheFile = GLib.build_filenamev([this._cacheRoot, 'desklet-toggle-cache.json']);
        this._configBackupDir = GLib.build_filenamev([this._cacheRoot, 'desklet-toggle-backups']);

        GLib.mkdir_with_parents(this._cacheRoot, 0o755);

        this._cache = this._loadCache();

        global.logError("[DeskletToggle] Applet initialized");
    },

    _loadCache: function() {
        try {
            if (GLib.file_test(this._cacheFile, GLib.FileTest.EXISTS)) {
                let [, contents] = GLib.file_get_contents(this._cacheFile);
                return JSON.parse(imports.byteArray.toString(contents));
            }
        } catch (e) {
            global.logError("[DeskletToggle] Failed to load cache: " + e);
        }
        return [];
    },

    _saveCache: function(cacheArray) {
        try {
            GLib.mkdir_with_parents(this._cacheRoot, 0o755);
            let contents = JSON.stringify(cacheArray);
            GLib.file_set_contents(this._cacheFile, contents);
            global.logError(`[DeskletToggle] Saved cache to ${this._cacheFile}`);
        } catch (e) {
            global.logError("[DeskletToggle] Failed to save cache: " + e);
        }
    },

    _backupConfigs: function(deskletList) {
        const spicesDir = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'cinnamon', 'spices']);
        const backupRoot = this._configBackupDir;

        try {
            GLib.mkdir_with_parents(backupRoot, 0o755);

            deskletList.forEach(entry => {
                let parts = entry.split(":");
                if (parts.length < 2) return;

                let uuid = parts[0];
                let instanceId = parts[1];
                let filename = `${instanceId}.json`;

                let deskletDir = `${spicesDir}/${uuid}`;
                let sourcePath = `${deskletDir}/${filename}`;
                let configDir = `${deskletDir}/config`;

                let backupDir = `${backupRoot}/${uuid}`;
                let destPath = `${backupDir}/${filename}`;
                let configBackupDir = `${backupDir}/config`;

                GLib.mkdir_with_parents(backupDir, 0o755);

                if (GLib.file_test(sourcePath, GLib.FileTest.EXISTS)) {
                    GLib.spawn_command_line_sync(`cp "${sourcePath}" "${destPath}"`);
                    global.logError(`[DeskletToggle] Backed up: ${sourcePath} → ${destPath}`);
                }

                if (GLib.file_test(configDir, GLib.FileTest.IS_DIR)) {
                    GLib.mkdir_with_parents(configBackupDir, 0o755);
                    GLib.spawn_command_line_sync(`cp -r "${configDir}/" "${configBackupDir}/"`);
                    global.logError(`[DeskletToggle] Backed up config dir: ${configDir} → ${configBackupDir}`);
                }
            });
        } catch (e) {
            global.logError("[DeskletToggle] Config backup error: " + e);
        }
    },

    _restoreConfigs: function() {
        const spicesDir = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'cinnamon', 'spices']);
        const backupRoot = this._configBackupDir;

        try {
            if (!GLib.file_test(backupRoot, GLib.FileTest.IS_DIR)) {
                global.logError("[DeskletToggle] No backup directory found");
                return;
            }

            let backupDir = Gio.File.new_for_path(backupRoot);
            let uuidDirs = backupDir.enumerate_children('standard::name', 0, null);

            let uuidEntry;
            while ((uuidEntry = uuidDirs.next_file(null)) !== null) {
                let uuid = uuidEntry.get_name();
                let sourceUuidDir = `${backupRoot}/${uuid}`;
                let destUuidDir = `${spicesDir}/${uuid}`;

                // Restore all instance config files
                let configFiles = Gio.File.new_for_path(sourceUuidDir).enumerate_children('standard::name', 0, null);
                let fileEntry;
                while ((fileEntry = configFiles.next_file(null)) !== null) {
                    let fileName = fileEntry.get_name();
                    let src = `${sourceUuidDir}/${fileName}`;
                    let dest = `${destUuidDir}/${fileName}`;

                    if (fileName === "config") continue; // skip folder name

                    if (GLib.file_test(src, GLib.FileTest.EXISTS)) {
                        GLib.spawn_command_line_sync(`cp "${src}" "${dest}"`);
                        global.logError(`[DeskletToggle] Restored config: ${src} → ${dest}`);
                    }
                }

                // Restore config directory if exists
                let backupConfigDir = `${sourceUuidDir}/config`;
                let destConfigDir = `${destUuidDir}/config`;

                if (GLib.file_test(backupConfigDir, GLib.FileTest.IS_DIR)) {
                    GLib.mkdir_with_parents(destConfigDir, 0o755);
                    GLib.spawn_command_line_sync(`cp -r "${backupConfigDir}/" "${destConfigDir}/"`);
                    global.logError(`[DeskletToggle] Restored config dir: ${backupConfigDir} → ${destConfigDir}`);
                }
            }

            // Cleanup
            GLib.spawn_command_line_sync(`rm -rf "${backupRoot}"`);
            global.logError(`[DeskletToggle] Cleared backup directory: ${backupRoot}`);
        } catch (e) {
            global.logError("[DeskletToggle] Config restore error: " + e);
        }
    },

    on_applet_clicked: function() {
        let enabledDesklets = this._settings.get_strv('enabled-desklets');
        global.logError(`[DeskletToggle] Current enabled desklets: ${enabledDesklets.join(", ")}`);

        if (enabledDesklets.length > 0) {
            this._saveCache(enabledDesklets);
            this._backupConfigs(enabledDesklets);

            this._settings.set_strv('enabled-desklets', []);
            global.logError("[DeskletToggle] Disabled all desklets and backed up configs");
        } else {
            this._restoreConfigs();

            let toEnable = this._cache.length > 0 ? this._cache : [];
            this._settings.set_strv('enabled-desklets', toEnable);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            Main.deskletManager._onEnabledDeskletsChanged();
                return GLib.SOURCE_REMOVE;  // run once
            });
            global.logError(`[DeskletToggle] Re-enabled desklets from cache: ${toEnable.join(", ")}`);

            this._saveCache([]);

            // Optionally clear the cache dir itself
            GLib.spawn_command_line_sync(`rm -f "${this._cacheFile}"`);
        }
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    global.logError("[DeskletToggle] main() called");
    return new MyApplet(metadata, orientation, panel_height, instance_id);
}
