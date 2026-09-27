"""eastl::sort (introsort) element for element: the tie order of the
GameCore DLL's own sorts (tools/civ6lab/h3_eastl.py).

quick_sort_impl while n > 28 and the recursion budget 2 floor(log2 n)
lasts: pivot = the median of first, middle and last - 1 (a copy), a Hoare
partition, recurse on the right part, loop on the left; then insertion sort
on the first 28 and unguarded insertion sort on the rest, or insertion sort
on all when n <= 28. A spent budget falls back to heap sort on the range.
"""
from __future__ import annotations

LIMIT = 28


def _log2(n: int) -> int:
    k = 0
    while n > 1:
        n >>= 1
        k += 1
    return k


def _median(a, b, c, lt):
    if lt(a, b):
        if lt(b, c):
            return b
        return c if lt(a, c) else a
    if lt(a, c):
        return a
    return c if lt(b, c) else b


def _partition(t: list, first: int, last: int, pivot, lt) -> int:
    while True:
        while lt(t[first], pivot):
            first += 1
        last -= 1
        while lt(pivot, t[last]):
            last -= 1
        if first >= last:
            return first
        t[first], t[last] = t[last], t[first]
        first += 1


def _insertion(t: list, first: int, last: int, lt) -> None:
    for i in range(first + 1, last):
        temp = t[i]
        j = i
        while j != first and lt(temp, t[j - 1]):
            t[j] = t[j - 1]
            j -= 1
        t[j] = temp


def _insertion_unguarded(t: list, first: int, last: int, lt) -> None:
    for i in range(first, last):
        value = t[i]
        j = i
        while lt(value, t[j - 1]):
            t[j] = t[j - 1]
            j -= 1
        t[j] = value


def _adjust_heap(t, first, top, hole, length, value, lt):
    child = 2 * hole + 2
    while child < length:
        if lt(t[first + child], t[first + child - 1]):
            child -= 1
        t[first + hole] = t[first + child]
        hole = child
        child = 2 * child + 2
    if child == length:
        t[first + hole] = t[first + child - 1]
        hole = child - 1
    parent = (hole - 1) >> 1
    while hole > top and lt(t[first + parent], value):
        t[first + hole] = t[first + parent]
        hole = parent
        parent = (hole - 1) >> 1
    t[first + hole] = value


def _heap_sort(t: list, first: int, last: int, lt) -> None:
    n = last - first
    if n >= 2:
        parent = (n - 2) >> 1
        while True:
            _adjust_heap(t, first, parent, parent, n, t[first + parent], lt)
            if parent == 0:
                break
            parent -= 1
    end = last
    while end - first > 1:
        end -= 1
        temp = t[end]
        t[end] = t[first]
        _adjust_heap(t, first, 0, 0, end - first, temp, lt)


def _quick(t: list, first: int, last: int, budget: int, lt) -> None:
    while last - first > LIMIT and budget > 0:
        pivot = _median(t[first], t[first + (last - first) // 2], t[last - 1], lt)
        pos = _partition(t, first, last, pivot, lt)
        budget -= 1
        _quick(t, pos, last, budget, lt)
        last = pos
    if budget == 0:
        _heap_sort(t, first, last, lt)


def sort(t: list, lt) -> None:
    """sort t in place; lt(a, b) is the element's operator<"""
    n = len(t)
    if n == 0:
        return
    _quick(t, 0, n, 2 * _log2(n), lt)
    if n > LIMIT:
        _insertion(t, 0, LIMIT, lt)
        _insertion_unguarded(t, LIMIT, n, lt)
    else:
        _insertion(t, 0, n, lt)
