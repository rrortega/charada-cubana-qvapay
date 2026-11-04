// Tests for src/ui/scrollLock.js
//
// The lock is reference-counted and must restore the exact scroll position, so
// a sheet closing never jumps the page. A double release must not unlock
// someone else's overlay.

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { lockScroll, __resetScrollLockForTests } from '../src/ui/scrollLock.js';

beforeEach(() => {
  __resetScrollLockForTests();
});

/** Minimal scroller + body + window double. */
function fakeEnv({ scrollY = 0, scrollX = 0, innerWidth = 400, clientWidth = 400 } = {}) {
  const classes = new Set();
  const body = {
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
  };
  const scroller = { scrollTop: scrollY, scrollLeft: scrollX, style: {} };
  const win = { innerWidth };
  const doc = {
    body,
    documentElement: { clientWidth },
    getElementById: (id) => (id === 'scroller' ? scroller : null),
  };
  return { doc, win, classes, scroller };
}

test('locking freezes the scroll container, not the body', () => {
  const env = fakeEnv({ scrollY: 320 });
  lockScroll(env.doc, env.win);
  assert.ok(env.classes.has('is-scroll-locked'));
  assert.equal(env.scroller.style.overflow, 'hidden');
});

test('the bottom bar is excluded because only #scroller is locked', () => {
  const env = fakeEnv();
  lockScroll(env.doc, env.win);
  // body itself is never made scrollable or fixed
  assert.equal(env.doc.body.style.position, undefined);
  assert.equal(env.doc.body.style.overflow, undefined);
});

test('releasing restores the exact scroll position', () => {
  const env = fakeEnv({ scrollY: 320, scrollX: 12 });
  const unlock = lockScroll(env.doc, env.win);
  unlock();
  assert.equal(env.classes.has('is-scroll-locked'), false);
  assert.equal(env.scroller.style.overflow, '');
  assert.equal(env.scroller.scrollTop, 320);
  assert.equal(env.scroller.scrollLeft, 12);
});

test('reserves scrollbar width so the layout does not shift', () => {
  const env = fakeEnv({ innerWidth: 400, clientWidth: 385 });
  const unlock = lockScroll(env.doc, env.win);
  assert.equal(env.scroller.style.paddingRight, '15px');
  unlock();
  assert.equal(env.scroller.style.paddingRight, '');
});

test('no padding is reserved when there is no scrollbar', () => {
  const env = fakeEnv({ innerWidth: 400, clientWidth: 400 });
  lockScroll(env.doc, env.win)();
  assert.equal(env.scroller.style.paddingRight, '');
});

test('nested locks keep scrolling frozen until the last one releases', () => {
  const env = fakeEnv({ scrollY: 100 });
  const a = lockScroll(env.doc, env.win);
  const b = lockScroll(env.doc, env.win);

  a();
  assert.ok(env.classes.has('is-scroll-locked'), 'still locked by b');
  assert.equal(env.scroller.style.overflow, 'hidden');
  b();
  assert.equal(env.classes.has('is-scroll-locked'), false);
  assert.equal(env.scroller.scrollTop, 100);
});

test('releasing the same lock twice does not unlock another overlay', () => {
  const env = fakeEnv();
  const a = lockScroll(env.doc, env.win);
  lockScroll(env.doc, env.win);

  a();
  a(); // idempotent: must not decrement twice
  assert.ok(env.classes.has('is-scroll-locked'));
});

test('closing a sheet at scroll 0 restores to 0', () => {
  const env = fakeEnv({ scrollY: 0 });
  lockScroll(env.doc, env.win)();
  assert.equal(env.scroller.scrollTop, 0);
});

test('restores the container position exactly, without animation', () => {
  // Setting scrollTop directly is synchronous: scroll-behavior cannot defer it.
  const env = fakeEnv({ scrollY: 900, scrollX: 0 });
  lockScroll(env.doc, env.win)();
  assert.equal(env.scroller.scrollTop, 900);
  assert.equal(env.scroller.scrollLeft, 0);
});
