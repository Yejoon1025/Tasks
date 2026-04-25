/**
 * DeckCard — spring-animated drag wrapper.
 *
 * Gestures:
 *   Left / Right → record result, card flies off horizontally
 *   Up           → re-queue card (moves to end of deck), card flies off upward
 *
 * Delegates face rendering to FlashCard or OpenEndedCard.
 */
import { useState } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from '@use-gesture/react';

import FlashCard     from './FlashCard.jsx';
import OpenEndedCard from './OpenEndedCard.jsx';
import TaskCard      from './TaskCard.jsx';
import WarmupCard    from './WarmupCard.jsx';

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
const LABELS = {
  [CARD_TYPE.FLASHCARD]:  { right: 'Correct',  left: 'Incorrect', up: 'Again'  },
  [CARD_TYPE.OPEN_ENDED]: { right: 'Done',      left: 'Later',     up: 'Again'  },
  [CARD_TYPE.TASK]:       { right: 'Complete',  left: 'Defer',     up: 'Skip'   },
  [CARD_TYPE.WARMUP]:     { right: 'Done',      left: 'Skip',      up: 'Skip'   },
};

export default function DeckCard({ question, onSwipe, onSkip, stackStyle }) {
  const [gone, setGone] = useState(false);

  const { right: rightLabel, left: leftLabel, up: upLabel } =
    LABELS[question.type] ?? LABELS[CARD_TYPE.FLASHCARD];

  // y is added to support upward fly-off
  const [{ x, y, rotate }, api] = useSpring(() => ({ x: 0, y: 0, rotate: 0 }));

  // ── Indicator opacities ────────────────────────────────────────────────────
  const rightOpacity = x.to(v => Math.min(Math.max( v / SWIPE_THRESHOLD_PX,    0), 1));
  const leftOpacity  = x.to(v => Math.min(Math.max(-v / SWIPE_THRESHOLD_PX,    0), 1));
  const upOpacity    = y.to(v => Math.min(Math.max(-v / SWIPE_UP_THRESHOLD_PX, 0), 1));

  // Subtle green/red tint while dragging horizontally
  const surfaceBg = x.to(v => {
    const t = Math.min(Math.abs(v) / 400, 0.07);
    if (v >  10) return `linear-gradient(135deg, rgba(16,185,129,${t}) 0%, var(--color-surface) 100%)`;
    if (v < -10) return `linear-gradient(135deg, var(--color-surface) 0%, rgba(244,63,94,${t}) 100%)`;
    return 'var(--color-surface)';
  });

  const bind = useDrag(
    ({ active, movement: [mx, my], velocity: [vx, vy] }) => {
      if (gone) return;

      if (active) {
        api.start({
          x:         mx,
          y:         Math.min(0, my),  // only follow finger upward, not downward
          rotate:    mx / DRAG_ROTATION_DIV,
          immediate: true,
        });
      } else {
        // Upward gesture: vertical movement dominates and threshold met
        const isUp =
          (Math.min(0, my) < -SWIPE_UP_THRESHOLD_PX && Math.abs(my) >= Math.abs(mx)) ||
          (vy < -SWIPE_UP_VELOCITY && Math.abs(vy) >= Math.abs(vx));

        // Horizontal gesture: existing left/right detection
        const isHorizontal =
          Math.abs(mx) > SWIPE_THRESHOLD_PX || Math.abs(vx) > SWIPE_VELOCITY;

        if (isUp) {
          setGone(true);
          api.start({
            y:      -FLY_DISTANCE_PX,
            x:      0,
            rotate: 0,
            config: { tension: 300, friction: 22 },
            onRest: () => onSkip(question.id),
          });
        } else if (isHorizontal) {
          const dir = mx > 0 ? 'right' : 'left';
          setGone(true);
          api.start({
            x:      dir === 'right' ? FLY_DISTANCE_PX : -FLY_DISTANCE_PX,
            y:      0,
            rotate: dir === 'right' ? FLY_ROTATION_DEG : -FLY_ROTATION_DEG,
            config: { tension: 300, friction: 22 },
            onRest: () => onSwipe(question.id, dir, question.type),
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

      {/* Card surface */}
      <animated.div className="deck-card-surface" style={{ background: surfaceBg }}>
        {question.type === CARD_TYPE.FLASHCARD
          ? <FlashCard question={question} />
          : question.type === CARD_TYPE.TASK
            ? <TaskCard question={question} />
            : question.type === CARD_TYPE.WARMUP
              ? <WarmupCard question={question} />
              : <OpenEndedCard question={question} />
        }
      </animated.div>
    </animated.div>
  );
}
