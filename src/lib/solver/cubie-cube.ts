/**
 * cubie-cube.ts
 * Direct TypeScript port of cs.min2phase.CubieCube (Java)
 *
 * Represents a Rubik's cube at the cubie level:
 *   ca[8]  — corner array: low 3 bits = corner permutation (0-7),
 *             high 3 bits = corner orientation (0-2)
 *   ea[12] — edge array:   bits 1-4 = edge permutation (0-11),
 *             bit 0 = edge orientation (0-1)
 *
 * Java uses signed byte[]; we use Int8Array to match the exact signed-byte
 * overflow semantics. All bitwise ops must mask with 0xff when treating as
 * unsigned, or rely on JS's natural 32-bit signed int arithmetic.
 */

import {
  Cnk, getNPerm, setNPerm, getComb, setComb, getNParity,
  cornerFacelet, edgeFacelet,
  ud2std, std2ud,
} from './util.js';

// ─── Coordinate sizes ─────────────────────────────────────────────────────────
export const N_MOVES     = 18;
export const N_MOVES2    = 10;
export const N_SLICE     = 495;
export const N_TWIST     = 2187;
export const N_TWIST_SYM = 324;
export const N_FLIP      = 2048;
export const N_FLIP_SYM  = 336;
export const N_PERM      = 40320;
export const N_PERM_SYM  = 2768;
export const N_MPERM     = 24;
export const N_COMB      = 140; // USE_COMBP_PRUN = true → 140, else 70

// ─── Solver feature flags (mirror Search.java statics) ───────────────────────
export const USE_TWIST_FLIP_PRUN = true;
export const USE_COMBP_PRUN      = true;  // same as USE_TWIST_FLIP_PRUN
export const USE_CONJ_PRUN       = true;

// ─── SYM_E2C_MAGIC ───────────────────────────────────────────────────────────
export const SYM_E2C_MAGIC = 0x00dddd00;
export function ESym2CSym(idx: number): number {
  return idx ^ ((SYM_E2C_MAGIC >> ((idx & 0xf) << 1)) & 3);
}

// ─── ClassIndex → Representant arrays ────────────────────────────────────────
export const FlipS2R:      Uint16Array = new Uint16Array(N_FLIP_SYM);
export const TwistS2R:     Uint16Array = new Uint16Array(N_TWIST_SYM);
export const EPermS2R:     Uint16Array = new Uint16Array(N_PERM_SYM);
export const Perm2CombP:   Int8Array   = new Int8Array(N_PERM_SYM);
export const PermInvEdgeSym: Uint16Array = new Uint16Array(N_PERM_SYM);
export const MPermInv:     Uint8Array  = new Uint8Array(N_MPERM);

// Raw → Sym maps (only needed during init)
export const FlipR2S:  Uint16Array = new Uint16Array(N_FLIP);
export const TwistR2S: Uint16Array = new Uint16Array(N_TWIST);
export const EPermR2S: Uint16Array = new Uint16Array(N_PERM);
export const FlipS2RF: Uint16Array = USE_TWIST_FLIP_PRUN
  ? new Uint16Array(N_FLIP_SYM * 8)
  : new Uint16Array(0);

// SymState arrays (allocated during initSym2Raw)
export let SymStateTwist: Uint16Array;
export let SymStateFlip:  Uint16Array;
export let SymStatePerm:  Uint16Array;

// ─── Symmetry group arrays ────────────────────────────────────────────────────
export const CubeSym:     CubieCube[] = new Array(16);
export const moveCube:    CubieCube[] = new Array(18);
export const moveCubeSym: bigint[]    = new Array(18).fill(BigInt(0));
export const firstMoveSym: number[]   = new Array(48).fill(0);

export const SymMult:    number[][] = Array.from({ length: 16 }, () => new Array(16).fill(0));
export const SymMultInv: number[][] = Array.from({ length: 16 }, () => new Array(16).fill(0));
export const SymMove:    number[][] = Array.from({ length: 16 }, () => new Array(18).fill(0));
export const Sym8Move:   number[]   = new Array(8 * 18).fill(0);
export const SymMoveUD:  number[][] = Array.from({ length: 16 }, () => new Array(18).fill(0));

/** urfMove[axis][move] = move after URF conjugation for axis (0-5) */
export const urfMove: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  [6, 7, 8, 0, 1, 2, 3, 4, 5, 15, 16, 17, 9, 10, 11, 12, 13, 14],
  [3, 4, 5, 6, 7, 8, 0, 1, 2, 12, 13, 14, 15, 16, 17, 9, 10, 11],
  [2, 1, 0, 5, 4, 3, 8, 7, 6, 11, 10, 9, 14, 13, 12, 17, 16, 15],
  [8, 7, 6, 2, 1, 0, 5, 4, 3, 17, 16, 15, 11, 10, 9, 14, 13, 12],
  [5, 4, 3, 8, 7, 6, 2, 1, 0, 14, 13, 12, 17, 16, 15, 11, 10, 9],
];

// ─── CubieCube class ──────────────────────────────────────────────────────────
export class CubieCube {
  // Packed corner/edge arrays (signed bytes, matching Java's byte[])
  ca: Int8Array = new Int8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  ea: Int8Array = new Int8Array([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
  private _temps: CubieCube | null = null;

  constructor();
  constructor(cperm: number, twist: number, eperm: number, flip: number);
  constructor(cperm?: number, twist?: number, eperm?: number, flip?: number) {
    if (cperm !== undefined) {
      this.setCPerm(cperm);
      this.setTwist(twist!);
      setNPerm(this.ea, eperm!, 12, true);
      this.setFlip(flip!);
    }
  }

  copy(c: CubieCube): void {
    this.ca.set(c.ca);
    this.ea.set(c.ea);
  }

  clone(): CubieCube {
    const c = new CubieCube();
    c.copy(this);
    return c;
  }

  invCubieCube(): void {
    if (!this._temps) this._temps = new CubieCube();
    const t = this._temps;
    for (let edge = 0; edge < 12; edge++) {
      // temps.ea[ea[edge] >> 1] = (byte)(edge << 1 | ea[edge] & 1)
      t.ea[(this.ea[edge] >> 1) & 0x7f] = int8(edge << 1 | this.ea[edge] & 1);
    }
    for (let corn = 0; corn < 8; corn++) {
      // temps.ca[ca[corn] & 0x7] = (byte)(corn | 0x20 >> (ca[corn] >> 3) & 0x18)
      t.ca[this.ca[corn] & 7] = int8(corn | (0x20 >> (this.ca[corn] >> 3)) & 0x18);
    }
    this.copy(t);
  }

  // ── Phase-1 coordinates ───────────────────────────────────────────────────

  getFlip(): number {
    let idx = 0;
    for (let i = 0; i < 11; i++) {
      idx = (idx << 1) | (this.ea[i] & 1);
    }
    return idx;
  }

  setFlip(idx: number): void {
    let parity = 0;
    let val: number;
    for (let i = 10; i >= 0; i--, idx >>= 1) {
      parity ^= (val = idx & 1);
      this.ea[i] = int8((this.ea[i] & ~1) | val);
    }
    this.ea[11] = int8((this.ea[11] & ~1) | parity);
  }

  getFlipSym(): number {
    return FlipR2S[this.getFlip()];
  }

  getTwist(): number {
    let idx = 0;
    for (let i = 0; i < 7; i++) {
      idx += (idx << 1) + (this.ca[i] >> 3);
    }
    return idx;
  }

  setTwist(idx: number): void {
    let twst = 15;
    let val: number;
    for (let i = 6; i >= 0; i--, idx = (idx / 3) | 0) {
      twst -= (val = idx % 3);
      this.ca[i] = int8((this.ca[i] & 0x7) | (val << 3));
    }
    this.ca[7] = int8((this.ca[7] & 0x7) | ((twst % 3) << 3));
  }

  getTwistSym(): number {
    return TwistR2S[this.getTwist()];
  }

  getUDSlice(): number {
    return 494 - getComb(this.ea, 8, true);
  }

  setUDSlice(idx: number): void {
    setComb(this.ea, 494 - idx, 8, true);
  }

  // ── Phase-2 coordinates ───────────────────────────────────────────────────

  getCPerm(): number {
    return getNPerm(this.ca, 8, false);
  }

  setCPerm(idx: number): void {
    setNPerm(this.ca, idx, 8, false);
  }

  getCPermSym(): number {
    return ESym2CSym(EPermR2S[this.getCPerm()]);
  }

  getEPerm(): number {
    return getNPerm(this.ea, 8, true);
  }

  setEPerm(idx: number): void {
    setNPerm(this.ea, idx, 8, true);
  }

  getEPermSym(): number {
    return EPermR2S[this.getEPerm()];
  }

  getMPerm(): number {
    return getNPerm(this.ea, 12, true) % 24;
  }

  setMPerm(idx: number): void {
    setNPerm(this.ea, idx, 12, true);
  }

  getCComb(): number {
    return getComb(this.ca, 0, false);
  }

  setCComb(idx: number): void {
    setComb(this.ca, idx, 0, false);
  }

  // ── Cube validation ───────────────────────────────────────────────────────

  /**
   * Returns 0 if solvable, or a negative error code:
   * -2 edge permutation wrong, -3 edge flip wrong,
   * -4 corner permutation wrong, -5 corner twist wrong, -6 parity error
   */
  verify(): number {
    let sum = 0;
    let edgeMask = 0;
    for (let e = 0; e < 12; e++) {
      if (this.ea[e] < 0) return -2;
      edgeMask |= 1 << ((this.ea[e] >> 1) & 0x7f);
      sum ^= this.ea[e] & 1;
    }
    if (edgeMask !== 0xfff) return -2;
    if (sum !== 0)           return -3;

    let cornMask = 0;
    sum = 0;
    for (let c = 0; c < 8; c++) {
      if (this.ca[c] < 0) return -4;
      cornMask |= 1 << (this.ca[c] & 7);
      sum += (this.ca[c] >> 3) & 0x1f; // unsigned shift
    }
    if (cornMask !== 0xff) return -4;
    if (sum % 3 !== 0)     return -5;

    if ((getNParity(getNPerm(this.ea, 12, true), 12) ^
         getNParity(this.getCPerm(), 8)) !== 0) return -6;

    return 0;
  }

  // ── Self-symmetry ─────────────────────────────────────────────────────────

  selfSymmetry(): bigint {
    const c = this.clone();
    const d = new CubieCube();
    const cperm = (c.getCPermSym() >> 4) & 0xffff;
    let sym = BigInt(0);
    for (let urfInv = 0; urfInv < 6; urfInv++) {
      const cpermx = (c.getCPermSym() >> 4) & 0xffff;
      if (cperm === cpermx) {
        for (let i = 0; i < 16; i++) {
          CubieCube.CornConjugate(c, SymMultInv[0][i], d);
          if (arraysEqual(d.ca, this.ca)) {
            CubieCube.EdgeConjugate(c, SymMultInv[0][i], d);
            if (arraysEqual(d.ea, this.ea)) {
              sym |= BigInt(1) << BigInt(Math.min(urfInv * 16 | i, 48));
            }
          }
        }
      }
      c.URFConjugate();
      if (urfInv % 3 === 2) c.invCubieCube();
    }
    return sym;
  }

  // ── URF conjugation ───────────────────────────────────────────────────────

  URFConjugate(): void {
    if (!this._temps) this._temps = new CubieCube();
    const t = this._temps;
    CubieCube.CornMult(urf2, this, t);
    CubieCube.CornMult(t, urf1, this);
    CubieCube.EdgeMult(urf2, this, t);
    CubieCube.EdgeMult(t, urf1, this);
  }

  // ── Static group operations ───────────────────────────────────────────────

  /** prod = a * b (corners only) */
  static CornMult(a: CubieCube, b: CubieCube, prod: CubieCube): void {
    for (let corn = 0; corn < 8; corn++) {
      const oriA = (a.ca[b.ca[corn] & 7] >> 3) & 0x1f;
      const oriB = (b.ca[corn] >> 3) & 0x1f;
      prod.ca[corn] = int8((a.ca[b.ca[corn] & 7] & 7) | ((oriA + oriB) % 3 << 3));
    }
  }

  /** prod = a * b (corners only) — with mirrored cases */
  static CornMultFull(a: CubieCube, b: CubieCube, prod: CubieCube): void {
    for (let corn = 0; corn < 8; corn++) {
      const oriA = (a.ca[b.ca[corn] & 7] >> 3) & 0x1f;
      const oriB = (b.ca[corn] >> 3) & 0x1f;
      let ori = oriA + (oriA < 3 ? oriB : 6 - oriB);
      ori = ori % 3 + ((oriA < 3 === oriB < 3) ? 0 : 3);
      prod.ca[corn] = int8((a.ca[b.ca[corn] & 7] & 7) | (ori << 3));
    }
  }

  /** prod = a * b (edges only) */
  static EdgeMult(a: CubieCube, b: CubieCube, prod: CubieCube): void {
    for (let ed = 0; ed < 12; ed++) {
      prod.ea[ed] = int8(a.ea[(b.ea[ed] >> 1) & 0x7f] ^ (b.ea[ed] & 1));
    }
  }

  /** b = S_idx^-1 * a * S_idx (corners) */
  static CornConjugate(a: CubieCube, idx: number, b: CubieCube): void {
    const sinv = CubeSym[SymMultInv[0][idx]];
    const s    = CubeSym[idx];
    for (let corn = 0; corn < 8; corn++) {
      const oriA = (sinv.ca[a.ca[s.ca[corn] & 7] & 7] >> 3) & 0x1f;
      const oriB = (a.ca[s.ca[corn] & 7] >> 3) & 0x1f;
      const ori  = oriA < 3 ? oriB : (3 - oriB) % 3;
      b.ca[corn] = int8((sinv.ca[a.ca[s.ca[corn] & 7] & 7] & 7) | (ori << 3));
    }
  }

  /** b = S_idx^-1 * a * S_idx (edges) */
  static EdgeConjugate(a: CubieCube, idx: number, b: CubieCube): void {
    const sinv = CubeSym[SymMultInv[0][idx]];
    const s    = CubeSym[idx];
    for (let ed = 0; ed < 12; ed++) {
      b.ea[ed] = int8(
        sinv.ea[a.ea[(s.ea[ed] >> 1) & 0x7f] >> 1 & 0x7f] ^
        (a.ea[(s.ea[ed] >> 1) & 0x7f] & 1) ^
        (s.ea[ed] & 1)
      );
    }
  }

  static getPermSymInv(idx: number, sym: number, isCorner: boolean): number {
    let idxi = PermInvEdgeSym[idx];
    if (isCorner) idxi = ESym2CSym(idxi);
    return (idxi & 0xfff0) | SymMult[idxi & 0xf][sym];
  }

  static getSkipMoves(ssym: bigint): number {
    let ret = 0;
    for (let i = 1; (ssym >>= BigInt(1)) !== BigInt(0); i++) {
      if ((ssym & BigInt(1)) === BigInt(1)) {
        ret |= firstMoveSym[i];
      }
    }
    return ret;
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  static initMove(): void {
    moveCube[0]  = new CubieCube(15120, 0, 119750400, 0);
    moveCube[3]  = new CubieCube(21021, 1494, 323403417, 0);
    moveCube[6]  = new CubieCube(8064, 1236, 29441808, 550);
    moveCube[9]  = new CubieCube(9, 0, 5880, 0);
    moveCube[12] = new CubieCube(1230, 412, 2949660, 0);
    moveCube[15] = new CubieCube(224, 137, 328552, 137);
    for (let a = 0; a < 18; a += 3) {
      for (let p = 0; p < 2; p++) {
        moveCube[a + p + 1] = new CubieCube();
        CubieCube.EdgeMult(moveCube[a + p], moveCube[a], moveCube[a + p + 1]);
        CubieCube.CornMult(moveCube[a + p], moveCube[a], moveCube[a + p + 1]);
      }
    }
  }

  static initSym(): void {
    const c = new CubieCube();
    const d = new CubieCube();

    const f2  = new CubieCube(28783, 0, 259268407, 0);
    const u4  = new CubieCube(15138, 0, 119765538, 7);
    const lr2 = new CubieCube(5167, 0, 83473207, 0);
    for (let i = 0; i < 8; i++) {
      lr2.ca[i] = int8(lr2.ca[i] | (3 << 3));
    }

    let cur = c;
    let nxt = d;
    for (let i = 0; i < 16; i++) {
      CubeSym[i] = cur.clone();
      CubieCube.CornMultFull(cur, u4, nxt);
      CubieCube.EdgeMult(cur, u4, nxt);
      [cur, nxt] = [nxt, cur];
      if (i % 4 === 3) {
        CubieCube.CornMultFull(cur, lr2, nxt);
        CubieCube.EdgeMult(cur, lr2, nxt);
        [cur, nxt] = [nxt, cur];
      }
      if (i % 8 === 7) {
        CubieCube.CornMultFull(cur, f2, nxt);
        CubieCube.EdgeMult(cur, f2, nxt);
        [cur, nxt] = [nxt, cur];
      }
    }

    const tmp = new CubieCube();
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        CubieCube.CornMultFull(CubeSym[i], CubeSym[j], tmp);
        for (let k = 0; k < 16; k++) {
          if (arraysEqual(CubeSym[k].ca, tmp.ca)) {
            SymMult[i][j]    = k;
            SymMultInv[k][j] = i;
            break;
          }
        }
      }
    }

    const tmp2 = new CubieCube();
    for (let j = 0; j < 18; j++) {
      for (let s = 0; s < 16; s++) {
        CubieCube.CornConjugate(moveCube[j], SymMultInv[0][s], tmp2);
        for (let m = 0; m < 18; m++) {
          if (arraysEqual(moveCube[m].ca, tmp2.ca)) {
            SymMove[s][j]             = m;
            SymMoveUD[s][std2ud[j]]   = std2ud[m];
            break;
          }
        }
        if (s % 2 === 0) {
          Sym8Move[j << 3 | s >> 1] = SymMove[s][j];
        }
      }
    }

    for (let i = 0; i < 18; i++) {
      moveCubeSym[i] = moveCube[i].selfSymmetry();
      let j = i;
      for (let s = 0; s < 48; s++) {
        if (SymMove[s % 16][j] < i) {
          firstMoveSym[s] |= 1 << i;
        }
        if (s % 16 === 15) {
          j = urfMove[2][j];
        }
      }
    }
  }

  static initSym2Raw(
    N_RAW: number,
    Sym2Raw: Uint16Array,
    Raw2Sym: Uint16Array,
    SymState: Uint16Array,
    coord: number,   // 0=flip, 1=twist, 2=eperm
  ): number {
    const c   = new CubieCube();
    const d   = new CubieCube();
    const sym_inc = coord >= 2 ? 1 : 2;
    const isEdge  = coord !== 1;
    let count = 0;
    let idx   = 0;

    for (let i = 0; i < N_RAW; i++) {
      if (Raw2Sym[i] !== 0) continue;
      if      (coord === 0) c.setFlip(i);
      else if (coord === 1) c.setTwist(i);
      else                  c.setEPerm(i);

      for (let s = 0; s < 16; s += sym_inc) {
        if (isEdge) CubieCube.EdgeConjugate(c, s, d);
        else        CubieCube.CornConjugate(c, s, d);

        if      (coord === 0) idx = d.getFlip();
        else if (coord === 1) idx = d.getTwist();
        else                  idx = d.getEPerm();

        if (coord === 0 && USE_TWIST_FLIP_PRUN) {
          FlipS2RF[(count << 3) | (s >> 1)] = idx;
        }
        if (idx === i) {
          SymState[count] |= 1 << (s / sym_inc);
        }
        const symIdx = ((count << 4) | s) / sym_inc | 0;
        Raw2Sym[idx] = symIdx;
      }
      Sym2Raw[count++] = i;
    }
    return count;
  }

  static initFlipSym2Raw(): void {
    SymStateFlip = new Uint16Array(N_FLIP_SYM);
    CubieCube.initSym2Raw(N_FLIP, FlipS2R, FlipR2S, SymStateFlip, 0);
  }

  static initTwistSym2Raw(): void {
    SymStateTwist = new Uint16Array(N_TWIST_SYM);
    CubieCube.initSym2Raw(N_TWIST, TwistS2R, TwistR2S, SymStateTwist, 1);
  }

  static initPermSym2Raw(): void {
    SymStatePerm = new Uint16Array(N_PERM_SYM);
    CubieCube.initSym2Raw(N_PERM, EPermS2R, EPermR2S, SymStatePerm, 2);

    const cc = new CubieCube();
    for (let i = 0; i < N_PERM_SYM; i++) {
      cc.setEPerm(EPermS2R[i]);
      Perm2CombP[i] = int8(
        getComb(cc.ea, 0, true) +
        (USE_COMBP_PRUN ? getNParity(EPermS2R[i], 8) * 70 : 0)
      );
      cc.invCubieCube();
      PermInvEdgeSym[i] = cc.getEPermSym();
    }
    for (let i = 0; i < N_MPERM; i++) {
      cc.setMPerm(i);
      cc.invCubieCube();
      MPermInv[i] = cc.getMPerm();
    }
  }
}

// ─── URF reference cubes (used by URFConjugate) ───────────────────────────────
export const urf1 = new CubieCube(2531, 1373, 67026819, 1367);
export const urf2 = new CubieCube(2089, 1906, 322752913, 2040);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clamp to signed byte range (like Java's (byte) cast) */
function int8(n: number): number {
  n = n & 0xff;
  return n > 127 ? n - 256 : n;
}

/** Typed-array equality */
function arraysEqual(a: Int8Array, b: Int8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ─── toCubieCube (from Util.java) — converts facelet byte array to CubieCube ─
export function toCubieCube(f: Uint8Array, ccRet: CubieCube): void {
  // Initialize to an invalid value (0xff) so unmatched pieces fail verification
  ccRet.ca.fill(-1);
  ccRet.ea.fill(-1);

  for (let i = 0; i < 8; i++) {
    let ori = 0;
    for (ori = 0; ori < 3; ori++) {
      const fc = f[cornerFacelet[i][ori]];
      if (fc === 0 || fc === 3) break; // U or D color
    }
    // If no U or D color found on this corner, ori will be 3 (invalid)
    if (ori < 3) {
      const col1 = f[cornerFacelet[i][(ori + 1) % 3]];
      const col2 = f[cornerFacelet[i][(ori + 2) % 3]];
      for (let j = 0; j < 8; j++) {
        if (
          col1 === (cornerFacelet[j][1] / 9 | 0) &&
          col2 === (cornerFacelet[j][2] / 9 | 0)
        ) {
          ccRet.ca[i] = int8((ori % 3 << 3) | j);
          break;
        }
      }
    }
  }
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      if (
        f[edgeFacelet[i][0]] === (edgeFacelet[j][0] / 9 | 0) &&
        f[edgeFacelet[i][1]] === (edgeFacelet[j][1] / 9 | 0)
      ) {
        ccRet.ea[i] = int8(j << 1);
        break;
      }
      if (
        f[edgeFacelet[i][0]] === (edgeFacelet[j][1] / 9 | 0) &&
        f[edgeFacelet[i][1]] === (edgeFacelet[j][0] / 9 | 0)
      ) {
        ccRet.ea[i] = int8((j << 1) | 1);
        break;
      }
    }
  }
}

/** toFaceCube: convert CubieCube → 54-char facelet string */
export function toFaceCube(cc: CubieCube): string {
  const f: string[] = 'UUUUUUUUURRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'.split('');
  for (let c = 0; c < 8; c++) {
    const j   = cc.ca[c] & 0x7;
    const ori = (cc.ca[c] >> 3) & 0x1f;
    for (let n = 0; n < 3; n++) {
      f[cornerFacelet[c][(n + ori) % 3]] = 'URFDLB'[cornerFacelet[j][n] / 9 | 0];
    }
  }
  for (let e = 0; e < 12; e++) {
    const j   = (cc.ea[e] >> 1) & 0x7f;
    const ori = cc.ea[e] & 1;
    for (let n = 0; n < 2; n++) {
      f[edgeFacelet[e][(n + ori) % 2]] = 'URFDLB'[edgeFacelet[j][n] / 9 | 0];
    }
  }
  return f.join('');
}

// ─── Static initialisation ────────────────────────────────────────────────────
CubieCube.initMove();
CubieCube.initSym();
