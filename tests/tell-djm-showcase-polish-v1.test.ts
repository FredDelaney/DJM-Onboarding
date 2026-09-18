import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const capture = readFileSync('components/AiCapture.tsx', 'utf8');
const captureCss = readFileSync('components/AiCapture.module.css', 'utf8');
const launcher = readFileSync('components/AiLauncher.tsx', 'utf8');
const launcherCss = readFileSync('components/AiLauncher.module.css', 'utf8');

test('Tell DJM showcase remains a presentation-only slice', () => {
  assert.match(capture, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(capture, /savePendingAiCapture/);
  assert.match(capture, /redream_ai_receipt/);
  assert.match(capture, /redream_ai_retry_capture/);
  assert.match(launcher, /redream_ai_current_access/);
  assert.match(launcher, /createPortal/);
});

test('shared capture surface receives premium voice and receipt hierarchy', () => {
  assert.match(captureCss, /\/\* Tell DJM showcase polish \*\//);
  assert.match(captureCss, /\.hero\s*\{/);
  assert.match(captureCss, /\.micRecording\s*\{/);
  assert.match(captureCss, /\.receipt\s*\{/);
  assert.match(captureCss, /\.actionRow\s*\{/);
});

test('launcher keeps the existing safe modal behaviour while improving presentation', () => {
  assert.match(launcher, /unsafeToClose/);
  assert.match(launcher, /Finish saving before opening full screen/);
  assert.match(launcher, /event\.target !== event\.currentTarget \|\| unsafeToClose/);
  assert.match(launcherCss, /\.modal\s*\{/);
  assert.match(launcherCss, /\.trigger:hover\s*\{/);
});

test('showcase polish preserves mobile and reduced-motion handling', () => {
  assert.match(
    captureCss,
    /@media \(max-width: 640px\)[\s\S]*\.micRecording/,
  );
  assert.match(
    launcherCss,
    /@media \(max-width: 760px\)[\s\S]*\.modal/,
  );
  assert.match(
    launcherCss,
    /@media \(prefers-reduced-motion: reduce\)/,
  );
});
