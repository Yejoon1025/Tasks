/**
 * DeckCard — spring-animated drag wrapper with a built-in stopwatch.
 *
 * Gestures:
 *   Left / Right → record result, card flies off horizontally
 *   Up           → re-queue card (moves to end of deck), card flies off upward
 *                  If skipDisabled=true the card snaps back instead of flying off.
 *
 * Timer:
 *   Starts the first time the user taps the card surface (idle → running).
 *   Tap the timer badge while running to pause; tap again to resume (paused → running).
 *   Elapsed time (in decimal minutes, 1 d.p.) is passed to onSwipe / onSkip so callers
 *   can persist it.  Time is tracked even on skip (the card will return and time will
 *   continue accumulating).
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
// Questions have no type tag so DEFAULT_LABELS applies.
const DEFAULT_LABELS = { right: 'Done',     left: 'Defer',  up: 'Skip' };
const LABELS = {
  [CARD_TYPE.TASK]:   { right: 'Complete', left: 'Defer',  up: 'Skip' },
  [CARD_TYPE.WARMUP]: { right: 'Done',     left: 'Skip',   up: 'Skip' },
};

// ─── Timer helpers ─────────────────────────────────────────────────────────
/** Format elapsed seconds as M:SS */
function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────────────────
export default function DeckCard({ question, onSwipe, onSkip, stackStyle, skipDisabled = false }) {
  const [gone, setGone] = useState(false);

  const { right: rightLabel, left: leftLabel, up: upLabel } =
    LABELS[question.type] ?? DEFAULT_LABELS;

  // ── Spring ──────────────────────────────────────────────────────────────
  const [{ x, y, rotate }, api] = useSpring(() => ({ x: 0, y: 0, rotate: 0 }));

  // ── Timer — three states: 'idle' | 'running' | 'paused' ─────────────────
  const [timerState,     setTimerState]     = useState('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef   = useRef(null);   // start of current running window (ms)
  const accumulatedRef = useRef(0);      // ms from all completed running windows
  const intervalRef    = useRef(null);

  /** Start interval that updates display every second. */
  function startTick() {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const ms = accumulatedRef.current +
        (startTimeRef.current ? Date.now() - startTimeRef.current : 0);
      setElapsedSeconds(Math.floor(ms / 1000));
    }, 1000);
  }

  /** First tap on card surface: idle → running. Idempotent. */
  function startTimer() {
    if (timerState !== 'idle' || gone) return;
    startTimeRef.current = Date.now();
    setTimerState('running');
    startTick();
  }

  /**
   * Tap on timer badge: toggle running ↔ paused.
   * Stops propagation so the card surface onClick doesn't also fire.
   */
  function toggleTimer(e) {
    e.stopPropagation();
    if (timerState === 'running') {
      // Pause: bank elapsed ms, stop interval
      accumulatedRef.current += Date.now() - startTimeRef.current;
      startTimeRef.current = null;
      clearInterval(intervalRef.current);
      setTimerState('paused');
    } else if (timerState === 'paused') {
      // Resume: start a new running window
      startTimeRef.current = Date.now();
      setTimerState('running');
      startTick();
    }
  }

  /** Compute total decimal minutes at swipe/skip time (accurate to 1 d.p.). */
  function computeMinutes() {
    const ms = accumulatedRef.current +
      (startTimeRef.current ? Date.now() - startTimeRef.current : 0);
    const seconds = Math.floor(ms / 1000);
    return Math.round(seconds / 6) / 10;   // /6 = /60*10, then /10 = 1 d.p.
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
          if (skipDisabled) {
            // Due-today tasks can't be skipped — snap back with a bounce
            api.start({ x: 0, y: 0, rotate: 0, config: { tension: 460, friction: 32 } });
            return;
          }
          setGone(true);
          api.start({
            y:      -FLY_DISTANCE_PX,
            x:      0,
            rotate: 0,
            config: { tension: 300, friction: 22 },
            onRest: () => {
              clearInterval(intervalRef.current);
              onSkip(question.id, computeMinutes());
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
              onSwipe(question.id, dir, question.type, computeMinutes());
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

  // ── Timer badge appearance ────────────────────────────────────────────────
  const timerCls =
    timerState === 'running' ? ' card-timer-badge--active'
    : timerState === 'paused'  ? ' card-timer-badge--paused'
    : '';

  const timerContent =
    timerState === 'idle'   ? '⏱'
    : timerState === 'paused' ? `⏸ ${formatElapsed(elapsedSeconds)}`
    : formatElapsed(elapsedSeconds);

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

      {/* Timer badge — idle: tap card surface to start; running/paused: tap badge to toggle */}
      <div
        className={`card-timer-badge${timerCls}`}
        onClick={timerState !== 'idle' ? toggleTimer : undefined}
      >
        {timerContent}
      </div>

      {/* Card surface — first tap starts the timer */}
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
