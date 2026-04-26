/**
 * DeckCard — spring-animated drag wrapper with a built-in stopwatch.
 *
 * Gestures:
 *   Left / Right → record result, card flies off horizontally
 *                  If deferDisabled=true a left swipe snaps back instead.
 *   Up           → re-queue card (moves to end of deck), card flies off upward
 *
 * Timer:
 *   initialMs    — ms already accumulated from previous sessions/skips (display only).
 *                  The timer badge shows initialMs + new time; computeMinutes() returns
 *                  only the NEW time so callers always send incremental deltas to the server.
 *   Tap anywhere on the card surface to cycle states:
 *     idle → running  (first tap)
 *     running → paused (tap while running)
 *     paused → running (tap while paused)
 *   Badge is pointer-events:none — all taps go to the card surface.
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
const DEFAULT_LABELS = { right: 'Done',     left: 'Defer',  up: 'Skip' };
const LABELS = {
  [CARD_TYPE.TASK]:   { right: 'Complete', left: 'Defer',  up: 'Skip' },
  [CARD_TYPE.WARMUP]: { right: 'Done',     left: 'Skip',   up: 'Skip' },
};

// ─── Timer helpers ─────────────────────────────────────────────────────────
function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────────────────
export default function DeckCard({
  question,
  onSwipe,
  onSkip,
  stackStyle,
  deferDisabled = false,
  initialMs     = 0,      // ms from previous sessions — shown in timer but NOT re-sent to server
}) {
  const [gone, setGone] = useState(false);

  const { right: rightLabel, left: leftLabel, up: upLabel } =
    LABELS[question.type] ?? DEFAULT_LABELS;

  // ── Spring ──────────────────────────────────────────────────────────────
  const [{ x, y, rotate }, api] = useSpring(() => ({ x: 0, y: 0, rotate: 0 }));

  // ── Timer — three states: 'idle' | 'running' | 'paused' ─────────────────
  // Start paused (not idle) when pre-seeded so the badge shows the existing time.
  const [timerState,     setTimerState]     = useState(initialMs > 0 ? 'paused' : 'idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(Math.floor(initialMs / 1000));

  const startTimeRef   = useRef(null);  // wall-clock start of the current running window
  const accumulatedRef = useRef(0);     // ms accumulated in THIS instance (excludes initialMs)
  const intervalRef    = useRef(null);

  /**
   * Total ms to display: prior sessions (initialMs) + new time (this instance).
   * Used for the badge display only.
   */
  function displayMs() {
    return initialMs + accumulatedRef.current +
      (startTimeRef.current ? Date.now() - startTimeRef.current : 0);
  }

  function startTick() {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(
      () => setElapsedSeconds(Math.floor(displayMs() / 1000)),
      1000,
    );
  }

  /**
   * Incremental minutes accumulated IN THIS INSTANCE only.
   * callers add this to the server-stored value — never re-send initialMs.
   */
  function computeMinutes() {
    const incrementalMs = accumulatedRef.current +
      (startTimeRef.current ? Date.now() - startTimeRef.current : 0);
    return Math.round(Math.floor(incrementalMs / 1000) / 6) / 10;
  }

  /** Tap card surface → cycle idle → running → paused → running */
  function handleCardTap() {
    if (gone) return;
    if (timerState === 'idle' || timerState === 'paused') {
      startTimeRef.current = Date.now();
      setTimerState('running');
      startTick();
    } else if (timerState === 'running') {
      accumulatedRef.current += Date.now() - startTimeRef.current;
      startTimeRef.current = null;
      clearInterval(intervalRef.current);
      setTimerState('paused');
    }
  }

  useEffect(() => () => clearInterval(intervalRef.current), []);

  // ── Indicator opacities ──────────────────────────────────────────────────
  const rightOpacity = x.to(v => Math.min(Math.max( v / SWIPE_THRESHOLD_PX,    0), 1));
  const leftOpacity  = x.to(v => Math.min(Math.max(-v / SWIPE_THRESHOLD_PX,    0), 1));
  const upOpacity    = y.to(v => Math.min(Math.max(-v / SWIPE_UP_THRESHOLD_PX, 0), 1));

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
          y:         Math.min(0, my),
          rotate:    mx / DRAG_ROTATION_DIV,
          immediate: true,
        });
      } else {
        const isUp =
          (Math.min(0, my) < -SWIPE_UP_THRESHOLD_PX && Math.abs(my) >= Math.abs(mx)) ||
          (vy < -SWIPE_UP_VELOCITY && Math.abs(vy) >= Math.abs(vx));

        const isHorizontal =
          Math.abs(mx) > SWIPE_THRESHOLD_PX || Math.abs(vx) > SWIPE_VELOCITY;

        if (isUp) {
          setGone(true);
          api.start({
            y: -FLY_DISTANCE_PX, x: 0, rotate: 0,
            config: { tension: 300, friction: 22 },
            onRest: () => {
              clearInterval(intervalRef.current);
              onSkip(question._sheetRow, computeMinutes());
            },
          });
        } else if (isHorizontal) {
          const dir = mx > 0 ? 'right' : 'left';

          if (deferDisabled && dir === 'left') {
            api.start({ x: 0, y: 0, rotate: 0, config: { tension: 460, friction: 32 } });
            return;
          }

          setGone(true);
          api.start({
            x:      dir === 'right' ? FLY_DISTANCE_PX : -FLY_DISTANCE_PX,
            y:      0,
            rotate: dir === 'right' ? FLY_ROTATION_DEG : -FLY_ROTATION_DEG,
            config: { tension: 300, friction: 22 },
            onRest: () => {
              clearInterval(intervalRef.current);
              onSwipe(question._sheetRow, dir, question.type, computeMinutes());
            },
          });
        } else {
          api.start({ x: 0, y: 0, rotate: 0, config: { tension: 460, friction: 32 } });
        }
      }
    },
    { filterTaps: true, pointer: { touch: true } },
  );

  // ── Timer badge ───────────────────────────────────────────────────────────
  const timerCls =
    timerState === 'running' ? ' card-timer-badge--active'
    : timerState === 'paused'  ? ' card-timer-badge--paused'
    : '';

  const timerContent =
    timerState === 'idle'    ? '⏱'
    : timerState === 'paused'  ? `⏸ ${formatElapsed(elapsedSeconds)}`
    : formatElapsed(elapsedSeconds);

  return (
    <animated.div
      className="deck-card-outer"
      style={{ ...stackStyle, x, y, rotate, touchAction: 'none' }}
      {...bind()}
    >
      <animated.div className="edge-indicator edge-indicator-right" style={{ opacity: rightOpacity }} />
      <animated.div className="edge-indicator edge-indicator-left"  style={{ opacity: leftOpacity  }} />
      <animated.div className="corner-label corner-label-right"     style={{ opacity: rightOpacity }}>{rightLabel}</animated.div>
      <animated.div className="corner-label corner-label-left"      style={{ opacity: leftOpacity  }}>{leftLabel}</animated.div>
      <animated.div className="skip-label" style={{ opacity: upOpacity }}>{upLabel}</animated.div>

      <div className={`card-timer-badge${timerCls}`}>{timerContent}</div>

      <animated.div className="deck-card-surface" style={{ background: surfaceBg }} onClick={handleCardTap}>
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
