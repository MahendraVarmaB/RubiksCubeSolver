/**
 * coord-cube.ts
 * Direct TypeScript port of cs.min2phase.CoordCube (Java)
 *
 * Builds and holds all move tables and pruning tables for the two-phase solver.
 * Also represents a phase-1 coordinate node during IDA* search.
 *
 * Table sizes (approximate RAM):
 *   UDSliceMove [495][18]  ~17 KB
 *   TwistMove   [324][18]  ~11 KB
 *   FlipMove    [336][18]  ~12 KB
 *   UDSliceConj [495][8]   ~7 KB
 *   UDSliceTwistPrun [495×324/8] ~20 KB
 *   UDSliceFlipPrun  [495×336/8] ~20 KB
 *   CPermMove   [2768][10] ~55 KB
 *   EPermMove   [2768][10] ~55 KB
 *   MPermMove   [24][10]   ~0.5 KB
 *   MPermConj   [24][16]   ~0.8 KB
 *   CCombPMove  [140][10]  ~2 KB
 *   CCombPConj  [140][16]  ~4 KB
 *   MCPermPrun  [24×2768/8] ~8 KB
 *   EPermCCombPPrun [140×2768/8] ~48 KB
 *   TwistFlipPrun [2048×324/8] ~83 KB  (if USE_TWIST_FLIP_PRUN)
 * Total: ~340 KB  (well within browser limits)
 */

import {
  CubieCube,
  N_SLICE, N_TWIST, N_TWIST_SYM, N_FLIP, N_FLIP_SYM,
  N_PERM, N_PERM_SYM, N_MPERM, N_COMB,
  N_MOVES, N_MOVES2,
  USE_TWIST_FLIP_PRUN, USE_COMBP_PRUN, USE_CONJ_PRUN,
  SYM_E2C_MAGIC,
  FlipS2R, TwistS2R, EPermS2R, FlipR2S, TwistR2S,
  FlipS2RF, Perm2CombP, PermInvEdgeSym, MPermInv,
  SymMult, SymMultInv, SymMove, Sym8Move, SymMoveUD,
  SymStateTwist, SymStateFlip, SymStatePerm,
  moveCube,
  ESym2CSym,
  EPermR2S,
} from './cubie-cube.js';

import { ud2std } from './util.js';

// ─── Phase-1 move tables ──────────────────────────────────────────────────────
/** UDSlice move table [495][18]: new UDSlice coord after move m */
export const UDSliceMove: Uint16Array[] = Array.from({ length: N_SLICE }, () => new Uint16Array(N_MOVES));
/** TwistMove (symmetry-reduced) [N_TWIST_SYM][18] */
export const TwistMove: Uint16Array[] = Array.from({ length: N_TWIST_SYM }, () => new Uint16Array(N_MOVES));
/** FlipMove (symmetry-reduced) [N_FLIP_SYM][18] */
export const FlipMove: Uint16Array[] = Array.from({ length: N_FLIP_SYM }, () => new Uint16Array(N_MOVES));
/** UDSlice conjugate table [495][8] */
export const UDSliceConj: Uint16Array[] = Array.from({ length: N_SLICE }, () => new Uint16Array(8));

// ─── Phase-1 pruning tables ───────────────────────────────────────────────────
export const UDSliceTwistPrun: Int32Array = new Int32Array(N_SLICE * N_TWIST_SYM / 8 + 1);
export const UDSliceFlipPrun: Int32Array = new Int32Array(N_SLICE * N_FLIP_SYM / 8 + 1);
export const TwistFlipPrun: Int32Array = USE_TWIST_FLIP_PRUN
  ? new Int32Array(N_FLIP * N_TWIST_SYM / 8 + 1)
  : new Int32Array(0);

// ─── Phase-2 move tables ──────────────────────────────────────────────────────
export const CPermMove: Uint16Array[] = Array.from({ length: N_PERM_SYM }, () => new Uint16Array(N_MOVES2));
export const EPermMove: Uint16Array[] = Array.from({ length: N_PERM_SYM }, () => new Uint16Array(N_MOVES2));
export const MPermMove: Uint16Array[] = Array.from({ length: N_MPERM }, () => new Uint16Array(N_MOVES2));
export const MPermConj: Uint16Array[] = Array.from({ length: N_MPERM }, () => new Uint16Array(16));
export let CCombPMove: Uint16Array[];   // allocated in initCombPMoveConj
export const CCombPConj: Uint16Array[] = Array.from({ length: N_COMB }, () => new Uint16Array(16));

// ─── Phase-2 pruning tables ───────────────────────────────────────────────────
export const MCPermPrun: Int32Array = new Int32Array(N_MPERM * N_PERM_SYM / 8 + 1);
export const EPermCCombPPrun: Int32Array = new Int32Array(N_COMB * N_PERM_SYM / 8 + 1);

// ─── Initialisation state ─────────────────────────────────────────────────────
export let initLevel = 0; // 0=not inited, 1=partial, 2=full

// ─── Pruning table bit helpers ────────────────────────────────────────────────

export function setPruning(table: Int32Array, index: number, value: number): void {
  table[index >> 3] ^= value << ((index & 7) << 2);
}

export function getPruning(table: Int32Array, index: number): number {
  return (table[index >> 3] >> ((index & 7) << 2)) & 0xf;
}

function hasZero(val: number): boolean {
  // Check if any nibble in the 32-bit int is 0
  return ((val - 0x11111111) & ~val & 0x88888888) !== 0;
}

// ─── Move table initialisers ──────────────────────────────────────────────────

function initUDSliceMoveConj(): void {
  const c = new CubieCube();
  const d = new CubieCube();
  for (let i = 0; i < N_SLICE; i++) {
    c.setUDSlice(i);
    for (let j = 0; j < N_MOVES; j += 3) {
      CubieCube.EdgeMult(c, moveCube[j], d);
      UDSliceMove[i][j] = d.getUDSlice();
    }
    for (let j = 0; j < 16; j += 2) {
      CubieCube.EdgeConjugate(c, SymMultInv[0][j], d);
      UDSliceConj[i][j >> 1] = d.getUDSlice();
    }
  }
  // Fill in x2, x3 from x1
  for (let i = 0; i < N_SLICE; i++) {
    for (let j = 0; j < N_MOVES; j += 3) {
      let udslice = UDSliceMove[i][j];
      for (let k = 1; k < 3; k++) {
        udslice = UDSliceMove[udslice][j];
        UDSliceMove[i][j + k] = udslice;
      }
    }
  }
}

function initFlipMove(): void {
  const c = new CubieCube();
  const d = new CubieCube();
  for (let i = 0; i < N_FLIP_SYM; i++) {
    c.setFlip(FlipS2R[i]);
    for (let j = 0; j < N_MOVES; j++) {
      CubieCube.EdgeMult(c, moveCube[j], d);
      FlipMove[i][j] = d.getFlipSym();
    }
  }
}

function initTwistMove(): void {
  const c = new CubieCube();
  const d = new CubieCube();
  for (let i = 0; i < N_TWIST_SYM; i++) {
    c.setTwist(TwistS2R[i]);
    for (let j = 0; j < N_MOVES; j++) {
      CubieCube.CornMult(c, moveCube[j], d);
      TwistMove[i][j] = d.getTwistSym();
    }
  }
}

function initCPermMove(): void {
  const c = new CubieCube();
  const d = new CubieCube();
  for (let i = 0; i < N_PERM_SYM; i++) {
    c.setCPerm(EPermS2R[i]);
    for (let j = 0; j < N_MOVES2; j++) {
      CubieCube.CornMult(c, moveCube[ud2std[j]], d);
      CPermMove[i][j] = d.getCPermSym();
    }
  }
}

function initEPermMove(): void {
  const c = new CubieCube();
  const d = new CubieCube();
  for (let i = 0; i < N_PERM_SYM; i++) {
    c.setEPerm(EPermS2R[i]);
    for (let j = 0; j < N_MOVES2; j++) {
      CubieCube.EdgeMult(c, moveCube[ud2std[j]], d);
      EPermMove[i][j] = d.getEPermSym();
    }
  }
}

function initMPermMoveConj(): void {
  const c = new CubieCube();
  const d = new CubieCube();
  for (let i = 0; i < N_MPERM; i++) {
    c.setMPerm(i);
    for (let j = 0; j < N_MOVES2; j++) {
      CubieCube.EdgeMult(c, moveCube[ud2std[j]], d);
      MPermMove[i][j] = d.getMPerm();
    }
    for (let j = 0; j < 16; j++) {
      CubieCube.EdgeConjugate(c, SymMultInv[0][j], d);
      MPermConj[i][j] = d.getMPerm();
    }
  }
}

function initCombPMoveConj(): void {
  const c = new CubieCube();
  const d = new CubieCube();
  const P2_PARITY_MOVE = USE_COMBP_PRUN ? 0xA5 : 0;
  CCombPMove = Array.from({ length: N_COMB }, () => new Uint16Array(N_MOVES2));
  for (let i = 0; i < N_COMB; i++) {
    c.setCComb(i % 70);
    for (let j = 0; j < N_MOVES2; j++) {
      CubieCube.CornMult(c, moveCube[ud2std[j]], d);
      CCombPMove[i][j] = d.getCComb() + 70 * (((P2_PARITY_MOVE >> j) & 1) ^ (i / 70 | 0));
    }
    for (let j = 0; j < 16; j++) {
      CubieCube.CornConjugate(c, SymMultInv[0][j], d);
      CCombPConj[i][j] = d.getCComb() + 70 * ((i / 70) | 0);
    }
  }
}

// ─── General pruning table builder ───────────────────────────────────────────

/**
 * initRawSymPrun: builds a pruning table using backward BFS with symmetry.
 * Faithful port of Java's initRawSymPrun().
 *
 * PrunFlag encoding (from Java):
 *   bits 0-3  : SYM_SHIFT
 *   bit  4    : E2C_MAGIC flag
 *   bit  5    : IS_PHASE2
 *   bits 8-11 : INV_DEPTH
 *   bits 12-15: MAX_DEPTH
 *   bits 16-19: MIN_DEPTH
 */
function initRawSymPrun(
  PrunTable: Int32Array,
  RawMove: Uint16Array[] | null,
  RawConj: Uint16Array[] | null,
  SymMove_: Uint16Array[],
  SymState: Uint16Array,
  PrunFlag: number,
  fullInit: boolean,
): void {
  const SYM_SHIFT = PrunFlag & 0xf;
  const SYM_E2C_MAGIC_ = ((PrunFlag >> 4) & 1) === 1 ? SYM_E2C_MAGIC : 0;
  const IS_PHASE2 = ((PrunFlag >> 5) & 1) === 1;
  const INV_DEPTH = (PrunFlag >> 8) & 0xf;
  const MAX_DEPTH = (PrunFlag >> 12) & 0xf;
  const MIN_DEPTH = (PrunFlag >> 16) & 0xf;
  const SEARCH_DEPTH = fullInit ? MAX_DEPTH : MIN_DEPTH;
  const SYM_MASK = (1 << SYM_SHIFT) - 1;
  const ISTFP = RawMove === null;  // TwistFlipPrun special case
  const N_RAW = ISTFP ? N_FLIP : RawMove!.length;
  const N_SIZE = N_RAW * SymMove_.length;
  const N_MOV = IS_PHASE2 ? 10 : 18;
  const NEXT_AXIS_MAGIC = N_MOV === 10 ? 0x42 : 0x92492;

  let depth = getPruning(PrunTable, N_SIZE) - 1;
  let done = 0;

  if (depth === -1) {
    for (let i = 0; i < N_SIZE / 8 + 1; i++) {
      PrunTable[i] = 0x11111111;
    }
    setPruning(PrunTable, 0, 0 ^ 1);
    depth = 0;
    done = 1;
  }

  while (depth < SEARCH_DEPTH) {
    const mask = ((depth + 1) * 0x11111111) ^ 0xffffffff;
    for (let i = 0; i < PrunTable.length; i++) {
      let val = PrunTable[i] ^ mask;
      val &= val >> 1;
      PrunTable[i] += val & (val >> 2) & 0x11111111;
    }

    const inv = depth > INV_DEPTH;
    const select = inv ? (depth + 2) : depth;
    const selArrMask = select * 0x11111111;
    const check = inv ? depth : (depth + 2);
    depth++;
    const xorVal = depth ^ (depth + 1);

    let val = 0;
    for (let i = 0; i < N_SIZE; i++, val >>>= 4) {
      if ((i & 7) === 0) {
        val = PrunTable[i >> 3];
        if (!hasZero(val ^ selArrMask)) {
          i += 7;
          continue;
        }
      }
      if ((val & 0xf) !== select) continue;

      const raw = i % N_RAW;
      const sym = (i / N_RAW) | 0;
      let flip = 0;
      let fsym = 0;

      if (ISTFP) {
        flip = FlipR2S[raw];
        fsym = flip & 7;
        flip >>= 3;
      }

      for (let m = 0; m < N_MOV; m++) {
        const symx = SymMove_[sym][m];
        let rawx: number;
        if (ISTFP) {
          rawx = FlipS2RF[
            FlipMove[flip][Sym8Move[m << 3 | fsym]] ^
            fsym ^ (symx & SYM_MASK)
          ];
        } else {
          rawx = RawConj![RawMove![raw][m]][symx & SYM_MASK];
        }
        const symxShifted = symx >> SYM_SHIFT;
        const idx = symxShifted * N_RAW + rawx;
        const prun = getPruning(PrunTable, idx);
        if (prun !== check) {
          if (prun < depth - 1) {
            m += (NEXT_AXIS_MAGIC >> m) & 3;
          }
          continue;
        }
        done++;
        if (inv) {
          setPruning(PrunTable, i, xorVal);
          break;
        }
        setPruning(PrunTable, idx, xorVal);
        for (let j = 1, symState = SymState[symxShifted]; (symState >>= 1) !== 0; j++) {
          if ((symState & 1) !== 1) continue;
          const idxx = symxShifted * N_RAW + (ISTFP
            ? FlipS2RF[(FlipR2S[rawx] ^ j) & 0xffff]
            : RawConj![rawx][j ^ ((SYM_E2C_MAGIC_ >> (j << 1)) & 3)]
          );
          if (getPruning(PrunTable, idxx) === check) {
            setPruning(PrunTable, idxx, xorVal);
            done++;
          }
        }
      }
    }
  }
}

// ─── Pruning table callers ────────────────────────────────────────────────────

function initTwistFlipPrun(fullInit: boolean): void {
  initRawSymPrun(
    TwistFlipPrun,
    null, null,
    TwistMove, SymStateTwist,
    0x19603,
    fullInit,
  );
}

function initSliceTwistPrun(fullInit: boolean): void {
  initRawSymPrun(
    UDSliceTwistPrun,
    UDSliceMove, UDSliceConj,
    TwistMove, SymStateTwist,
    0x69603,
    fullInit,
  );
}

function initSliceFlipPrun(fullInit: boolean): void {
  initRawSymPrun(
    UDSliceFlipPrun,
    UDSliceMove, UDSliceConj,
    FlipMove, SymStateFlip,
    0x69603,
    fullInit,
  );
}

function initMCPermPrun(fullInit: boolean): void {
  initRawSymPrun(
    MCPermPrun,
    MPermMove, MPermConj,
    CPermMove, SymStatePerm,
    0x8ea34,
    fullInit,
  );
}

function initPermCombPPrun(fullInit: boolean): void {
  initRawSymPrun(
    EPermCCombPPrun,
    CCombPMove!, CCombPConj,
    EPermMove, SymStatePerm,
    0x7d824,
    fullInit,
  );
}

// ─── Main init function ───────────────────────────────────────────────────────

/** Progress callback (0–100). Called during long init so UI can show a spinner. */
export type ProgressCallback = (pct: number) => void;

export function init(fullInit: boolean, onProgress?: ProgressCallback): void {
  if (initLevel === 2 || (initLevel === 1 && !fullInit)) return;

  if (initLevel === 0) {
    // Phase-2 tables first (used by both phases when searching)
    CubieCube.initPermSym2Raw(); onProgress?.(5);
    initCPermMove(); onProgress?.(10);
    initEPermMove(); onProgress?.(20);
    initMPermMoveConj(); onProgress?.(25);
    initCombPMoveConj(); onProgress?.(30);

    // Phase-1 sym tables
    CubieCube.initFlipSym2Raw(); onProgress?.(35);
    CubieCube.initTwistSym2Raw(); onProgress?.(40);
    initFlipMove(); onProgress?.(45);
    initTwistMove(); onProgress?.(50);
    initUDSliceMoveConj(); onProgress?.(55);
  }

  // Pruning tables (most expensive)
  initMCPermPrun(fullInit); onProgress?.(65);
  initPermCombPPrun(fullInit); onProgress?.(75);
  initSliceTwistPrun(fullInit); onProgress?.(83);
  initSliceFlipPrun(fullInit); onProgress?.(90);

  if (USE_TWIST_FLIP_PRUN) {
    initTwistFlipPrun(fullInit); onProgress?.(98);
  }

  initLevel = fullInit ? 2 : 1;
  onProgress?.(100);
}

// ─── Cache serialize / hydrate (for localStorage persistence) ─────────────────

export function serializeCache(): Record<string, number[]> {
  return {
    FlipS2R: Array.from(FlipS2R),
    TwistS2R: Array.from(TwistS2R),
    EPermS2R: Array.from(EPermS2R),
    FlipR2S: Array.from(FlipR2S),
    TwistR2S: Array.from(TwistR2S),
    EPermR2S: Array.from(EPermR2S),
    Perm2CombP: Array.from(Perm2CombP),
    MPermInv: Array.from(MPermInv),
    PermInvEdgeSym: Array.from(PermInvEdgeSym),
    UDSliceMove: UDSliceMove.flatMap(a => Array.from(a)),
    TwistMove: TwistMove.flatMap(a => Array.from(a)),
    FlipMove: FlipMove.flatMap(a => Array.from(a)),
    UDSliceConj: UDSliceConj.flatMap(a => Array.from(a)),
    UDSliceTwistPrun: Array.from(UDSliceTwistPrun),
    UDSliceFlipPrun: Array.from(UDSliceFlipPrun),
    CPermMove: CPermMove.flatMap(a => Array.from(a)),
    EPermMove: EPermMove.flatMap(a => Array.from(a)),
    MPermMove: MPermMove.flatMap(a => Array.from(a)),
    MPermConj: MPermConj.flatMap(a => Array.from(a)),
    CCombPMove: CCombPMove.flatMap(a => Array.from(a)),
    CCombPConj: CCombPConj.flatMap(a => Array.from(a)),
    MCPermPrun: Array.from(MCPermPrun),
    EPermCCombPPrun: Array.from(EPermCCombPPrun),
    FlipS2RF: Array.from(FlipS2RF),
    TwistFlipPrun: Array.from(TwistFlipPrun),
  };
}

export function hydrateFromCache(data: Record<string, number[]>): void {
  function fill16(arr: Uint16Array, src: number[]) { arr.set(src); }
  function fill8s(arr: Int8Array, src: number[]) { arr.set(src); }
  function fill8u(arr: Uint8Array, src: number[]) { arr.set(src); }
  function fill32(arr: Int32Array, src: number[]) { arr.set(src); }
  function fillRows(rows: Uint16Array[], src: number[], cols: number) {
    for (let i = 0; i < rows.length; i++) {
      rows[i].set(src.slice(i * cols, (i + 1) * cols));
    }
  }

  fill16(FlipS2R, data.FlipS2R);
  fill16(TwistS2R, data.TwistS2R);
  fill16(EPermS2R, data.EPermS2R);
  fill16(FlipR2S, data.FlipR2S);
  fill16(TwistR2S, data.TwistR2S);
  fill16(EPermR2S, data.EPermR2S);
  fill8s(Perm2CombP, data.Perm2CombP);
  fill8u(MPermInv, data.MPermInv);
  fill16(PermInvEdgeSym, data.PermInvEdgeSym);

  fillRows(UDSliceMove, data.UDSliceMove, N_MOVES);
  fillRows(TwistMove, data.TwistMove, N_MOVES);
  fillRows(FlipMove, data.FlipMove, N_MOVES);
  fillRows(UDSliceConj, data.UDSliceConj, 8);

  fill32(UDSliceTwistPrun, data.UDSliceTwistPrun);
  fill32(UDSliceFlipPrun, data.UDSliceFlipPrun);

  fillRows(CPermMove, data.CPermMove, N_MOVES2);
  fillRows(EPermMove, data.EPermMove, N_MOVES2);
  fillRows(MPermMove, data.MPermMove, N_MOVES2);
  fillRows(MPermConj, data.MPermConj, 16);

  CCombPMove = Array.from({ length: N_COMB }, () => new Uint16Array(N_MOVES2));
  fillRows(CCombPMove, data.CCombPMove, N_MOVES2);
  fillRows(CCombPConj, data.CCombPConj, 16);

  fill32(MCPermPrun, data.MCPermPrun);
  fill32(EPermCCombPPrun, data.EPermCCombPPrun);
  if (USE_TWIST_FLIP_PRUN) {
    fill16(FlipS2RF, data.FlipS2RF);
    fill32(TwistFlipPrun, data.TwistFlipPrun);
  }

  initLevel = 2;
}

// ─── CoordCube node (represents phase-1 state during IDA*) ────────────────────

export class CoordCube {
  twist = 0;
  tsym = 0;
  flip = 0;
  fsym = 0;
  slice = 0;
  prun = 0;
  // Conjugate values (used when USE_CONJ_PRUN)
  twistc = 0;
  flipc = 0;

  copyFrom(node: CoordCube): void {
    this.twist = node.twist;
    this.tsym = node.tsym;
    this.flip = node.flip;
    this.fsym = node.fsym;
    this.slice = node.slice;
    this.prun = node.prun;
    if (USE_CONJ_PRUN) {
      this.twistc = node.twistc;
      this.flipc = node.flipc;
    }
  }

  calcPruning(isPhase1: boolean): void {
    this.prun = Math.max(
      Math.max(
        getPruning(UDSliceTwistPrun, this.twist * N_SLICE + UDSliceConj[this.slice][this.tsym]),
        getPruning(UDSliceFlipPrun, this.flip * N_SLICE + UDSliceConj[this.slice][this.fsym]),
      ),
      Math.max(
        USE_CONJ_PRUN ? getPruning(TwistFlipPrun,
          (this.twistc >> 3) << 11 | FlipS2RF[this.flipc ^ (this.twistc & 7)]) : 0,
        USE_TWIST_FLIP_PRUN ? getPruning(TwistFlipPrun,
          this.twist << 11 | FlipS2RF[this.flip << 3 | (this.fsym ^ this.tsym)]) : 0,
      ),
    );
  }

  /** Set node from CubieCube; return false if prun > depth (prune immediately) */
  setWithPrun(cc: CubieCube, depth: number): boolean {
    let twist = cc.getTwistSym();
    let flip = cc.getFlipSym();
    this.tsym = twist & 7;
    this.twist = twist >> 3;

    this.prun = USE_TWIST_FLIP_PRUN
      ? getPruning(TwistFlipPrun, this.twist << 11 | FlipS2RF[flip ^ this.tsym])
      : 0;
    if (this.prun > depth) return false;

    this.fsym = flip & 7;
    this.flip = flip >> 3;

    this.slice = cc.getUDSlice();
    this.prun = Math.max(this.prun, Math.max(
      getPruning(UDSliceTwistPrun, this.twist * N_SLICE + UDSliceConj[this.slice][this.tsym]),
      getPruning(UDSliceFlipPrun, this.flip * N_SLICE + UDSliceConj[this.slice][this.fsym]),
    ));
    if (this.prun > depth) return false;

    if (USE_CONJ_PRUN) {
      const pc = new CubieCube();
      CubieCube.CornConjugate(cc, 1, pc);
      CubieCube.EdgeConjugate(cc, 1, pc);
      this.twistc = pc.getTwistSym();
      this.flipc = pc.getFlipSym();
      this.prun = Math.max(this.prun,
        getPruning(TwistFlipPrun,
          (this.twistc >> 3) << 11 | FlipS2RF[this.flipc ^ (this.twistc & 7)]));
    }

    return this.prun <= depth;
  }

  /** Apply move m and return new pruning value */
  doMovePrun(cc: CoordCube, m: number, isPhase1: boolean): number {
    this.slice = UDSliceMove[cc.slice][m];

    const flipx = FlipMove[cc.flip][Sym8Move[m << 3 | cc.fsym]];
    this.fsym = (flipx & 7) ^ cc.fsym;
    this.flip = flipx >> 3;

    const twistx = TwistMove[cc.twist][Sym8Move[m << 3 | cc.tsym]];
    this.tsym = (twistx & 7) ^ cc.tsym;
    this.twist = twistx >> 3;

    this.prun = Math.max(
      Math.max(
        getPruning(UDSliceTwistPrun, this.twist * N_SLICE + UDSliceConj[this.slice][this.tsym]),
        getPruning(UDSliceFlipPrun, this.flip * N_SLICE + UDSliceConj[this.slice][this.fsym]),
      ),
      USE_TWIST_FLIP_PRUN
        ? getPruning(TwistFlipPrun, this.twist << 11 | FlipS2RF[this.flip << 3 | (this.fsym ^ this.tsym)])
        : 0,
    );
    return this.prun;
  }

  doMovePrunConj(cc: CoordCube, m: number): number {
    const mc = SymMove[3][m];
    const flipx = FlipMove[cc.flipc >> 3][Sym8Move[mc << 3 | cc.flipc & 7]] ^ (cc.flipc & 7);
    const twistx = TwistMove[cc.twistc >> 3][Sym8Move[mc << 3 | cc.twistc & 7]] ^ (cc.twistc & 7);
    this.flipc = flipx;
    this.twistc = twistx;
    return getPruning(TwistFlipPrun,
      (twistx >> 3) << 11 | FlipS2RF[flipx ^ (twistx & 7)]);
  }
}
