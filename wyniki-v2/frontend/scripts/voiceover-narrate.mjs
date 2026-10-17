// Puts what VoiceOver said onto the silent screen recording of a VoiceOver walk (macOS only).
// A runner has no sound device, so the recording is silent; the walk keeps when each phrase was
// said (<name>-timeline.json: [{ t: ms from the recording's start, text }]). Each phrase is spoken
// again with macOS `say` and laid on the video at its time, cut where the next one starts, as
// VoiceOver itself stops mid-phrase on the next move. The voice is the system's, not
// VoiceOver's own audio: the words and the timing are VoiceOver's.
//
//   node scripts/voiceover-narrate.mjs voiceover-results/panel   → voiceover-results/panel-voiced.mp4
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2];
if (!base) throw new Error('usage: voiceover-narrate.mjs <results/name>');
const video = `${base}.mov`;
const timeline = JSON.parse(readFileSync(`${base}-timeline.json`, 'utf8')).filter((entry) => entry.text?.trim());
if (!existsSync(video) || !timeline.length) throw new Error(`nothing to voice: ${video}, ${timeline.length} phrases`);

const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
const voices = execFileSync('say', ['-v', '?'], { encoding: 'utf8' });
const polish = voices.split('\n').find((line) => /\bpl_PL\b/.test(line))?.split(/\s{2,}/)[0]?.trim();
const work = mkdtempSync(join(tmpdir(), 'vo-narrate-'));

const inputs = [];
const filters = [];
timeline.forEach((entry, index) => {
  const file = join(work, `p${index}.aiff`);
  execFileSync('say', [...(polish ? ['-v', polish] : []), '-o', file, entry.text]);
  const next = timeline[index + 1];
  const length = next ? Math.max(0.2, (next.t - entry.t) / 1000) : 30;
  inputs.push('-i', file);
  filters.push(`[${index + 1}:a]atrim=0:${length.toFixed(2)},adelay=${Math.max(0, Math.round(entry.t))}:all=1[a${index}]`);
});
const mix = `${timeline.map((_, index) => `[a${index}]`).join('')}amix=inputs=${timeline.length}:normalize=0,apad[voice]`; // silence to the video's end

execFileSync(ffmpeg, [
  '-y', '-loglevel', 'error', '-i', video, ...inputs,
  '-filter_complex', [...filters, mix].join(';'),
  '-map', '0:v', '-map', '[voice]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
  `${base}-voiced.mp4`,
], { stdio: 'inherit' });
console.log(`${base}-voiced.mp4: ${timeline.length} phrases, voice ${polish || 'system default'}`);
