/*
 * keepFocusedVisible.js — keeps the text box you type in above the keyboard
 * ==========================================================================
 *
 * Added 2 Nov 2026 (Raphael: the keyboard hid the text boxes, as it did in
 * the Signer). Not about the Signer at all, just a common Android problem:
 * Expo apps draw "edge to edge", so Android no longer shrinks the screen by
 * itself when the keyboard opens. Two parts fix it (same as in the Signer's
 * ui.js and the Devikins Legacy Hub):
 *   1. App.js wraps the page in a KeyboardAvoidingView (behavior "padding"),
 *      so the page gets shorter by the keyboard's height;
 *   2. this hook scrolls the box you're typing in into view when the
 *      keyboard opens or another box gets the focus, if it's hidden.
 *
 * Use:
 *   const { scrollProps, reveal } = useKeepFocusedVisible();
 *   <ScrollView {...scrollProps}> … <TextInput onFocus={reveal} … />
 */
import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, TextInput } from 'react-native';

const ROOM_ABOVE = 80; // px of the page left visible above the box (its label)
const ROOM_BELOW = 16; // px the box keeps from the keyboard's edge

export function useKeepFocusedVisible() {
  const scrollRef = useRef(null);
  const view = useRef({ top: 0, height: 0 }); // the visible part of the page

  const reveal = useCallback(() => {
    // (a moment later: by then the page has shrunk for the keyboard)
    setTimeout(() => {
      const box = TextInput.State?.currentlyFocusedInput?.();
      const scroll = scrollRef.current;
      const content = scroll?.getInnerViewRef?.();
      if (!box || !scroll || !content || typeof box.measureLayout !== 'function') return;
      try {
        box.measureLayout(content, (x, y, w, h) => {
          const { top, height } = view.current;
          const hidden = y < top || (height > 0 && y + h > top + height - ROOM_BELOW);
          if (hidden) scroll.scrollTo({ y: Math.max(0, y - ROOM_ABOVE), animated: true });
        }, () => {}); // not on this page: leave it
      } catch {
        // (measuring can fail on an unusual setup: then just don't scroll)
      }
    }, 150);
  }, []);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', reveal);
    return () => sub.remove();
  }, [reveal]);

  const scrollProps = {
    ref: scrollRef,
    onLayout: (e) => { view.current.height = e.nativeEvent.layout.height; },
    onScroll: (e) => { view.current.top = e.nativeEvent.contentOffset.y; },
    scrollEventThrottle: 32,
  };
  return { scrollProps, reveal };
}
