/**
 * 扫码反馈提示音（Web Audio，不依赖静态资源）。
 * 浏览器可能因自动播放策略静音；用户点击打开弹窗后首次扫码通常可正常出声。
 */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!sharedCtx) sharedCtx = new AC();
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function scheduleBeep(
  ctx: AudioContext,
  when: number,
  freq: number,
  durationSec: number,
  gain: number,
  type: OscillatorType,
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + durationSec);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + durationSec + 0.02);
}

/** 识别成功、已加入列表或查询成功 */
export function playScanSuccessSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    scheduleBeep(ctx, t, 880, 0.07, 0.11, 'sine');
    scheduleBeep(ctx, t + 0.055, 1174, 0.09, 0.09, 'sine');
  } catch {
    /* ignore */
  }
}

/** 无法识别、重复、校验失败、接口异常 */
export function playScanErrorSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    scheduleBeep(ctx, t, 220, 0.1, 0.07, 'square');
    scheduleBeep(ctx, t + 0.11, 165, 0.14, 0.055, 'square');
  } catch {
    /* ignore */
  }
}
