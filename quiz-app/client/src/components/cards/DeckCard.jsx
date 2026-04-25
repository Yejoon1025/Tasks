/**
 * DeckCard — spring-animated drag wrapper with a built-in stopwatch.
 *
 * Gestures:
 *   Left / Right → record result, card flies off horizontally
 *   Up           → re-queue card (moves to end of deck), card flies off upward
 *
 * Timer:
 *   Starts the first time the user taps the card surface (idempotent).
 *   Elapsed time (in decimal minutes, 1 d.p.) is passed to onSwipe so callers
 *   can persist it to Google Sheets.  Time is NOT reported on skip (up-swipe)
 *   because the card will return and time will be tracked when it is finally
 *   acted on.
 *
 * Delegates face rendering to FlashCard, TaskCard, or WarmupCard.
 */
import { useState, useEffect, useRef } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from '@use-gesture/react';

import FlashCard  from './FlashCard.jsx';
import TaskCard   from './TaskCard.jsx';
import WarmupCard from './WarmupCard.jsx';

import {
  SWIPE_THRESHOLD_PX,
  SWIPE_VELOCITY,
  SWIPE_UP_THRESHOLD_PX,
  SWIPE_UP_VELOCITY,
  FLY_DISTANCE_PX,
  FLY_ROTATION_DEG,
  DRAG_ROTATION_DIV,
  CARD_TYPE,
} from '../../config.js';

import '../../styles/cards.css';

// ─── Label copy per card type ──────────────────────────────────────────────
// Questions from the API have no explicit type tag, so DEFAULT_LABELS applies.
const DEFAULT_LABELS = { right: 'Correct', left: 'Incorrect', up: 'Again' };
const LABELS = {
  [CARD_TYPE.TASK]:   { right: 'Complete', left: 'Defer', up: 'Skip' },
  [CARD_TYPE.WARMUP]: { right: 'Done',     left: 'Skip',  up: 'Skip' },
};

// ─── Timer helpers ─────────────────────────────────────────────────────────
/** Format elapsed seconds as M:SS */
function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Compute decimal minutes from a start timestamp.
 * Returns a value rounded to 1 decimal place (e.g. 1.5 = 1m 30s).
 * Returns 0 if the timer was never started.
 */
function computeMinutes(startTimeMs) {
  if (!startTimeMs) return 0;
  const seconds = Math.floor((Date.now() - startTimeMs) / 1000);
  return Math.round(seconds / 6) / 10; // /6 = /60*10, then /10 = 1 d.p.
}

// ──────────────────────────────────────────────────────────────────────────
export default function DeckCard({ question, onSwipe, onSkip, stackStyle }) {
  const [gone, setGone] = useState(false);

  const { right: rightLabel, left: leftLabel, up: upLabel } =
    LABELS[question.type] ?? DEFAULT_LABELS;

  // ── Spring ──────────────────────────────────────────────────────────────
  const [{ x, y, rotate }, api] = useSpring(() => ({ x: 0, y: 0, rotate: 0 }));

  // ── Timer ────────────────────────────────────────────────────────────────
  const [timerActive,   setTimerActive]   = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef  = useRef(null);  // ms timestamp of timer start
  const intervalRef   = useRef(null);  // setInterval handle

  /** Start the timer on first tap. Idempotent — safe to call multiple times. */
  function startTimer() {
    if (timerActive || gone) return;
    setTimerActive(true);
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(
      () => setElapsedSeconds(s => s + 1),
      1000,
    );
  }

  // Clear the interval when the card unmounts (post-swipe animation cleanup)
  useEffect(() => () => clearInterval(intervalRef.current), []);

  // ── Indicator opacities ──────────────────────────────────────────────────
  const rightOpacity = x.to(v => Math.min(Math.max( v / SWIPE_THRESHOLD_PX,    0), 1));
  const leftOpacity  = x.to(v => Math.min(Math.max(-v / SWIPE_THRESHOLD_PX,    0), 1));
  const upOpacity    = y.to(v => Math.min(Math.max(-v / SWIPE_UP_THRESHOLD_PX, 0), 1));

  // Subtle green/red tint on the card surface while dragging horizontally
  const surfaceBg = x.to(v => {
    const t = Math.min(Math.abs(v) / 400, 0.07);
    if (v >  10) return `linear-gradient(135deg, rgba(16,185,129,${t}) 0%, var(--color-surface) 100%)`;
    if (v < -10) return `linear-gradient(135deg, var(--color-surface) 0%, rgba(244,63,94,${t}) 100%)`;
    return 'var(--color-surface)';
  });

  // ── Drag gesture ─────────────────────────────────────────────────────────
  const bind = useDrag(
    ({ active, movement: [mx, my], velocity: [vx, vy] }) => {
      if (gone) return;

      if (active) {
        api.start({
          x:         mx,
          y:         Math.min(0, my), // only follow finger upward
          rotate:    mx / DRAG_ROTATION_DIV,
          immediate: true,
        });
      } else {
        // Upward gesture: vertical movement dominates and threshold met
        const isUp =
          (Math.min(0, my) < -SWIPE_UP_THRESHOLD_PX && Math.abs(my) >= Math.abs(mx)) ||
          (vy < -SWIPE_UP_VELOCITY && Math.abs(vy) >= Math.abs(vx));

        // Horizontal swipe
        const isHorizontal =
          Math.abs(mx) > SWIPE_THRESHOLD_PX || Math.abs(vx) > SWIPE_VELOCITY;

        if (isUp) {
          setGone(true);
          api.start({
            y:      -FLY_DISTANCE_PX,
            x:      0,
            rotate: 0,
            config: { tension: 300, friction: 22 },
            onRest: () => {
              clearInterval(intervalRef.current);
              // Pass elapsed minutes so callers can add this session's time
              // before re-queuing the card
              onSkip(question.id, computeMinutes(startTimeRef.current));
            },
          });
        } else if (isHorizontal) {
          const dir = mx > 0 ? 'right' : 'left';
          setGone(true);
          api.start({
            x:      dir === 'right' ? FLY_DISTANCE_PX : -FLY_DISTANCE_PX,
            y:      0,
            rotate: dir === 'right' ? FLY_ROTATION_DEG : -FLY_ROTATION_DEG,
            config: { tension: 300, friction: 22 },
            onRest: () => {
              clearInterval(intervalRef.current);
              // Pass elapsed minutes so callers can persist to Sheets
              onSwipe(question.id, dir, question.type, computeMinutes(startTimeRef.current));
            },
          });
        } else {
          // Snap back to rest
          api.start({ x: 0, y: 0, rotate: 0, config: { tension: 460, friction: 32 } });
        }
      }
    },
    { filterTaps: true, pointer: { touch: true } },
  );

  return (
    <animated.div
      className="deck-card-outer"
      style={{ ...stackStyle, x, y, rotate, touchAction: 'none' }}
      {...bind()}
    >
      {/* Left / Right drag indicators */}
      <animated.div className="edge-indicator edge-indicator-right" style={{ opacity: rightOpacity }} />
      <animated.div className="edge-indicator edge-indicator-left"  style={{ opacity: leftOpacity  }} />
      <animated.div className="corner-label corner-label-right"     style={{ opacity: rightOpacity }}>{rightLabel}</animated.div>
      <animated.div className="corner-label corner-label-left"      style={{ opacity: leftOpacity  }}>{leftLabel}</animated.div>

      {/* Up drag indicator */}
      <animated.div className="skip-label" style={{ opacity: upOpacity }}>{upLabel}</animated.div>

      {/* Timer badge — tapping the card surface starts it */}
      <div className={`card-timer-badge${timerActive ? ' card-timer-badge--active' : ''}`}>
        {timerActive ? formatElapsed(elapsedSeconds) : '⏱'}
      </div>

      {/* Card surface — onClick starts the timer on first tap */}
      <animated.div className="deck-card-surface" style={{ background: surfaceBg }} onClick={startTimer}>
        {question.type === CARD_TYPE.TASK
          ? <TaskCard   question={question} />
          : question.type === CARD_TYPE.WARMUP
            ? <WarmupCard question={question} />
            : <FlashCard  question={question} />
        }
      </animated.div>
    </animated.div>
  );
}
