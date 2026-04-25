// ─── Swipe physics ────────────────────────────────────────────────────────────
export const SWIPE_THRESHOLD_PX    = 90;   // min horizontal drag to register left/right swipe
export const SWIPE_VELOCITY        = 0.5;  // min horizontal release velocity
export const SWIPE_UP_THRESHOLD_PX = 80;   // min upward drag to register a skip
export const SWIPE_UP_VELOCITY     = 0.5;  // min upward release velocity
export const FLY_DISTANCE_PX       = 640;  // px card travels off-screen
export const FLY_ROTATION_DEG      = 18;   // max tilt when flying off left/right
export const DRAG_ROTATION_DIV     = 35;   // divisor for gentle rotation while dragging

// ─── Card deck ────────────────────────────────────────────────────────────────
export const VISIBLE_CARD_COUNT  = 3;    // how many stacked cards are rendered
export const STACK_SCALE_STEP    = 0.035;// scale reduction per depth level
export const STACK_OFFSET_PX     = 8;    // px translateY per depth level

// ─── Card types ───────────────────────────────────────────────────────────────
export const CARD_TYPE = {
  FLASHCARD:  'flashcard',
  OPEN_ENDED: 'open-ended',
  TASK:       'task',
  WARMUP:     'warmup',
};

// ─── Session storage ──────────────────────────────────────────────────────────
export const SESSION_STORAGE_KEY   = 'quiz_session';
export const NOTE_STORAGE_PREFIX   = 'quiz_note_';
export const WARMUP_CLEARED_PREFIX = 'warmup_cleared_'; // + YYYY-MM-DD
