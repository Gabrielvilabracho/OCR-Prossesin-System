"""LangGraph state reducer operators.

These functions are used as reducers in Annotated type aliases for
accumulator fields in InvoiceState.
"""

from typing import TypeVar

T = TypeVar("T")


def add_list(a: list[T], b: list[T]) -> list[T]:
    """Merge two lists for LangGraph state accumulators.

    Used as reducer in: Annotated[list[T], add_list]
    """
    return a + b
