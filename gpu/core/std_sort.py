"""THE GAME DLL'S std::sort — `stdSort`'s twin (cpu/core/stdSort.ts): the
MSVC STL's _Sort_unchecked (read at the unit choice's 0x7976f0, partition
0x796f60, median guess 0x795f80, insertion sort 0x7963a0). A range over 32
elements is split by a pivot range of equals (Tukey's ninther above 40
elements, else the median of three), the smaller side sorted first, until
1.5 log2(N) divisions fall to a heap sort; 32 or fewer are insertion-sorted.
Not stable: equal elements land where this puts them. Host-side, over a
Python list, in place; `less(a, b)` is the comparator (a before b)."""
from __future__ import annotations

from typing import Callable, List, TypeVar

T = TypeVar("T")

_ISORT_MAX = 32


def std_sort(a: List[T], less: Callable[[T, T], bool]) -> List[T]:
    _sort_range(a, 0, len(a), len(a), less)
    return a


def _sort_range(a, first, last, ideal, less):
    while True:
        if last - first <= _ISORT_MAX:
            if last - first >= 2:
                _insertion(a, first, last, less)
            return
        if ideal <= 0:
            _make_heap(a, first, last, less)
            _sort_heap(a, first, last, less)
            return
        mf, ms = _partition(a, first, last, less)
        ideal = (ideal >> 1) + (ideal >> 2)
        if mf - first < last - ms:
            _sort_range(a, first, mf, ideal, less)
            first = ms
        else:
            _sort_range(a, ms, last, ideal, less)
            last = mf


def _insertion(a, first, last, less):
    for mid in range(first + 1, last):
        val = a[mid]
        if less(val, a[first]):
            a[first + 1:mid + 1] = a[first:mid]
            a[first] = val
        else:
            hole = mid
            prev = hole - 1
            while less(val, a[prev]):
                a[hole] = a[prev]
                hole = prev
                prev -= 1
            a[hole] = val


def _med3(a, f, m, l, less):
    if less(a[m], a[f]):
        a[m], a[f] = a[f], a[m]
    if less(a[l], a[m]):
        a[l], a[m] = a[m], a[l]
        if less(a[m], a[f]):
            a[m], a[f] = a[f], a[m]


def _guess_median(a, f, m, l, less):
    count = l - f
    if count > 40:
        step = (count + 1) >> 3
        two = step << 1
        _med3(a, f, f + step, f + two, less)
        _med3(a, m - step, m, m + step, less)
        _med3(a, l - two, l - step, l, less)
        _med3(a, f + step, m, l - step, less)
    else:
        _med3(a, f, m, l, less)


def _partition(a, first, last, less):
    mid = first + ((last - first) >> 1)
    _guess_median(a, first, mid, last - 1, less)
    pf = mid
    pl = pf + 1
    while first < pf and not less(a[pf - 1], a[pf]) and not less(a[pf], a[pf - 1]):
        pf -= 1
    while pl < last and not less(a[pl], a[pf]) and not less(a[pf], a[pl]):
        pl += 1
    gf, gl = pl, pf
    while True:
        while gf < last:
            if less(a[pf], a[gf]):
                pass
            elif less(a[gf], a[pf]):
                break
            elif pl != gf:
                a[pl], a[gf] = a[gf], a[pl]
                pl += 1
            else:
                pl += 1
            gf += 1
        while first < gl:
            if less(a[gl - 1], a[pf]):
                pass
            elif less(a[pf], a[gl - 1]):
                break
            else:
                pf -= 1
                if pf != gl - 1:
                    a[pf], a[gl - 1] = a[gl - 1], a[pf]
            gl -= 1
        if gl == first and gf == last:
            return pf, pl
        if gl == first:
            if pl != gf:
                a[pf], a[pl] = a[pl], a[pf]
            pl += 1
            a[pf], a[gf] = a[gf], a[pf]
            pf += 1
            gf += 1
        elif gf == last:
            gl -= 1
            pf -= 1
            if gl != pf:
                a[gl], a[pf] = a[pf], a[gl]
            pl -= 1
            a[pf], a[pl] = a[pl], a[pf]
        else:
            gl -= 1
            a[gf], a[gl] = a[gl], a[gf]
            gf += 1


def _pop_hole(a, first, hole, bottom, val, less):
    top = hole
    idx = hole
    max_non_leaf = (bottom - 1) >> 1
    while idx < max_non_leaf:
        idx = 2 * idx + 2
        if less(a[first + idx], a[first + idx - 1]):
            idx -= 1
        a[first + hole] = a[first + idx]
        hole = idx
    if idx == max_non_leaf and bottom % 2 == 0:
        a[first + hole] = a[first + bottom - 1]
        hole = bottom - 1
    i = (hole - 1) >> 1
    while top < hole and less(a[first + i], val):
        a[first + hole] = a[first + i]
        hole = i
        i = (hole - 1) >> 1
    a[first + hole] = val


def _make_heap(a, first, last, less):
    bottom = last - first
    hole = bottom >> 1
    while hole > 0:
        hole -= 1
        _pop_hole(a, first, hole, bottom, a[first + hole], less)


def _sort_heap(a, first, last, less):
    while last - first >= 2:
        val = a[last - 1]
        a[last - 1] = a[first]
        _pop_hole(a, first, 0, last - 1 - first, val, less)
        last -= 1
