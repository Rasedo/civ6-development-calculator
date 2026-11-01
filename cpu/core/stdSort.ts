/**
 * THE GAME DLL'S std::sort (the MSVC STL's _Sort_unchecked, read at the unit
 * choice's 0x7976f0 with its partition 0x796f60, median guess 0x795f80 and
 * insertion sort 0x7963a0): a range over 32 elements is split by a pivot
 * range of equals (Tukey's ninther above 40 elements, else the median of
 * three), the smaller side sorted first, until 1.5 log2(N) divisions fall to
 * a heap sort; a range of 32 or fewer is insertion-sorted. It is NOT stable:
 * where the order the game walks is a std::sort's, equal elements land where
 * this puts them. `less(a, b)` is the comparator: a before b. Sorts in place.
 */
export function stdSort<T>(a: T[], less: (x: T, y: T) => boolean): T[] {
  sortRange(a, 0, a.length, a.length, less);
  return a;
}

const ISORT_MAX = 32;

function swap<T>(a: T[], i: number, j: number): void {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}

function sortRange<T>(a: T[], first: number, last: number, ideal: number, less: (x: T, y: T) => boolean): void {
  for (;;) {
    if (last - first <= ISORT_MAX) {
      if (last - first >= 2) insertionSort(a, first, last, less);
      return;
    }
    if (ideal <= 0) {
      makeHeap(a, first, last, less);
      sortHeap(a, first, last, less);
      return;
    }
    const [mf, ms] = partition(a, first, last, less);
    ideal = (ideal >> 1) + (ideal >> 2);
    if (mf - first < last - ms) {
      sortRange(a, first, mf, ideal, less);
      first = ms;
    } else {
      sortRange(a, ms, last, ideal, less);
      last = mf;
    }
  }
}

function insertionSort<T>(a: T[], first: number, last: number, less: (x: T, y: T) => boolean): void {
  for (let mid = first + 1; mid < last; mid++) {
    const val = a[mid];
    let hole = mid;
    if (less(val, a[first])) {
      for (let k = mid; k > first; k--) a[k] = a[k - 1];
      a[first] = val;
    } else {
      for (let prev = hole - 1; less(val, a[prev]); hole = prev, prev--) a[hole] = a[prev];
      a[hole] = val;
    }
  }
}

function med3<T>(a: T[], f: number, m: number, l: number, less: (x: T, y: T) => boolean): void {
  if (less(a[m], a[f])) swap(a, m, f);
  if (less(a[l], a[m])) {
    swap(a, l, m);
    if (less(a[m], a[f])) swap(a, m, f);
  }
}

function guessMedian<T>(a: T[], f: number, m: number, l: number, less: (x: T, y: T) => boolean): void {
  const count = l - f;
  if (count > 40) {
    const step = (count + 1) >> 3;
    const two = step << 1;
    med3(a, f, f + step, f + two, less);
    med3(a, m - step, m, m + step, less);
    med3(a, l - two, l - step, l, less);
    med3(a, f + step, m, l - step, less);
  } else {
    med3(a, f, m, l, less);
  }
}

function partition<T>(a: T[], first: number, last: number, less: (x: T, y: T) => boolean): [number, number] {
  const mid = first + ((last - first) >> 1);
  guessMedian(a, first, mid, last - 1, less);
  let pf = mid;
  let pl = pf + 1;
  while (first < pf && !less(a[pf - 1], a[pf]) && !less(a[pf], a[pf - 1])) pf--;
  while (pl < last && !less(a[pl], a[pf]) && !less(a[pf], a[pl])) pl++;
  let gf = pl;
  let gl = pf;
  for (;;) {
    for (; gf < last; gf++) {
      if (less(a[pf], a[gf])) continue;
      else if (less(a[gf], a[pf])) break;
      else if (pl !== gf) swap(a, pl++, gf);
      else pl++;
    }
    for (; first < gl; gl--) {
      if (less(a[gl - 1], a[pf])) continue;
      else if (less(a[pf], a[gl - 1])) break;
      else if (--pf !== gl - 1) swap(a, pf, gl - 1);
    }
    if (gl === first && gf === last) return [pf, pl];
    if (gl === first) {
      if (pl !== gf) swap(a, pf, pl);
      pl++;
      swap(a, pf, gf);
      pf++;
      gf++;
    } else if (gf === last) {
      if (--gl !== --pf) swap(a, gl, pf);
      swap(a, pf, --pl);
    } else {
      swap(a, gf, --gl);
      gf++;
    }
  }
}

function popHoleByIndex<T>(a: T[], first: number, hole: number, bottom: number, val: T, less: (x: T, y: T) => boolean): void {
  const top = hole;
  let idx = hole;
  const maxNonLeaf = (bottom - 1) >> 1;
  while (idx < maxNonLeaf) {
    idx = 2 * idx + 2;
    if (less(a[first + idx], a[first + idx - 1])) idx--;
    a[first + hole] = a[first + idx];
    hole = idx;
  }
  if (idx === maxNonLeaf && bottom % 2 === 0) {
    a[first + hole] = a[first + bottom - 1];
    hole = bottom - 1;
  }
  for (let i = (hole - 1) >> 1; top < hole && less(a[first + i], val); i = (hole - 1) >> 1) {
    a[first + hole] = a[first + i];
    hole = i;
  }
  a[first + hole] = val;
}

function makeHeap<T>(a: T[], first: number, last: number, less: (x: T, y: T) => boolean): void {
  const bottom = last - first;
  for (let hole = bottom >> 1; hole > 0;) {
    hole--;
    popHoleByIndex(a, first, hole, bottom, a[first + hole], less);
  }
}

function sortHeap<T>(a: T[], first: number, last: number, less: (x: T, y: T) => boolean): void {
  for (; last - first >= 2; last--) {
    const val = a[last - 1];
    a[last - 1] = a[first];
    popHoleByIndex(a, first, 0, last - 1 - first, val, less);
  }
}
