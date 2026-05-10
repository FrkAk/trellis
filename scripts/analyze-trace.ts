#!/usr/bin/env bun
/**
 * Analyze a Chrome DevTools performance trace.
 *
 * Usage: bun scripts/analyze-trace.ts <trace.json>
 *
 * Strategy: Chrome traces are huge but most events are uninteresting metadata
 * or low-level timeline ticks. We summarize by:
 *   1. Top categories (Scripting, Painting, GC, Compositing, ...) by self-time
 *   2. Long tasks (>50 ms) on the main renderer thread
 *   3. Top JS frames by self-time, attributed to URL when possible
 *   4. Frame rate distribution + dropped frames
 *   5. Forced reflow / layout thrashing
 *   6. Selected hot events (FunctionCall, Layout, Paint, V8.GC) ranked
 */

import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

interface TraceEvent {
  cat: string;
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts: number;
  dur?: number;
  tdur?: number;
  args?: Record<string, unknown>;
}

interface Trace {
  metadata?: Record<string, unknown>;
  traceEvents: TraceEvent[];
}

const file = argv[2];
if (!file) {
  console.error('usage: bun scripts/analyze-trace.ts <trace.json>');
  exit(1);
}

console.log(`reading ${file}…`);
const raw = readFileSync(file, 'utf8');
console.log(`  ${(raw.length / 1024 / 1024).toFixed(1)} MB`);

console.log('parsing…');
const trace: Trace = JSON.parse(raw);
const events = trace.traceEvents;
console.log(`  ${events.length.toLocaleString()} events`);
console.log(`  metadata: ${JSON.stringify(trace.metadata).slice(0, 200)}…`);
console.log();

// -------------------------------------------------------------------------
// Identify the main renderer thread (CrRendererMain) — that's where our app
// JS runs. There may be multiple renderer processes (extensions, iframes);
// pick the busiest one.
// -------------------------------------------------------------------------

const threadName = new Map<string, string>();
const processName = new Map<number, string>();
const tk = (e: TraceEvent): string => `${e.pid}:${e.tid}`;

for (const e of events) {
  if (e.cat === '__metadata' && e.name === 'thread_name' && e.args?.name) {
    threadName.set(tk(e), e.args.name as string);
  }
  if (e.cat === '__metadata' && e.name === 'process_name' && e.args?.name) {
    processName.set(e.pid, e.args.name as string);
  }
}

// Sum complete-event durations per thread to find the busiest renderer.
const threadBusy = new Map<string, number>();
for (const e of events) {
  if (e.ph !== 'X' || !e.dur) continue;
  const name = threadName.get(tk(e));
  if (name !== 'CrRendererMain') continue;
  threadBusy.set(tk(e), (threadBusy.get(tk(e)) ?? 0) + e.dur);
}
const busiest = [...threadBusy.entries()].sort((a, b) => b[1] - a[1])[0];
if (!busiest) {
  console.error('no CrRendererMain thread found — is this a Chrome trace?');
  exit(1);
}
const [mainKey] = busiest;
const [mainPid, mainTid] = mainKey.split(':').map(Number);
console.log(`main renderer: pid ${mainPid} tid ${mainTid}`);
console.log(`  process: ${processName.get(mainPid) ?? '(unnamed)'}`);
console.log(`  total busy time: ${(busiest[1] / 1000).toFixed(1)} ms`);
console.log();

// -------------------------------------------------------------------------
// Trace duration on the main thread.
// -------------------------------------------------------------------------
let tsMin = Infinity;
let tsMax = -Infinity;
const mainEvents: TraceEvent[] = [];
for (const e of events) {
  if (e.pid !== mainPid || e.tid !== mainTid) continue;
  if (e.ph === 'X' && e.dur) {
    tsMin = Math.min(tsMin, e.ts);
    tsMax = Math.max(tsMax, e.ts + e.dur);
    mainEvents.push(e);
  }
}
const durMs = (tsMax - tsMin) / 1000;
console.log(`main-thread span: ${durMs.toFixed(1)} ms`);
console.log(`main-thread complete events: ${mainEvents.length.toLocaleString()}`);
console.log();

// -------------------------------------------------------------------------
// Self-time aggregation. A complete event's self-time = its dur minus the
// dur of complete events fully contained within it. We compute by walking
// events sorted by (ts, -dur) and using a stack.
// -------------------------------------------------------------------------
mainEvents.sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
const selfTime = new Float64Array(mainEvents.length);
const stack: number[] = [];
for (let i = 0; i < mainEvents.length; i++) {
  const ev = mainEvents[i];
  const start = ev.ts;
  const end = ev.ts + (ev.dur ?? 0);
  while (stack.length > 0) {
    const top = mainEvents[stack[stack.length - 1]];
    if (top.ts + (top.dur ?? 0) <= start) stack.pop();
    else break;
  }
  if (stack.length > 0) {
    const parentIdx = stack[stack.length - 1];
    const parent = mainEvents[parentIdx];
    if (end <= parent.ts + (parent.dur ?? 0)) {
      selfTime[parentIdx] -= ev.dur ?? 0;
    }
  }
  selfTime[i] += ev.dur ?? 0;
  stack.push(i);
}

// -------------------------------------------------------------------------
// Category breakdown.
// -------------------------------------------------------------------------
const catSelfTime = new Map<string, number>();
for (let i = 0; i < mainEvents.length; i++) {
  const ev = mainEvents[i];
  const c = ev.cat.split(',')[0];
  catSelfTime.set(c, (catSelfTime.get(c) ?? 0) + selfTime[i]);
}
const totalSelf = [...catSelfTime.values()].reduce((a, b) => a + b, 0);
console.log('Category self-time on main thread:');
const sortedCats = [...catSelfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [cat, t] of sortedCats) {
  const ms = t / 1000;
  const pct = (t / totalSelf) * 100;
  console.log(`  ${cat.padEnd(40)} ${ms.toFixed(1).padStart(8)} ms  ${pct.toFixed(1).padStart(5)}%`);
}
console.log(`  ${'(total)'.padEnd(40)} ${(totalSelf / 1000).toFixed(1).padStart(8)} ms`);
console.log();

// -------------------------------------------------------------------------
// Event-name breakdown — groups across categories.
// -------------------------------------------------------------------------
const nameSelfTime = new Map<string, number>();
const nameCount = new Map<string, number>();
for (let i = 0; i < mainEvents.length; i++) {
  const ev = mainEvents[i];
  nameSelfTime.set(ev.name, (nameSelfTime.get(ev.name) ?? 0) + selfTime[i]);
  nameCount.set(ev.name, (nameCount.get(ev.name) ?? 0) + 1);
}
console.log('Top event names by self-time:');
const sortedNames = [...nameSelfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [name, t] of sortedNames) {
  const ms = t / 1000;
  const pct = (t / totalSelf) * 100;
  const count = nameCount.get(name) ?? 0;
  const avg = count > 0 ? ms / count : 0;
  console.log(
    `  ${name.padEnd(36)} ${ms.toFixed(1).padStart(8)} ms  ${pct.toFixed(1).padStart(5)}%  n=${count.toString().padStart(6)}  avg=${avg.toFixed(2)} ms`,
  );
}
console.log();

// -------------------------------------------------------------------------
// Long tasks (>50 ms). Standard "long task" definition.
// -------------------------------------------------------------------------
const longTasks = mainEvents
  .filter((e) => (e.dur ?? 0) > 50_000)
  .sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0));
console.log(`Long tasks (>50 ms): ${longTasks.length}`);
for (const e of longTasks.slice(0, 10)) {
  const ms = (e.dur ?? 0) / 1000;
  const offset = (e.ts - tsMin) / 1000;
  console.log(`  ${ms.toFixed(1).padStart(7)} ms  @ ${offset.toFixed(0)} ms  ${e.name}  (${e.cat})`);
}
console.log();

// -------------------------------------------------------------------------
// JS function self-time. Chrome encodes function calls in different ways
// depending on the trace flavour; the high-signal name is "FunctionCall"
// (legacy) plus v8.* events. We look at args.data.functionName for fn hits.
// -------------------------------------------------------------------------
const fnSelf = new Map<string, number>();
const fnCount = new Map<string, number>();
for (let i = 0; i < mainEvents.length; i++) {
  const ev = mainEvents[i];
  if (ev.name !== 'FunctionCall') continue;
  const data = (ev.args?.data ?? {}) as { functionName?: string; url?: string; scriptId?: string };
  const fn = data.functionName ?? '(anonymous)';
  const url = data.url ?? '';
  const key = url ? `${fn}  ←  ${url.split('/').slice(-2).join('/')}` : fn;
  fnSelf.set(key, (fnSelf.get(key) ?? 0) + selfTime[i]);
  fnCount.set(key, (fnCount.get(key) ?? 0) + 1);
}
if (fnSelf.size > 0) {
  console.log('Top JS functions by self-time (FunctionCall events):');
  const sortedFns = [...fnSelf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [fn, t] of sortedFns) {
    const ms = t / 1000;
    const count = fnCount.get(fn) ?? 0;
    const avg = count > 0 ? ms / count : 0;
    console.log(`  ${ms.toFixed(1).padStart(7)} ms  n=${count.toString().padStart(5)}  avg=${avg.toFixed(2)} ms  ${fn}`);
  }
  console.log();
}

// -------------------------------------------------------------------------
// Forced reflow / layout thrashing. The "Layout" event is naturally bracketed
// by an "InvalidateLayout" — when scripting forces sync layout there's a
// ScheduleStyleInvalidationTracking right before. Simpler heuristic: count
// "Layout" events whose parent stack contains FunctionCall or scripting work.
// -------------------------------------------------------------------------
const layoutEvents = mainEvents.filter((e) => e.name === 'Layout');
const layoutSelf = layoutEvents.reduce((s, e) => s + (e.dur ?? 0), 0);
console.log(`Layout events: ${layoutEvents.length}, total ${(layoutSelf / 1000).toFixed(1)} ms`);
const updateLayoutTreeEvents = mainEvents.filter((e) => e.name === 'UpdateLayoutTree');
const ult = updateLayoutTreeEvents.reduce((s, e) => s + (e.dur ?? 0), 0);
console.log(`UpdateLayoutTree (style recalc) events: ${updateLayoutTreeEvents.length}, total ${(ult / 1000).toFixed(1)} ms`);
console.log();

// -------------------------------------------------------------------------
// Frame stats — look at "DrawFrame" / "BeginFrame" on the renderer thread.
// We compute frame intervals from BeginFrame timestamps.
// -------------------------------------------------------------------------
const beginFrames = mainEvents.filter((e) => e.name === 'BeginMainThreadFrame' || e.name === 'BeginFrame').sort((a, b) => a.ts - b.ts);
const drawFrames = mainEvents.filter((e) => e.name === 'DrawFrame').sort((a, b) => a.ts - b.ts);
console.log(`BeginFrame / BeginMainThreadFrame events: ${beginFrames.length}`);
console.log(`DrawFrame events: ${drawFrames.length}`);
if (drawFrames.length > 1) {
  const intervals: number[] = [];
  for (let i = 1; i < drawFrames.length; i++) {
    intervals.push((drawFrames[i].ts - drawFrames[i - 1].ts) / 1000);
  }
  intervals.sort((a, b) => a - b);
  const p = (q: number) => intervals[Math.floor(intervals.length * q)];
  console.log(`  frame intervals (ms): p50=${p(0.5).toFixed(1)} p90=${p(0.9).toFixed(1)} p99=${p(0.99).toFixed(1)} max=${intervals[intervals.length - 1].toFixed(1)}`);
  const avgFps = (drawFrames.length - 1) * 1_000_000 / (drawFrames[drawFrames.length - 1].ts - drawFrames[0].ts);
  console.log(`  avg FPS: ${avgFps.toFixed(1)}`);
}
console.log();

// -------------------------------------------------------------------------
// Compositor & GPU thread totals.
// -------------------------------------------------------------------------
const compositorEvents: TraceEvent[] = [];
const gpuEvents: TraceEvent[] = [];
for (const e of events) {
  if (e.ph !== 'X' || !e.dur) continue;
  const tn = threadName.get(tk(e));
  if (tn === 'Compositor' && e.pid === mainPid) compositorEvents.push(e);
  if (tn === 'CrGpuMain') gpuEvents.push(e);
}
const compTot = compositorEvents.reduce((s, e) => s + (e.dur ?? 0), 0);
const gpuTot = gpuEvents.reduce((s, e) => s + (e.dur ?? 0), 0);
console.log(`Compositor thread total: ${(compTot / 1000).toFixed(1)} ms (${compositorEvents.length} events)`);
console.log(`GPU thread total: ${(gpuTot / 1000).toFixed(1)} ms (${gpuEvents.length} events)`);
console.log();

// -------------------------------------------------------------------------
// Highlight specific events that map to graph code paths.
// -------------------------------------------------------------------------
console.log('Spotlight events (by self-time):');
const spotlight = ['EventDispatch', 'TimerFire', 'RequestAnimationFrame', 'FireAnimationFrame', 'V8.Execute', 'MinorGC', 'MajorGC', 'V8.GC', 'GCEvent', 'Paint', 'PaintImage', 'GPUTask', 'CompositeLayers', 'PrePaint', 'Animation', 'ScheduleStyleRecalculation', 'ParseHTML'];
for (const name of spotlight) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < mainEvents.length; i++) {
    if (mainEvents[i].name === name) {
      total += selfTime[i];
      count++;
    }
  }
  if (count > 0) {
    console.log(`  ${name.padEnd(30)} ${(total / 1000).toFixed(1).padStart(8)} ms  n=${count.toString().padStart(6)}  avg=${(total / count / 1000).toFixed(2)} ms`);
  }
}
console.log();

console.log('done.');
