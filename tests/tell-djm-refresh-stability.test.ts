import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fullPage = readFileSync('components/TellDjmFullPage.tsx', 'utf8');
const recent = readFileSync('components/TellDjmRecentCaptures.tsx', 'utf8');

test('Tell DJM full page uses a stable completion callback', () => {
  assert.match(fullPage, /useCallback/);
  assert.match(fullPage, /const handleCaptureCompleted = useCallback/);
  assert.match(fullPage, /onCompleted=\{handleCaptureCompleted\}/);
  assert.doesNotMatch(
    fullPage,
    /onCompleted=\{\(\) => setRecentRefreshKey/,
  );
});

test('Tell DJM Recent refreshes in place without clearing the visible list', () => {
  assert.match(recent, /const \[initialLoading, setInitialLoading\]/);
  assert.match(recent, /const \[refreshing, setRefreshing\]/);
  assert.match(recent, /const firstLoadRef = useRef\(true\)/);
  assert.match(recent, /if \(initial\) setItems\(\[\]\)/);
  assert.match(recent, /aria-busy=\{refreshing\}/);
  assert.doesNotMatch(recent, /setLoading\(true\)/);
});
