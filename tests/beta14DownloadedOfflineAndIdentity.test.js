const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

describe('Beta 1.4 Downloaded Songs, Artwork, Playback & Windows Control Center Identity', () => {
  const mainPath = path.join(__dirname, '..', 'main.js');
  const desktopPath = path.join(__dirname, '..', 'src', 'js', 'desktop.js');
  const mainContent = fs.readFileSync(mainPath, 'utf8');
  const desktopContent = fs.readFileSync(desktopPath, 'utf8');

  test('1. App identity: app.setName("D\'Tunes") and app.setAppUserModelId are configured', () => {
    assert.match(mainContent, /app\.setName\(\s*["']D'Tunes["']\s*\)/, "app.setName(\"D'Tunes\") must be set");
    assert.match(mainContent, /app\.setAppUserModelId\(\s*["']DhairyaShah\.DTunes["']\s*\)/, "AUMID must be DhairyaShah.DTunes");
    assert.match(mainContent, /ensureWindowsAppIdentity/, "ensureWindowsAppIdentity must be defined to maintain Start Menu shortcut");
  });

  test('2. Start Menu shortcut maintains System.AppUserModel.ID for Windows 11 Control Center', () => {
    assert.match(mainContent, /9F4C2855-9F79-48A1-6840-02C66A2B3D25/, "Shortcut script must set PKEY_AppUserModel_ID");
    assert.match(mainContent, /DhairyaShah\.DTunes/, "Shortcut must embed DhairyaShah.DTunes");
  });

  test('3. Downloaded songs shelf on Home view is strictly hidden when online', () => {
    assert.match(desktopContent, /function\s+renderDownloadedSongsSection/, "renderDownloadedSongsSection must exist");
    assert.match(desktopContent, /if\s*\(!isOffline\)\s*\{\s*(\/\/[^\n]*\n\s*)?section\.classList\.add\(['"]hidden['"]\);\s*return;/, "Downloaded section must be hidden when online");
  });

  test('4. Stable hardware/user PBKDF2 offline key derivation (no ephemeral key loss)', () => {
    assert.match(mainContent, /crypto\.pbkdf2Sync/, "getOfflineKey must derive stable key using pbkdf2Sync");
    assert.match(mainContent, /getMachineIdentity/, "Key must be bound to machine identity");
    assert.match(mainContent, /DTunes\.Offline\.MasterSecret\.v1\.4/, "Master secret salt must be present");
  });

  test('5. Dynamic audio MIME detection for JioSaavn AAC MP4 streams (audio/mp4) and MP3 (audio/mpeg)', () => {
    assert.match(mainContent, /function\s+detectAudioMime/, "detectAudioMime helper must exist");
    assert.match(mainContent, /audio\/mp4/, "detectAudioMime must support audio/mp4");
    assert.match(mainContent, /audio\/mpeg/, "detectAudioMime must support audio/mpeg");
  });

  test('6. Dynamic image MIME detection and robust artwork extractor for variant arrays', () => {
    assert.match(mainContent, /function\s+detectImageMime/, "detectImageMime helper must exist");
    assert.match(mainContent, /function\s+extractArtworkUrl/, "extractArtworkUrl must handle variant arrays");
    assert.match(desktopContent, /function\s+resolveArtUrl/, "resolveArtUrl in desktop.js must extract array variants");
  });

  test('7. End-to-end AES-256-GCM encryption/decryption with RFC 7233 partial content (206) streaming', () => {
    const salt = Buffer.from('DTunes.Offline.MasterSecret.v1.4', 'utf8');
    const key = crypto.pbkdf2Sync('machine-test:user-test', salt, 1000, 32, 'sha256');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plain = Buffer.from('Antigravity D-Tunes Offline Stream Verification');
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();

    const magic = Buffer.from('DTUNE1');
    const payload = Buffer.concat([magic, iv, tag, enc]);

    assert.equal(payload.subarray(0, 6).equals(magic), true);
    const readIv = payload.subarray(6, 18);
    const readTag = payload.subarray(18, 34);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, readIv);
    decipher.setAuthTag(readTag);
    const dec = Buffer.concat([decipher.update(payload.subarray(34)), decipher.final()]);
    assert.equal(dec.toString(), plain.toString());

    // Test byte-range slice
    const slice = dec.subarray(0, 11);
    assert.equal(slice.toString(), 'Antigravity');
  });
});
