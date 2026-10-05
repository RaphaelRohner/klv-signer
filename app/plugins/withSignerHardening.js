/**
 * withSignerHardening.js — two extra Android settings for the Signer
 * ==================================================================
 *
 * Expo writes the Android "manifest" (the app's settings file) during the
 * build. This small plugin (listed in app.json → plugins) adds two settings
 * there that app.json has no direct option for (third AI review, 5 Oct 2026):
 *
 * 1. NOTHING IS COPIED TO A NEW PHONE OR A BACKUP (review item A10)
 *    Cloud backup is already off (app.json, allowBackup: false). Android 12+
 *    also has "device-to-device transfer" (moving to a new phone with a
 *    cable or Wi-Fi), which allowBackup doesn't cover. These rules exclude
 *    every kind of app data from both. (The stored wallet couldn't be opened
 *    on another phone anyway, its lock key stays in this phone's chip; but
 *    nothing should even be copied.) Before, this only held because of a
 *    default in expo-secure-store; now it's explicit and covers everything.
 *    A new phone gets the wallet the right way: from the recovery words.
 *
 * 2. THE SIGNER'S SCREENS DON'T SHARE A "TASK" WITH ANY OTHER APP (A4)
 *    taskAffinity="" on the main screen: another app can't slip its own
 *    look-alike screen into the Signer's stack of screens (an older trick
 *    called task hijacking / StrandHogg; Android 12+ already blocks the
 *    known versions, this closes the rest).
 */

const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RULES_NAME = 'klv_signer_data_extraction_rules';

// Every data area Android knows, excluded from cloud backup and from
// device-to-device transfer.
const DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];
const excludes = DOMAINS.map((d) => `    <exclude domain="${d}" path="." />`).join('\n');
const RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- KLV Signer: nothing is backed up or copied to another phone (plugins/withSignerHardening.js). -->
<data-extraction-rules>
  <cloud-backup>
${excludes}
  </cloud-backup>
  <device-transfer>
${excludes}
  </device-transfer>
</data-extraction-rules>
`;

function withRulesFile(config) {
  return withDangerousMod(config, ['android', async (cfg) => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${RULES_NAME}.xml`), RULES_XML);
    return cfg;
  }]);
}

function withManifestSettings(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:dataExtractionRules'] = `@xml/${RULES_NAME}`;
    const main = (app.activity || []).find((a) => a.$ && a.$['android:name'] === '.MainActivity');
    if (!main) throw new Error('withSignerHardening: MainActivity not found in the manifest.');
    main.$['android:taskAffinity'] = '';
    return cfg;
  });
}

module.exports = function withSignerHardening(config) {
  return withManifestSettings(withRulesFile(config));
};
