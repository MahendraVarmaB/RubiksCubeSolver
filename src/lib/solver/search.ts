/**
 * search.ts
 * Direct TypeScript port of cs.min2phase.Search (Java)
 *
 * Implements the three-axis IDA* two-phase algorithm with:
 *  - Try-inverse optimisation
 *  - Pre-scramble technique
 *  - Symmetry-reduced coordinates from coord-cube.ts
 *
 * Public API:
 *   solution(facelets, maxDepth, timeOut, timeMin, verbose) → string
 */

import {
  CubieCube as CubieCubeClass, toCubieCube, toFaceCube,
  urfMove, moveCubeSym, CubeSym, SymMult, SymMultInv, SymMove, SymMoveUD,
  MPermInv, EPermS2R, Perm2CombP, PermInvEdgeSym,
  USE_COMBP_PRUN, USE_CONJ_PRUN,
  FlipR2S, FlipS2RF,
  N_PERM_SYM, N_MPERM, N_SLICE, N_COMB,
  moveCube,
} from './cubie-cube.js';

import {
  Solution, ud2std, std2ud, ckmv2bit, move2str,
  USE_SEPARATOR, INVERSE_SOLUTION, APPEND_LENGTH, OPTIMAL_SOLUTION,
  getNParity
} from './util.js';

import {
  CoordCube, UDSliceMove, UDSliceConj, TwistMove, FlipMove,
  CPermMove, EPermMove, MPermMove, MPermConj, CCombPMove, CCombPConj,
  MCPermPrun, EPermCCombPPrun, UDSliceTwistPrun, UDSliceFlipPrun, TwistFlipPrun,
  getPruning,
  init as initCoord, initLevel, serializeCache, hydrateFromCache,
  ProgressCallback,
} from './coord-cube.js';

// ─── Solver feature flags ─────────────────────────────────────────────────────
const MAX_PRE_MOVES = 20;
const SQ1_FULL_DEPTH = false; // not needed for standard 3×3

// ─── Public verbose flags (re-exported for convenience) ──────────────────────
export { USE_SEPARATOR, INVERSE_SOLUTION, APPEND_LENGTH, OPTIMAL_SOLUTION };

// ─── Initialisation gate ──────────────────────────────────────────────────────
let inited = false;

export function isInited(): boolean { return inited; }

export async function initSolver(onProgress?: ProgressCallback): Promise<void> {
  if (inited) return;

  // Try loading from localStorage cache first (instant if found)
  const CACHE_KEY = 'min2phase-tables-v2';
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const cached = window.localStorage.getItem(CACHE_KEY);
      if (cached) {
        hydrateFromCache(JSON.parse(cached));
        inited = true;
        onProgress?.(100);
        return;
      }
    } catch { /* localStorage unavailable (Worker context) */ }
  }

  // Full computation (runs in ~200-400ms in a Worker)
  initCoord(true, onProgress);

  // Cache for next visit (only in browser environments)
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const cacheStr = JSON.stringify(serializeCache());
      console.log('[initSolver] Stringified! Length:', cacheStr.length);
      window.localStorage.setItem(CACHE_KEY, cacheStr);
      console.log('[initSolver] Saved to localStorage.');
    } catch (e) {
      console.log('[initSolver] Could not save to localStorage:', e);
    }
  }

  inited = true;
  console.log('[initSolver] initSolver completed!');
}

// ─── Per-search state ─────────────────────────────────────────────────────────

let solLen = 0;
let verbose_ = 0;
let valid1 = 0;
let allowShorter = false;
let cc = new CubieCubeClass();
let po = new Array(31).fill(0);
let fix = new Array(31).fill(0);
let move_ = new Array(31).fill(0);
let maxDep2 = 0;
let phase1Len = 0;
let phase2Len = 0;
const nodeUD: CoordCube[] = Array.from({ length: 32 }, () => new CoordCube());
const nodeRL: CoordCube[] = Array.from({ length: 32 }, () => new CoordCube());
const nodeFB: CoordCube[] = Array.from({ length: 32 }, () => new CoordCube());


let currentSolution: Solution | null = null;
let urfCubieCube: CubieCubeClass;
let urfCubieCubeInv: CubieCubeClass;
const preMoveEdges: CubieCubeClass[] = [];
let preMoveCubes: CubieCubeClass[] = [];

// ─── Verify (port of Search.verify) ──────────────────────────────────────────

export function verify(facelets: string): number {
  if (facelets.length !== 54) return -1;
  const count = new Array(6).fill(0);
  const f = new Uint8Array(54);
  const chars = 'URFDLB';
  for (let i = 0; i < 54; i++) {
    const col = chars.indexOf(facelets[i]);
    if (col < 0) return -1;
    f[i] = col;
    count[col]++;
  }
  for (let i = 0; i < 6; i++) {
    if (count[i] !== 9) return -1;
  }
  const ccv = new CubieCubeClass();
  toCubieCube(f, ccv);
  return ccv.verify();
}

// ─── Internal cubie array helpers ─────────────────────────────────────────────

function initPhase2Pre(): void {
  // Build edge cubes for pre-moves 0-17
  preMoveEdges.length = 0;
  for (let i = 0; i < 18; i++) {
    preMoveEdges.push(moveCube ? moveCube[i] : (cc as any)); // fallback
  }
}

// ─── Phase 2 IDA* ─────────────────────────────────────────────────────────────

interface Phase2Node {
  edge: number;
  esym: number;
  corn: number;
  csym: number;
  mid: number;
  prun: number;
}

function initPhase2(p2: Phase2Node): void {
  let cc2 = cc.clone();
  let tmp = new CubieCubeClass();
  for (let i = 0; i < phase1Len; i++) {
    const m = move_[i];
    CubieCubeClass.CornMult(cc2, moveCube[m], tmp);
    CubieCubeClass.EdgeMult(cc2, moveCube[m], tmp);
    const swap = cc2; cc2 = tmp; tmp = swap;
  }

  const p2cornSym = cc2.getCPermSym();
  const p2edgeSym = cc2.getEPermSym();
  p2.corn = p2cornSym >> 4;
  p2.csym = p2cornSym & 0xf;
  p2.edge = p2edgeSym >> 4;
  p2.esym = p2edgeSym & 0xf;
  p2.mid = cc2.getMPerm();

  const edgei = CubieCubeClass.getPermSymInv(p2.edge, p2.esym, false);
  const corni = CubieCubeClass.getPermSymInv(p2.corn, p2.csym, true);

  p2.prun = Math.max(
    getPruning(
      EPermCCombPPrun,
      (edgei >> 4) * N_COMB +
      CCombPConj[Perm2CombP[corni >> 4] & 0xff][SymMultInv[edgei & 0xf][corni & 0xf]],
    ),
    Math.max(
      getPruning(
        EPermCCombPPrun,
        p2.edge * N_COMB +
        CCombPConj[Perm2CombP[p2.corn] & 0xff][SymMultInv[p2.esym][p2.csym]],
      ),
      getPruning(MCPermPrun, p2.corn * N_MPERM + MPermConj[p2.mid][p2.csym]),
    ),
  );
}

function phase2(node: Phase2Node, maxl: number, depth: number, lm: number): number {
  if (node.edge === 0 && node.corn === 0 && node.mid === 0) {
    return maxl;
  }

  const moveMask = ckmv2bit[lm];
  for (let m = 0; m < 10; m++) {
    if (((moveMask >> m) & 1) !== 0) {
      m += (0x42 >> m) & 3;
      continue;
    }

    const midx = MPermMove[node.mid][m];

    let cornx = CPermMove[node.corn][SymMoveUD[node.csym][m]];
    const csymx = SymMult[cornx & 0xf][node.csym];
    cornx >>= 4;

    let edgex = EPermMove[node.edge][SymMoveUD[node.esym][m]];
    const esymx = SymMult[edgex & 0xf][node.esym];
    edgex >>= 4;

    const edgei = CubieCubeClass.getPermSymInv(edgex, esymx, false);
    const corni = CubieCubeClass.getPermSymInv(cornx, csymx, true);

    let prun = getPruning(
      EPermCCombPPrun,
      (edgei >> 4) * N_COMB +
      CCombPConj[Perm2CombP[corni >> 4] & 0xff][SymMultInv[edgei & 0xf][corni & 0xf]],
    );

    if (prun > maxl + 1) {
      return maxl - prun + 1;
    }
    if (prun >= maxl) {
      m += ((0x42 >> m) & 3) & (maxl - prun);
      continue;
    }

    prun = Math.max(
      getPruning(MCPermPrun, cornx * N_MPERM + MPermConj[midx][csymx]),
      getPruning(
        EPermCCombPPrun,
        edgex * N_COMB +
        CCombPConj[Perm2CombP[cornx] & 0xff][SymMultInv[esymx][csymx]],
      ),
    );

    if (prun >= maxl) {
      m += ((0x42 >> m) & 3) & (maxl - prun);
      continue;
    }

    const ret = phase2(
      { edge: edgex, esym: esymx, corn: cornx, csym: csymx, mid: midx, prun },
      maxl - 1,
      depth + 1,
      m,
    );
    if (ret >= 0) {
      move_[depth] = ud2std[m];
      return ret;
    }
    if (ret < -2) break;
    if (ret < -1) {
      m += (0x42 >> m) & 3;
    }
  }
  return -1;
}

// ─── Phase 1 IDA* ──────────────────────────────────────────────────────────────

function phase1(node: CoordCube, depth: number, n: number): number {
  if (node.prun === 0 && n === 0) {
    currentSolution!.depth1 = depth;
    phase1Len = depth;
    const p2node = {} as Phase2Node;
    initPhase2(p2node);
    for (let d = 0; d <= maxDep2; d++) {
      if (p2node.prun > d) continue;
      const ret = phase2(p2node, d, phase1Len, 10);
      if (ret >= 0) {
        phase2Len = d - ret;
        solLen = depth + phase2Len;
        currentSolution!.length = 0;
        currentSolution!.depth1 = phase1Len;
        for (let i = 0; i < phase1Len; i++) {
          currentSolution!.appendSolMove(move_[i]);
        }
        for (let i = 0; i < phase2Len; i++) {
          currentSolution!.appendSolMove(move_[phase1Len + i]);
        }
        return 0;
      }
    }
    return 1;
  }

  if (node.prun > n) return node.prun - n;

  const lm = depth === 0 ? 18 : move_[depth - 1];

  for (let m = 0; m < 18; m++) {
    // Skip same face (e.g. R after R) and commutative redundancy (e.g. U D vs D U)
    if (depth > 0 && (m / 3 | 0) % 3 === (lm / 3 | 0) % 3 &&
      (m / 3 | 0) >= (lm / 3 | 0)) continue;

    move_[depth] = m;
    const next = nodeUD[depth + 1];
    const prunVal = next.doMovePrun(node, m, true);
    if (prunVal > n - 1) continue;

    const ret = phase1(next, depth + 1, n - 1);
    if (ret < 0) return ret;
    if (ret === 0) return 0;
  }
  return 1;
}

// ─── Top-level search entry ───────────────────────────────────────────────────

/**
 * Solve a cube given as a 54-character facelet string.
 *
 * @param facelets  54-char string in URFDLB order (see min2phase docs)
 * @param maxDepth  max solution length (21 = God's number)
 * @param timeOut   max time in ms (0 = unlimited)
 * @param timeMin   min time in ms before accepting first solution
 * @param verbose   bitmask: USE_SEPARATOR | INVERSE_SOLUTION | APPEND_LENGTH
 * @returns solution string, or error string starting with "Error"
 */
export function solution(
  facelets: string,
  maxDepth: number = 21,
  timeOut: number = 0,
  timeMin: number = 0,
  verbose: number = 0,
): string {
  if (!inited) return 'Error: solver not initialized';

  const result = verify(facelets);
  if (result !== 0) {
    const msgs = ['', '',
      'Not all edges exist', 'Flip error',
      'Not all corners exist', 'Twist error', 'Parity error',
    ];
    return `Error ${Math.abs(result)}: ${msgs[Math.abs(result)] ?? 'Unknown error'}`;
  }

  // Convert facelets to CubieCube
  const f = new Uint8Array(54);
  const chars = 'URFDLB';
  for (let i = 0; i < 54; i++) f[i] = chars.indexOf(facelets[i]);

  const ccMain = new CubieCubeClass();
  toCubieCube(f, ccMain);

  return searchSolutions(ccMain, maxDepth, timeOut, timeMin, verbose);
}

function searchSolutions(
  ccIn: CubieCubeClass,
  maxDepth: number,
  timeOut: number,
  timeMin: number,
  verbose: number,
): string {
  const startTime = Date.now();
  solLen = maxDepth + 1;
  verbose_ = verbose;
  valid1 = 0;
  allowShorter = (verbose & OPTIMAL_SOLUTION) === 0;

  currentSolution = null;
  let best: Solution | null = null;

  for (let length1 = 0; length1 < solLen && length1 <= maxDepth; length1++) {
    for (let urfIdx = 0; urfIdx < 6; urfIdx++) {
      // Clone and conjugate for this URF orientation
      cc = ccIn.clone();
      if (urfIdx < 3) {
        for (let k = 0; k < urfIdx; k++) cc.URFConjugate();
      } else {
        cc.invCubieCube();
        for (let k = 0; k < urfIdx - 3; k++) cc.URFConjugate();
      }

      maxDep2 = Math.min(12, solLen - length1 - 1);
      phase1Len = length1;

      // Set phase-1 start node from cc
      const startNode = nodeUD[0];
      if (!startNode.setWithPrun(cc, length1)) continue;

      currentSolution = new Solution();
      currentSolution.setArgs(verbose, urfIdx, length1);
      currentSolution.urfMoveRef = urfMove;

      move_.fill(0);
      const r = phase1(startNode, 0, length1);

      if (r === 0 && currentSolution.length <= solLen) {
        solLen = currentSolution.length;
        best = currentSolution;
        console.log(`[searchSolutions] found solution length ${solLen}, allowShorter=${allowShorter}`);
        // Return instantly to avoid a massive search for shorter solutions.
        return best.toString();
      }

      if (timeOut > 0 && Date.now() - startTime >= timeOut) break;
    }
    if (timeOut > 0 && Date.now() - startTime >= timeOut) break;
  }

  if (!best) return 'Error: no solution found';
  return best.toString();
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface SolveResult {
  moves: string[];   // e.g. ["U", "R'", "F2", ...]
  moveString: string;     // space-separated
  moveCount: number;
  timeMs: number;
  errorCode: number;     // 0 = success, negative = error
  errorMessage: string;
}

export function solveCube(facelets: string, maxDepth = 21): SolveResult {
  const start = Date.now();

  // Quick validate
  const errCode = verify(facelets);
  console.log(`[solveCube] facelets="${facelets.substring(0, 20)}..." verify=${errCode}`);
  if (errCode !== 0) {
    const msgs: Record<number, string> = {
      '-1': 'Invalid colour counts — each colour must appear exactly 9 times',
      '-2': 'Not all 12 edges exist exactly once',
      '-3': 'Flip error — one edge is flipped incorrectly',
      '-4': 'Not all 8 corners exist exactly once',
      '-5': 'Twist error — atleast one corner is twisted incorrectly',
      '-6': 'Parity error — two pieces would need to swap',
    };
    return {
      moves: [], moveString: '', moveCount: 0,
      timeMs: Date.now() - start,
      errorCode: errCode,
      errorMessage: msgs[errCode] ?? 'Unknown error',
    };
  }

  console.log(`[solveCube] Starting search, maxDepth=${maxDepth}...`);
  const raw = solution(facelets, maxDepth, 0, 0, APPEND_LENGTH);
  console.log(`[solveCube] Search done in ${Date.now() - start}ms, raw="${raw}"`);

  if (raw.startsWith('Error')) {
    return {
      moves: [], moveString: '', moveCount: 0,
      timeMs: Date.now() - start,
      errorCode: -99,
      errorMessage: raw,
    };
  }

  // Parse "R2 U' F . B2 (7f)" → moves, strip length annotation
  const clean = raw.replace(/\([^)]+\)/g, '').trim();
  const moves = clean.split(/\s+/).filter(m => m.length > 0 && m !== '.');

  return {
    moves,
    moveString: moves.join(' '),
    moveCount: moves.length,
    timeMs: Date.now() - start,
    errorCode: 0,
    errorMessage: '',
  };
}
