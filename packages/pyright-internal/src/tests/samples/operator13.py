# This sample tests reflected numeric operator precedence for subclasses.

from enum import IntFlag, auto
from typing import TypeVar, overload


class Flags(IntFlag):
    A = auto()
    B = auto()


def func1(value: int, flag: Flags):
    reveal_type(int() & Flags.A, expected_text="Flags")
    reveal_type(0 | Flags.A, expected_text="Flags")
    reveal_type(0 ^ Flags.A, expected_text="Flags")
    reveal_type(value & flag, expected_text="Flags")
    reveal_type(value | flag, expected_text="Flags")
    reveal_type(value ^ flag, expected_text="Flags")
    reveal_type(flag & value, expected_text="Flags")
    reveal_type(flag | value, expected_text="Flags")
    reveal_type(flag ^ value, expected_text="Flags")
    reveal_type(flag & Flags.B, expected_text="Flags")
    reveal_type(value + flag, expected_text="int")
    reveal_type(value << flag, expected_text="int")
    reveal_type(1 & 3, expected_text="Literal[1]")
    reveal_type(value & True, expected_text="int")

    value &= flag
    reveal_type(value, expected_text="Flags")


T = TypeVar("T", bound=int)


def func2(value: T, flag: Flags) -> T:
    reveal_type(value & flag, expected_text="Flags")
    return value


def func3(value: int, flag: Flags | None):
    if flag is not None:
        reveal_type(value & flag, expected_text="Flags")
    else:
        reveal_type(flag, expected_text="None")


class Base:
    def __add__(self, other: "Base") -> object:
        return 0

    def __radd__(self, other: "Base") -> str:
        return "base"


class Derived(Base):
    def __radd__(self, other: Base) -> str:
        return "derived"


class Inherited(Base):
    pass


class Leaf(Derived):
    pass


class Aliased(Base):
    __radd__ = Base.__radd__


reveal_type(Base() + Derived(), expected_text="str")
reveal_type(Base() + Leaf(), expected_text="str")
reveal_type(Base() + Inherited(), expected_text="object")
reveal_type(Base() + Aliased(), expected_text="object")
reveal_type(Derived() + Derived(), expected_text="object")
reveal_type(Derived() + Base(), expected_text="object")


def func4(left: Base, right: Derived | Inherited):
    reveal_type(left + right, expected_text="str | object")


class ForwardOnly:
    def __add__(self, other: "ForwardOnly") -> object:
        return 0


class NewReflected(ForwardOnly):
    def __radd__(self, other: ForwardOnly) -> str:
        return "derived"


class UnsupportedReflected(ForwardOnly):
    def __radd__(self, other: int) -> str:
        return "derived"


reveal_type(ForwardOnly() + NewReflected(), expected_text="str")
reveal_type(ForwardOnly() + UnsupportedReflected(), expected_text="object")

# This should generate an error because neither operand supports the operation.
_ = ForwardOnly() + 1


class OverloadedBase:
    def __sub__(self, other: "OverloadedBase") -> object:
        return 0

    @overload
    def __rsub__(self, other: "OverloadedBase") -> str: ...
    @overload
    def __rsub__(self, other: int) -> int: ...
    def __rsub__(self, other: "OverloadedBase | int") -> str | int:
        return 0


class OverloadedDerived(OverloadedBase):
    @overload
    def __rsub__(self, other: OverloadedBase) -> str: ...
    @overload
    def __rsub__(self, other: int) -> int: ...
    def __rsub__(self, other: OverloadedBase | int) -> str | int:
        return 0


class OverloadedAlias(OverloadedBase):
    __rsub__ = OverloadedBase.__rsub__


reveal_type(OverloadedBase() - OverloadedDerived(), expected_text="str")
reveal_type(OverloadedBase() - OverloadedAlias(), expected_text="object")


class Meta(type):
    def __add__(self, other: "Meta") -> object:
        return 0

    def __radd__(self, other: "Meta") -> str:
        return "base"


class DerivedMeta(Meta):
    def __radd__(self, other: Meta) -> str:
        return "derived"


class Class1(metaclass=Meta):
    pass


class Class2(metaclass=DerivedMeta):
    pass


reveal_type(Class1 + Class2, expected_text="str")
reveal_type(Class2 + Class1, expected_text="object")


class ReflectedMixin:
    def __radd__(self, other: Base) -> str:
        return "mixin"


class Mixed(ReflectedMixin, Base):
    pass


reveal_type(Base() + Mixed(), expected_text="str")


def func5(left: Base, right: ReflectedMixin):
    if isinstance(right, Base):
        reveal_type(right, expected_text="<subclass of ReflectedMixin and Base>")
        reveal_type(left + right, expected_text="str")
