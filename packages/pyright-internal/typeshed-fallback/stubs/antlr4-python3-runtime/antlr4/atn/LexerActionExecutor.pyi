from _typeshed import Incomplete

from antlr4.atn.LexerAction import LexerAction as LexerAction, LexerIndexedCustomAction as LexerIndexedCustomAction
from antlr4.InputStream import InputStream as InputStream

class LexerActionExecutor:
    lexerActions: Incomplete
    hashCode: Incomplete
    def __init__(self, lexerActions: list[LexerAction] = []) -> None: ...
    @staticmethod
    def append(lexerActionExecutor: LexerActionExecutor, lexerAction: LexerAction): ...
    def fixOffsetBeforeMatch(self, offset: int): ...
    def execute(self, lexer, input: InputStream, startIndex: int): ...
    def __hash__(self): ...
    def __eq__(self, other): ...