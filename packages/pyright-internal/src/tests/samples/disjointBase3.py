# This sample tests narrowing intersections with disjoint bases.

from typing import TypeVar
from typing_extensions import TypeIs, assert_never, disjoint_base  # pyright: ignore[reportMissingModuleSource]


def func1(size: list[int], short: int, long: int):
    requested = size if isinstance(size, int) else size[0]
    reveal_type(requested, expected_text="int")
    reveal_type(long * requested, expected_text="int")
    return int(long * requested / short)


def func2(padding: tuple[int, int], limit: int):
    py, px = (padding, padding) if isinstance(padding, int) else padding
    reveal_type(py, expected_text="int")
    reveal_type(2 * py, expected_text="int")
    return 0 <= 2 * py <= limit and 0 <= 2 * px <= limit


def func3(value: list[int] | tuple[int, int]):
    if isinstance(value, int):
        assert_never(value)
    else:
        reveal_type(value, expected_text="list[int] | tuple[int, int]")


def func4(value: int):
    if isinstance(value, list):
        assert_never(value)
    else:
        reveal_type(value, expected_text="int")


def func5(value: type[list[int]]):
    if issubclass(value, int):
        assert_never(value)
    else:
        reveal_type(value, expected_text="type[list[int]]")


class IntList(list[int]):
    pass


def func6(value: IntList):
    if isinstance(value, int):
        assert_never(value)


def is_int(value: object) -> TypeIs[int]:
    return isinstance(value, int)


def func7(value: list[int]):
    if is_int(value):
        assert_never(value)


T = TypeVar("T", bound=list[int])


def func8(value: T) -> T:
    if isinstance(value, int):
        assert_never(value)
    else:
        reveal_type(value, expected_text="list[int]*")
    return value


@disjoint_base
class Left:
    pass


@disjoint_base
class Right:
    pass


def func9(value: Left):
    if isinstance(value, Right):
        assert_never(value)
    else:
        reveal_type(value, expected_text="Left")


class SlottedLeft:
    __slots__ = ("left",)


class SlottedRight:
    __slots__ = ("right",)


def func10(value: SlottedLeft):
    if isinstance(value, SlottedRight):
        assert_never(value)


class LeftChild(Left):
    pass


class OtherLeftChild(Left):
    pass


def func11(value: LeftChild):
    if isinstance(value, OtherLeftChild):
        reveal_type(value, expected_text="<subclass of LeftChild and OtherLeftChild>")


class Mixin:
    pass


def func12(value: int):
    if isinstance(value, Mixin):
        reveal_type(value, expected_text="<subclass of int and Mixin>")


@disjoint_base
class DisjointLeftChild(Left):
    pass


def func13(value: LeftChild):
    if isinstance(value, DisjointLeftChild):
        reveal_type(value, expected_text="<subclass of LeftChild and DisjointLeftChild>")
