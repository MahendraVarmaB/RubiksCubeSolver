/**
 * util.ts
 * Direct TypeScript port of cs.min2phase.Util (Java)
 * Contains: move/facelet constants, combinatorics helpers,
 * permutation encode/decode, comb encode/decode, and the Solution class.
 */

// ─── Move indices ────────────────────────────────────────────────────────────
export const Ux1 = 0;
export const Ux2 = 1;
export const Ux3 = 2;
export const Rx1 = 3;
export const Rx2 = 4;
export const Rx3 = 5;
export const Fx1 = 6;
export const Fx2 = 7;
export const Fx3 = 8;
export const Dx1 = 9;
export const Dx2 = 10;
export const Dx3 = 11;
export const Lx1 = 12;
export const Lx2 = 13;
export const Lx3 = 14;
export const Bx1 = 15;
export const Bx2 = 16;
export const Bx3 = 17;

// ─── Facelet position indices (0-53) ─────────────────────────────────────────
export const U1 = 0;  export const U2 = 1;  export const U3 = 2;
export const U4 = 3;  export const U5 = 4;  export const U6 = 5;
export const U7 = 6;  export const U8 = 7;  export const U9 = 8;
export const R1 = 9;  export const R2 = 10; export const R3 = 11;
export const R4 = 12; export const R5 = 13; export const R6 = 14;
export const R7 = 15; export const R8 = 16; export const R9 = 17;
export const F1 = 18; export const F2 = 19; export const F3 = 20;
export const F4 = 21; export const F5 = 22; export const F6 = 23;
export const F7 = 24; export const F8 = 25; export const F9 = 26;
export const D1 = 27; export const D2 = 28; export const D3 = 29;
export const D4 = 30; export const D5 = 31; export const D6 = 32;
export const D7 = 33; export const D8 = 34; export const D9 = 35;
export const L1 = 36; export const L2 = 37; export const L3 = 38;
export const L4 = 39; export const L5 = 40; export const L6 = 41;
export const L7 = 42; export const L8 = 43; export const L9 = 44;
export const B1 = 45; export const B2 = 46; export const B3 = 47;
export const B4 = 48; export const B5 = 49; export const B6 = 50;
export const B7 = 51; export const B8 = 52; export const B9 = 53;

// ─── Face color indices ───────────────────────────────────────────────────────
export const U_COL = 0;
export const R_COL = 1;
export const F_COL = 2;
export const D_COL = 3;
export const L_COL = 4;
export const B_COL = 5;

// ─── Facelet positions for each corner cubie (3 stickers per corner) ─────────
// Order: URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB
export const cornerFacelet: number[][] = [
  [U9, R1, F3], [U7, F1, L3], [U1, L1, B3], [U3, B1, R3],
  [D3, F9, R7], [D1, L9, F7], [D7, B9, L7], [D9, R9, B7],
];

// ─── Facelet positions for each edge cubie (2 stickers per edge) ─────────────
// Order: UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR
export const edgeFacelet: number[][] = [
  [U6, R2], [U8, F2], [U4, L2], [U2, B2],
  [D6, R8], [D2, F8], [D4, L8], [D8, B8],
  [F6, R4], [F4, L6], [B6, L4], [B4, R6],
];

// ─── Move name strings (index = move number 0-17) ────────────────────────────
export const move2str: string[] = [
  'U ', 'U2', "U'", 'R ', 'R2', "R'", 'F ', 'F2', "F'",
  'D ', 'D2', "D'", 'L ', 'L2', "L'", 'B ', 'B2', "B'",
];

/**
 * ud2std[i] = the standard move index (0-17) for phase-2 move i (0-9 are
 * the 10 moves available in phase 2: U, U2, U', D, D2, D', R2, F2, L2, B2,
 * plus Rx1/Rx3, Fx1/Fx3, Lx1/Lx3, Bx1/Bx3 when using 18 entries).
 *
 * The 10 phase-2 moves are indexed 0..9, then 10..17 are extra for 3-axis search.
 */
export const ud2std: number[] = [
  Ux1, Ux2, Ux3, Rx2, Fx2, Dx1, Dx2, Dx3, Lx2, Bx2,
  Rx1, Rx3, Fx1, Fx3, Lx1, Lx3, Bx1, Bx3,
];

/** Inverse: std2ud[moveStd] = phase2 move index (or -1 if not a phase-2 move) */
export const std2ud: number[] = new Array(18).fill(0);

/**
 * ckmv2bit[i] = bitmask of phase-2 moves that must be skipped
 * after move i was just played (to prune redundant sequences).
 */
export const ckmv2bit: number[] = new Array(11).fill(0);

// ─── Pascal's triangle C(n,k) for n,k up to 12 ───────────────────────────────
export const Cnk: number[][] = Array.from({ length: 13 }, () => new Array(13).fill(0));

// ─── Static initialiser (equivalent to Java's static{} block) ────────────────
(function initUtil() {
  // Build std2ud inverse map
  for (let i = 0; i < 18; i++) {
    std2ud[ud2std[i]] = i;
  }

  // Build ckmv2bit table
  for (let i = 0; i < 10; i++) {
    const ix = ud2std[i] / 3 | 0;
    ckmv2bit[i] = 0;
    for (let j = 0; j < 10; j++) {
      const jx = ud2std[j] / 3 | 0;
      ckmv2bit[i] |= ((ix === jx || (ix % 3 === jx % 3 && ix >= jx)) ? 1 : 0) << j;
    }
  }
  ckmv2bit[10] = 0;

  // Pascal's triangle
  for (let i = 0; i < 13; i++) {
    Cnk[i][0] = Cnk[i][i] = 1;
    for (let j = 1; j < i; j++) {
      Cnk[i][j] = Cnk[i - 1][j - 1] + Cnk[i - 1][j];
    }
  }
})();

// ─── Permutation parity ───────────────────────────────────────────────────────

/**
 * getNParity: returns 0 or 1 — the parity of the permutation encoded as
 * a Lehmer-code integer idx of n elements.
 */
export function getNParity(idx: number, n: number): number {
  let p = 0;
  for (let i = n - 2; i >= 0; i--) {
    p ^= idx % (n - i);
    idx = (idx / (n - i)) | 0;
  }
  return p & 1;
}

// ─── Shared value helpers (edge arrays store perm<<1|ori, corner arrays store ori<<3|perm) ──

/** Extract the permutation index from a packed edge or corner byte */
export function getVal(val0: number, isEdge: boolean): number {
  return isEdge ? val0 >> 1 : val0 & 7;
}

/** Pack a permutation index back into the byte, preserving orientation bits */
export function setVal(val0: number, val: number, isEdge: boolean): number {
  // Ensure result fits in a signed byte range for compatibility
  const result = isEdge ? (val << 1 | val0 & 1) : (val | val0 & ~7);
  // Keep as signed byte (Java byte = signed 8-bit)
  return result > 127 ? result - 256 : result;
}

// ─── N-element permutation encode/decode ─────────────────────────────────────

/**
 * setNPerm: decode a Lehmer-code integer idx into the first n elements
 * of arr[], packing via setVal().
 *
 * Java uses a 64-bit long "val" digit-map trick; we replicate it with BigInt
 * for correctness, then fall back to a plain number where safe.
 */
export function setNPerm(arr: Int8Array, idx: number, n: number, isEdge: boolean): void {
  // Build digit map 0xFEDCBA9876543210 as BigInt
  let val = BigInt('0xFEDCBA9876543210');
  let extract = BigInt(0);
  for (let p = 2; p <= n; p++) {
    extract = (extract << BigInt(4)) | BigInt(idx % p);
    idx = (idx / p) | 0;
  }
  for (let i = 0; i < n - 1; i++) {
    const v = (Number(extract) & 0xf) << 2;
    extract >>= BigInt(4);
    arr[i] = setVal(arr[i], Number((val >> BigInt(v)) & BigInt(0xf)), isEdge);
    const m = (BigInt(1) << BigInt(v)) - BigInt(1);
    val = (val & m) | ((val >> BigInt(4)) & ~m);
  }
  arr[n - 1] = setVal(arr[n - 1], Number(val & BigInt(0xf)), isEdge);
}

/**
 * getNPerm: encode the first n elements of arr[] into a Lehmer-code integer.
 */
export function getNPerm(arr: Int8Array, n: number, isEdge: boolean): number {
  let idx = 0;
  let val = BigInt('0xFEDCBA9876543210');
  for (let i = 0; i < n - 1; i++) {
    const v = getVal(arr[i], isEdge) << 2;
    idx = (n - i) * idx + Number((val >> BigInt(v)) & BigInt(0xf));
    val -= BigInt('0x1111111111111110') << BigInt(v);
  }
  return idx;
}

// ─── Combination (C(12,4) subset) encode/decode ──────────────────────────────

/**
 * getComb: encode which 4 elements of arr[] have (getVal & 0xc) === mask
 * into a combination index in [0, C(arr.length, 4)).
 */
export function getComb(arr: Int8Array, mask: number, isEdge: boolean): number {
  const end = arr.length - 1;
  let idxC = 0;
  let r = 4;
  for (let i = end; i >= 0; i--) {
    const perm = getVal(arr[i], isEdge);
    if ((perm & 0xc) === mask) {
      idxC += Cnk[i][r--];
    }
  }
  return idxC;
}

/**
 * setComb: decode a combination index idxC into arr[], marking 4 positions
 * with (r | mask) and filling the rest sequentially.
 */
export function setComb(arr: Int8Array, idxC: number, mask: number, isEdge: boolean): void {
  const end = arr.length - 1;
  let r = 4;
  let fill = end;
  for (let i = end; i >= 0; i--) {
    if (idxC >= Cnk[i][r]) {
      idxC -= Cnk[i][r--];
      arr[i] = setVal(arr[i], r | mask, isEdge);
    } else {
      if ((fill & 0xc) === mask) {
        fill -= 4;
      }
      arr[i] = setVal(arr[i], fill--, isEdge);
    }
  }
}

// ─── Solution class ───────────────────────────────────────────────────────────

export const USE_SEPARATOR    = 0x1;
export const INVERSE_SOLUTION = 0x2;
export const APPEND_LENGTH    = 0x4;
export const OPTIMAL_SOLUTION = 0x8;

export class Solution {
  length  = 0;
  depth1  = 0;
  verbose = 0;
  urfIdx  = 0;
  moves: number[] = new Array(31).fill(0);

  // urfMove is set by CubieCube — we reference it lazily via a callback
  // to avoid a circular import. Set before calling toString().
  urfMoveRef: number[][] | null = null;

  setArgs(verbose: number, urfIdx: number, depth1: number): void {
    this.verbose = verbose;
    this.urfIdx  = urfIdx;
    this.depth1  = depth1;
  }

  appendSolMove(curMove: number): void {
    if (this.length === 0) {
      this.moves[this.length++] = curMove;
      return;
    }
    const axisCur  = (curMove / 3) | 0;
    const axisLast = (this.moves[this.length - 1] / 3) | 0;
    if (axisCur === axisLast) {
      const pow = (curMove % 3 + this.moves[this.length - 1] % 3 + 1) % 4;
      if (pow === 3) {
        this.length--;
      } else {
        this.moves[this.length - 1] = axisCur * 3 + pow;
      }
      return;
    }
    if (
      this.length > 1 &&
      axisCur % 3 === axisLast % 3 &&
      axisCur === (this.moves[this.length - 2] / 3 | 0)
    ) {
      const pow = (curMove % 3 + this.moves[this.length - 2] % 3 + 1) % 4;
      if (pow === 3) {
        this.moves[this.length - 2] = this.moves[this.length - 1];
        this.length--;
      } else {
        this.moves[this.length - 2] = axisCur * 3 + pow;
      }
      return;
    }
    this.moves[this.length++] = curMove;
  }

  toString(): string {
    if (!this.urfMoveRef) return '';
    const urfMove = this.urfMoveRef;
    let sb = '';
    let urf = (this.verbose & INVERSE_SOLUTION) !== 0 ? (this.urfIdx + 3) % 6 : this.urfIdx;
    if (urf < 3) {
      for (let s = 0; s < this.length; s++) {
        if ((this.verbose & USE_SEPARATOR) !== 0 && s === this.depth1) {
          sb += '.  ';
        }
        sb += move2str[urfMove[urf][this.moves[s]]] + ' ';
      }
    } else {
      for (let s = this.length - 1; s >= 0; s--) {
        sb += move2str[urfMove[urf][this.moves[s]]] + ' ';
        if ((this.verbose & USE_SEPARATOR) !== 0 && s === this.depth1) {
          sb += '.  ';
        }
      }
    }
    if ((this.verbose & APPEND_LENGTH) !== 0) {
      sb += `(${this.length}f)`;
    }
    return sb.trim();
  }
}

// ─── Facelet string → CubieCube (used in Search.verify) ─────────────────────
// Implemented in tools.ts to avoid circular dependency.
