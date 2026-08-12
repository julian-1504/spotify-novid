/**
 * Renders the browser harness's findings.
 *
 * Its own module so it can be tested against synthetic reports. It runs once,
 * at the end of an interactive session that involved signing in and tapping
 * through a page — possibly on a phone — so a crash here would throw away work
 * that is genuinely annoying to redo. The caller prints the raw JSON if this
 * throws anyway.
 */

const LINE = '-'.repeat(70);

/** Returns the whole report as a string rather than printing, so it is testable. */
export function renderReport(report) {
  const out = [];
  const say = (s = '') => out.push(s);

  say('\n' + LINE);
  say('WEB PLAYBACK SDK SPIKE');
  say(LINE);

  if (report.fatal) say(`\n✗ FATAL: ${report.fatal}`);

  say('\n[1] SDK boot');
  say(`    device_id       : ${report.deviceId ?? '(never became ready)'}`);
  say(`    activateElement : ${report.activateElement ?? '(not reached)'}`);
  say(`    secure context  : ${report.secureContext}`);
  say(`    user agent      : ${report.userAgent ?? '(unknown)'}`);
  for (const e of report.events ?? []) {
    say(`    ! ${e.event}: ${e.message ?? e.device_id}`);
  }

  say('\n[2] How it reports itself to /me/player/devices');
  if (report.selfDevice) {
    const type = String(report.selfDevice.type ?? '').toLowerCase();
    say(`    name = ${report.selfDevice.name}`);
    say(`    type = ${report.selfDevice.type}`);
    // The app blocks 'computer' on purpose, and blocked-type beats the id pin,
    // so admitting this device means an explicit by-id exception.
    say(
      `    => '${type}' is blocked by src/config.ts, so the app must admit this`,
    );
    say('       device by id rather than by widening the type allowlist.');
  } else {
    say('    ✗ Not present in the device list.');
  }

  const steps = report.steps ?? [];
  say('\n[3]/[4] Playback');
  if (steps.length === 0) say('    (no playback was attempted)');
  for (const s of steps) {
    say(`    ${s.verdict === 'playing' ? '✓' : '✗'} ${s.label}: ${s.verdict}  (HTTP ${s.httpStatus})`);
    if (s.httpBody) say(`      body: ${JSON.stringify(s.httpBody)}`);
    if (s.sdkState) say(`      sdk : ${JSON.stringify(s.sdkState)}`);
  }

  say('\n[5] What the SDK put in our document');
  if (report.dom) {
    say(`    iframes: ${report.dom.frames.length}`);
    for (const f of report.dom.frames) {
      say(`      - ${f.src}`);
      say(`        allow=${f.allow} hidden=${f.hidden}`);
    }
    say(`    video elements: ${report.dom.videos.length}`);
    for (const v of report.dom.videos) say(`      - ${v.src}`);
    say(`    audio elements: ${report.dom.audioElements}`);
    say('    => the runtime guard must allow exactly these iframe origins, nothing else.');
    if (report.dom.videos.length > 0) {
      say('    ⚠ THE SDK CREATED A VIDEO ELEMENT. Re-read the plan before going on:');
      say('      the guard was designed on the assumption that it does not.');
    }
  } else {
    say('    (not scanned)');
  }
  say(`    mediaSession: ${JSON.stringify(report.mediaSession)}`);

  say('\n' + LINE);
  say(verdict(steps));
  say(LINE);

  return out.join('\n');
}

/**
 * The music step is the control: it separates "the SDK does not work here" from
 * "the SDK works but Spotify withholds podcasts from it too", and those two
 * failures have completely different responses.
 */
function verdict(steps) {
  const podcast = steps.find((s) => s.label.startsWith('PODCAST'));
  const music = steps.find((s) => s.label.startsWith('MUSIC'));

  if (podcast?.verdict === 'playing') {
    return [
      'VERDICT: podcasts play through the SDK. The phone-as-player plan holds.',
      'Confirm by ear, then pair the phone to the box over Bluetooth.',
    ].join('\n');
  }
  if (music?.verdict === 'playing') {
    return [
      'VERDICT: music plays but podcasts do not — the SDK is fine, Spotify is',
      'withholding mixed media from it too. Phone-as-player does NOT fix',
      'podcasts; fall back to the open-RSS-feed approach.',
    ].join('\n');
  }
  return [
    'VERDICT: nothing played. The SDK did not work here at all — check the',
    'errors above (Premium, secure context, DRM) before drawing any conclusion',
    'about podcasts.',
  ].join('\n');
}
