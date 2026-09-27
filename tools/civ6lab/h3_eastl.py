"""H-3: EASTL's eastl::sort (introsort), element for element, for the tie
orders of the game's C++ sorts. The GameCore DLL's string pool next to
Region_Builder.cpp carries EASTL's comparison asserts: get_partition's
"!(pivotCopy < *first)" / "!(*last < pivotCopy)", insertion_sort's
"!(*iCurrent < temp)", insertion_sort_simple's "!(*prev < value)".

    from h3_eastl import eastl_sort
    eastl_sort(items, lt)      # in place; lt(a, b) is the element's operator<

EASTL (sort.h): quick_sort_impl while n > kQuickSortLimit (28) and the
recursion budget 2*floor(log2 n) lasts: pivot = median(first, middle,
last - 1) (a copy), get_partition (Hoare, unguarded), recurse on the right
part, loop on the left; then insertion_sort on the first 28 and
insertion_sort_simple (unguarded) on the rest, or insertion_sort on all
when n <= 28. A spent budget falls back to partial_sort (heap sort) on the
range.
"""
from __future__ import annotations

K_QUICKSORT_LIMIT = 28


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
        if lt(a, c):
            return c
        return a
    if lt(a, c):
        return a
    if lt(b, c):
        return c
    return b


def _get_partition(t: list, first: int, last: int, pivot, lt) -> int:
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


def _insertion_sort(t: list, first: int, last: int, lt) -> None:
    if first == last:
        return
    for i in range(first + 1, last):
        temp = t[i]
        j = i
        while j != first and lt(temp, t[j - 1]):
            t[j] = t[j - 1]
            j -= 1
        t[j] = temp


def _insertion_sort_simple(t: list, first: int, last: int, lt) -> None:
    for i in range(first, last):
        value = t[i]
        j = i
        while lt(value, t[j - 1]):
            t[j] = t[j - 1]
            j -= 1
        t[j] = value


def _adjust_heap(t, first, top, hole, length, value, lt):
    # EASTL adjust_heap then promote_heap
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


def _partial_sort(t: list, first: int, middle: int, last: int, lt) -> None:
    # make_heap(first, middle), sift the rest, sort_heap
    n = middle - first
    if n >= 2:
        parent = (n - 2) >> 1
        while True:
            _adjust_heap(t, first, parent, parent, n, t[first + parent], lt)
            if parent == 0:
                break
            parent -= 1
    for i in range(middle, last):
        if lt(t[i], t[first]):
            temp = t[i]
            t[i] = t[first]
            _adjust_heap(t, first, 0, 0, n, temp, lt)
    # sort_heap
    end = middle
    while end - first > 1:
        end -= 1
        temp = t[end]
        t[end] = t[first]
        _adjust_heap(t, first, 0, 0, end - first, temp, lt)


def _quick_sort_impl(t: list, first: int, last: int, rec: int, lt) -> None:
    while last - first > K_QUICKSORT_LIMIT and rec > 0:
        pivot = _median(t[first], t[first + (last - first) // 2], t[last - 1], lt)
        pos = _get_partition(t, first, last, pivot, lt)
        rec -= 1
        _quick_sort_impl(t, pos, last, rec, lt)
        last = pos
    if rec == 0:
        _partial_sort(t, first, last, last, lt)


def eastl_sort(t: list, lt) -> None:
    n = len(t)
    if n == 0:
        return
    _quick_sort_impl(t, 0, n, 2 * _log2(n), lt)
    if n > K_QUICKSORT_LIMIT:
        _insertion_sort(t, 0, K_QUICKSORT_LIMIT, lt)
        _insertion_sort_simple(t, K_QUICKSORT_LIMIT, n, lt)
    else:
        _insertion_sort(t, 0, n, lt)
