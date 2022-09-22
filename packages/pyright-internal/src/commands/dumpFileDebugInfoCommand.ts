/*
 * dumpFileDebugInfoCommand.ts
 * Copyright (c) Microsoft Corporation.
 *
 * Dump various token/node/type info
 */

import { CancellationToken, ExecuteCommandParams } from 'vscode-languageserver';

import { findNodeByOffset, printParseNodeType } from '../analyzer/parseTreeUtils';
import { ParseTreeWalker } from '../analyzer/parseTreeWalker';
import { TypeEvaluator } from '../analyzer/typeEvaluatorTypes';
import {
    ClassType,
    ClassTypeFlags,
    FunctionType,
    FunctionTypeFlags,
    ParamSpecEntry,
    TypeBase,
    TypeCategory,
    TypeFlags,
    TypeVarDetails,
    TypeVarType,
    Variance,
} from '../analyzer/types';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { isNumber, isString } from '../common/core';
import { convertOffsetsToRange } from '../common/positionUtils';
import { TextRange } from '../common/textRange';
import { TextRangeCollection } from '../common/textRangeCollection';
import { LanguageServerInterface } from '../languageServerBase';
import {
    ArgumentCategory,
    ArgumentNode,
    AssertNode,
    AssignmentExpressionNode,
    AssignmentNode,
    AugmentedAssignmentNode,
    AwaitNode,
    BinaryOperationNode,
    BreakNode,
    CallNode,
    ClassNode,
    ConstantNode,
    ContinueNode,
    DecoratorNode,
    DelNode,
    DictionaryExpandEntryNode,
    DictionaryKeyEntryNode,
    DictionaryNode,
    EllipsisNode,
    ErrorExpressionCategory,
    ErrorNode,
    ExceptNode,
    ExpressionNode,
    FormatStringNode,
    ForNode,
    FunctionAnnotationNode,
    FunctionNode,
    GlobalNode,
    IfNode,
    ImportAsNode,
    ImportFromAsNode,
    ImportFromNode,
    ImportNode,
    IndexNode,
    isExpressionNode,
    LambdaNode,
    ListComprehensionForNode,
    ListComprehensionIfNode,
    ListComprehensionNode,
    ListNode,
    MemberAccessNode,
    ModuleNameNode,
    ModuleNode,
    NameNode,
    NonlocalNode,
    NumberNode,
    ParameterCategory,
    ParameterNode,
    ParseNode,
    ParseNodeType,
    PassNode,
    RaiseNode,
    ReturnNode,
    SetNode,
    SliceNode,
    StatementListNode,
    StringListNode,
    StringNode,
    SuiteNode,
    TernaryNode,
    TryNode,
    TupleNode,
    TypeAnnotationNode,
    UnaryOperationNode,
    UnpackNode,
    WhileNode,
    WithItemNode,
    WithNode,
    YieldFromNode,
    YieldNode,
} from '../parser/parseNodes';
import { ParseResults } from '../parser/parser';
import { KeywordType, NewLineType, OperatorType, StringTokenFlags, Token, TokenType } from '../parser/tokenizerTypes';
import { ServerCommand } from './commandController';

export class DumpFileDebugInfoCommand implements ServerCommand {
    constructor(private _ls: LanguageServerInterface) {}

    async execute(params: ExecuteCommandParams, token: CancellationToken): Promise<any> {
        throwIfCancellationRequested(token);

        if (!params.arguments || params.arguments.length < 2) {
            return [];
        }

        const filePath = params.arguments[0] as string;
        const kind = params.arguments[1];

        const workspace = await this._ls.getWorkspaceForFile(filePath);
        const parseResults = workspace.serviceInstance.getParseResult(filePath);
        if (!parseResults) {
            return [];
        }

        this._ls.console.info(`* Dump debug info for '${filePath}'`);

        switch (kind) {
            case 'tokens': {
                this._ls.console.info(`* Token info (${parseResults.tokenizerOutput.tokens.count} tokens)`);

                for (let i = 0; i < parseResults.tokenizerOutput.tokens.count; i++) {
                    const token = parseResults.tokenizerOutput.tokens.getItemAt(i);
                    this._ls.console.info(`[${i}] ${getTokenString(token, parseResults.tokenizerOutput.lines)}`);
                }
                break;
            }
            case 'nodes': {
                this._ls.console.info(`* Node info`);

                const dumper = new TreeDumper(parseResults.tokenizerOutput.lines);
                dumper.walk(parseResults.parseTree);

                this._ls.console.info(dumper.output);
                break;
            }
            case 'types': {
                const evaluator = workspace.serviceInstance.getEvaluator();
                const start = params.arguments[2] as number;
                const end = params.arguments[3] as number;
                if (!evaluator || !start || !end) {
                    return [];
                }

                this._ls.console.info(`* Type info`);
                this._ls.console.info(`${getTypeEvaluatorString(evaluator, parseResults, start, end)}`);
            }
        }
    }
}

function getTypeEvaluatorString(evaluator: TypeEvaluator, results: ParseResults, start: number, end: number) {
    const dumper = new TreeDumper(results.tokenizerOutput.lines);
    const node = findNodeByOffset(results.parseTree, start) ?? findNodeByOffset(results.parseTree, end);
    if (!node) {
        return 'N/A';
    }

    const set = new Set();

    if (node.nodeType === ParseNodeType.Name) {
        switch (node.parent?.nodeType) {
            case ParseNodeType.Class: {
                const result = evaluator.getTypeOfClass(node.parent as ClassNode);
                if (!result) {
                    return 'N/A';
                }

                return JSON.stringify(result, replacer, 2);
            }
            case ParseNodeType.Function: {
                const result = evaluator.getTypeOfFunction(node.parent as FunctionNode);
                if (!result) {
                    return 'N/A';
                }

                return JSON.stringify(result, replacer, 2);
            }
        }
    }

    const range = TextRange.fromBounds(start, end);
    const expr = getExpressionNodeWithRange(node, range);
    if (!expr) {
        return 'N/A';
    }

    const sb = `Expression node found at ${getTextSpanString(
        expr,
        results.tokenizerOutput.lines
    )} from the given span ${getTextSpanString(range, results.tokenizerOutput.lines)}\r\n`;

    const result = evaluator.getType(expr);
    if (!result) {
        return sb + 'No result';
    }

    return sb + JSON.stringify(result, replacer, 2);

    function getExpressionNodeWithRange(node: ParseNode, range: TextRange): ExpressionNode | undefined {
        // find best expression node that contains both start and end
        let current: ParseNode | undefined = node;
        while (current && !TextRange.containsRange(current, range)) {
            current = current.parent;
        }

        if (!current) {
            return undefined;
        }

        while (!isExpressionNode(current!)) {
            current = current!.parent;
        }

        return current;
    }

    function replacer(this: any, key: string, value: any) {
        if (value === undefined) {
            return undefined;
        }

        if (!isNumber(value) && !isString(value)) {
            if (set.has(value)) {
                if (isClassType(value)) {
                    return `<cycle> class '${value.details.fullName}' typeSourceId:${value.details.typeSourceId}`;
                }

                if (isFunctionType(value)) {
                    return `<cycle> function '${value.details.fullName}' parameter count:${value.details.parameters.length}`;
                }

                if (isTypeVarType(value)) {
                    return `<cycle> function '${value.details.name}' scope id:${value.nameWithScope}`;
                }

                return undefined;
            } else {
                set.add(value);
            }
        }

        if (isTypeBase(this) && key === 'category') {
            return getTypeCategoryString(value, this);
        }

        if (isTypeBase(this) && key === 'flags') {
            return getTypeFlagsString(value);
        }

        if (isClassDetail(this) && key === 'flags') {
            return getClassTypeFlagsString(value);
        }

        if (isFunctionDetail(this) && key === 'flags') {
            return getFunctionTypeFlagsString(value);
        }

        if (isTypeVarDetails(this) && key === 'variance') {
            return getVarianceString(value);
        }

        if (isParamSpecEntry(this) && key === 'category') {
            return getParameterCategoryString(value);
        }

        if (value.nodeType && value.id) {
            dumper.visitNode(value as ParseNode);

            const output = dumper.output;
            dumper.reset();
            return output;
        }

        return value;
    }

    function isTypeBase(type: any): boolean {
        return type.category && type.flags;
    }

    function isClassType(type: any): type is ClassType {
        return isTypeBase(type) && type.details && isClassDetail(type.details);
    }

    function isClassDetail(type: any): boolean {
        return (
            type.name !== undefined && type.fullName !== undefined && type.moduleName !== undefined && type.baseClasses
        );
    }

    function isFunctionType(type: any): type is FunctionType {
        return isTypeBase(type) && type.details && isFunctionDetail(type.details);
    }

    function isFunctionDetail(type: any): boolean {
        return (
            type.name !== undefined && type.fullName !== undefined && type.moduleName !== undefined && type.parameters
        );
    }

    function isTypeVarType(type: any): type is TypeVarType {
        return isTypeBase(type) && type.details && isTypeVarDetails(type.details);
    }

    function isTypeVarDetails(type: any): type is TypeVarDetails {
        return type.name !== undefined && type.constraints && type.variance !== undefined;
    }

    function isParamSpecEntry(type: any): type is ParamSpecEntry {
        return type.category && type.type;
    }
}

function getVarianceString(type: Variance) {
    switch (type) {
        case Variance.Invariant:
            return 'Invariant';
        case Variance.Covariant:
            return 'Covariant';
        case Variance.Contravariant:
            return 'Contravariant';
        default:
            return `Unknown Value!! (${type})`;
    }
}

function getFunctionTypeFlagsString(flags: FunctionTypeFlags) {
    const str = [];

    if (flags & FunctionTypeFlags.ConstructorMethod) {
        str.push('ConstructorMethod');
    }

    if (flags & FunctionTypeFlags.ClassMethod) {
        str.push('ClassMethod');
    }

    if (flags & FunctionTypeFlags.StaticMethod) {
        str.push('StaticMethod');
    }

    if (flags & FunctionTypeFlags.AbstractMethod) {
        str.push('AbstractMethod');
    }

    if (flags & FunctionTypeFlags.Generator) {
        str.push('Generator');
    }

    if (flags & FunctionTypeFlags.DisableDefaultChecks) {
        str.push('DisableDefaultChecks');
    }

    if (flags & FunctionTypeFlags.SynthesizedMethod) {
        str.push('SynthesizedMethod');
    }

    if (flags & FunctionTypeFlags.SkipConstructorCheck) {
        str.push('SkipConstructorCheck');
    }

    if (flags & FunctionTypeFlags.Overloaded) {
        str.push('Overloaded');
    }

    if (flags & FunctionTypeFlags.Async) {
        str.push('Async');
    }

    if (flags & FunctionTypeFlags.WrapReturnTypeInAwait) {
        str.push('WrapReturnTypeInAwait');
    }

    if (flags & FunctionTypeFlags.StubDefinition) {
        str.push('StubDefinition');
    }

    if (flags & FunctionTypeFlags.Final) {
        str.push('Final');
    }

    if (flags & FunctionTypeFlags.PyTypedDefinition) {
        str.push('PyTypedDefinition');
    }

    if (flags & FunctionTypeFlags.Final) {
        str.push('Final');
    }

    if (flags & FunctionTypeFlags.UnannotatedParams) {
        str.push('UnannotatedParams');
    }

    if (flags & FunctionTypeFlags.SkipArgsKwargsCompatibilityCheck) {
        str.push('SkipArgsKwargsCompatibilityCheck');
    }

    if (flags & FunctionTypeFlags.ParamSpecValue) {
        str.push('ParamSpecValue');
    }

    if (str.length === 0) return 'None';

    return str.join(',');
}

function getClassTypeFlagsString(flags: ClassTypeFlags) {
    const str = [];

    if (flags & ClassTypeFlags.BuiltInClass) {
        str.push('BuiltInClass');
    }

    if (flags & ClassTypeFlags.SpecialBuiltIn) {
        str.push('SpecialBuiltIn');
    }

    if (flags & ClassTypeFlags.DataClass) {
        str.push('DataClass');
    }

    if (flags & ClassTypeFlags.FrozenDataClass) {
        str.push('FrozenDataClass');
    }

    if (flags & ClassTypeFlags.SkipSynthesizedDataClassInit) {
        str.push('SkipSynthesizedDataClassInit');
    }

    if (flags & ClassTypeFlags.SkipSynthesizedDataClassEq) {
        str.push('SkipSynthesizedDataClassEq');
    }

    if (flags & ClassTypeFlags.SynthesizedDataClassOrder) {
        str.push('SynthesizedDataClassOrder');
    }

    if (flags & ClassTypeFlags.TypedDictClass) {
        str.push('TypedDictClass');
    }

    if (flags & ClassTypeFlags.CanOmitDictValues) {
        str.push('CanOmitDictValues');
    }

    if (flags & ClassTypeFlags.SupportsAbstractMethods) {
        str.push('SupportsAbstractMethods');
    }

    if (flags & ClassTypeFlags.PropertyClass) {
        str.push('PropertyClass');
    }

    if (flags & ClassTypeFlags.Final) {
        str.push('Final');
    }

    if (flags & ClassTypeFlags.ProtocolClass) {
        str.push('ProtocolClass');
    }

    if (flags & ClassTypeFlags.PseudoGenericClass) {
        str.push('PseudoGenericClass');
    }

    if (flags & ClassTypeFlags.RuntimeCheckable) {
        str.push('RuntimeCheckable');
    }

    if (flags & ClassTypeFlags.TypingExtensionClass) {
        str.push('TypingExtensionClass');
    }

    if (flags & ClassTypeFlags.PartiallyEvaluated) {
        str.push('PartiallyEvaluated ');
    }

    if (flags & ClassTypeFlags.HasCustomClassGetItem) {
        str.push('HasCustomClassGetItem');
    }

    if (flags & ClassTypeFlags.TupleClass) {
        str.push('TupleClass');
    }

    if (flags & ClassTypeFlags.EnumClass) {
        str.push('EnumClass');
    }

    if (flags & ClassTypeFlags.DataClassKeywordOnlyParams) {
        str.push('DataClassKeywordOnlyParams');
    }

    if (flags & ClassTypeFlags.ClassProperty) {
        str.push('ClassProperty');
    }

    if (flags & ClassTypeFlags.DefinedInStub) {
        str.push('DefinedInStub');
    }

    if (flags & ClassTypeFlags.ReadOnlyInstanceVariables) {
        str.push('ReadOnlyInstanceVariables');
    }

    if (flags & ClassTypeFlags.GenerateDataClassSlots) {
        str.push('GenerateDataClassSlots');
    }

    if (flags & ClassTypeFlags.SynthesizeDataClassUnsafeHash) {
        str.push('SynthesizeDataClassUnsafeHash');
    }

    if (str.length === 0) return 'None';

    return str.join(',');
}

function getTypeFlagsString(flags: TypeFlags) {
    const str = [];

    if (flags & TypeFlags.Instantiable) {
        str.push('Instantiable');
    }

    if (flags & TypeFlags.Instance) {
        str.push('Instance');
    }

    if (str.length === 0) return 'None';

    return str.join(',');
}

function getTypeCategoryString(typeCategory: TypeCategory, type: any) {
    switch (typeCategory) {
        case TypeCategory.Unbound:
            return 'Unbound';
        case TypeCategory.Unknown:
            return 'Unknown';
        case TypeCategory.Any:
            return 'Any';
        case TypeCategory.None:
            return 'None';
        case TypeCategory.Never:
            return 'Never';
        case TypeCategory.Function:
            return 'Function';
        case TypeCategory.OverloadedFunction:
            return 'OverloadedFunction';
        case TypeCategory.Class:
            if (TypeBase.isInstantiable(type)) {
                return 'Class';
            } else {
                return 'Object';
            }
        case TypeCategory.Module:
            return 'Module';
        case TypeCategory.Union:
            return 'Union';
        case TypeCategory.TypeVar:
            return 'TypeVar';
        default:
            return `Unknown Value!! (${typeCategory})`;
    }
}

class TreeDumper extends ParseTreeWalker {
    private _indentation = '';
    private _output = '';

    constructor(private _lines: TextRangeCollection<TextRange>) {
        super();
    }

    get output(): string {
        return this._output;
    }

    override walk(node: ParseNode): void {
        const childrenToWalk = this.visitNode(node);
        if (childrenToWalk.length > 0) {
            this._indentation += '  ';
            this.walkMultiple(childrenToWalk);
            this._indentation = this._indentation.substr(0, this._indentation.length - 2);
        }
    }

    private _log(value: string) {
        this._output += `${this._indentation}${value}\r\n`;
    }

    private _getPrefix(node: ParseNode) {
        return `[${node.id}] (${printParseNodeType(node.nodeType)}, p:${node.start} l:${
            node.length
        } [${getTextSpanString(node, this._lines)}])`;
    }

    reset() {
        this._indentation = '';
        this._output = '';
    }

    override visitArgument(node: ArgumentNode) {
        this._log(`${this._getPrefix(node)} ${getArgumentCategoryString(node.argumentCategory)}`);
        return true;
    }

    override visitAssert(node: AssertNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitAssignment(node: AssignmentNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitAssignmentExpression(node: AssignmentExpressionNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitAugmentedAssignment(node: AugmentedAssignmentNode) {
        this._log(`${this._getPrefix(node)} ${getOperatorTypeString(node.operator)}`);
        return true;
    }

    override visitAwait(node: AwaitNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitBinaryOperation(node: BinaryOperationNode) {
        this._log(
            `${this._getPrefix(node)} ${getTokenString(node.operatorToken, this._lines)} ${getOperatorTypeString(
                node.operator
            )}} parenthesized:(${node.parenthesized})`
        );
        return true;
    }

    override visitBreak(node: BreakNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitCall(node: CallNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitClass(node: ClassNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitTernary(node: TernaryNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitContinue(node: ContinueNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitConstant(node: ConstantNode) {
        this._log(`${this._getPrefix(node)} ${getKeywordTypeString(node.constType)}`);
        return true;
    }

    override visitDecorator(node: DecoratorNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitDel(node: DelNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitDictionary(node: DictionaryNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitDictionaryKeyEntry(node: DictionaryKeyEntryNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitDictionaryExpandEntry(node: DictionaryExpandEntryNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitError(node: ErrorNode) {
        this._log(`${this._getPrefix(node)} ${getErrorExpressionCategoryString(node.category)}`);
        return true;
    }

    override visitEllipsis(node: EllipsisNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitIf(node: IfNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitImport(node: ImportNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitImportAs(node: ImportAsNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitImportFrom(node: ImportFromNode) {
        this._log(
            `${this._getPrefix(node)} wildcard import:(${node.isWildcardImport}) paren:(${
                node.usesParens
            }) wildcard token:(${
                node.wildcardToken ? getTokenString(node.wildcardToken, this._lines) : 'N/A'
            }) missing import keyword:(${node.missingImportKeyword})`
        );
        return true;
    }

    override visitImportFromAs(node: ImportFromAsNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitIndex(node: IndexNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitExcept(node: ExceptNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitFor(node: ForNode) {
        this._log(`${this._getPrefix(node)} async:(${node.isAsync})`);
        return true;
    }

    override visitFormatString(node: FormatStringNode) {
        this._log(
            `${this._getPrefix(node)} ${getTokenString(node.token, this._lines)} ${node.value} unescape errors:(${
                node.hasUnescapeErrors
            })`
        );
        return true;
    }

    override visitFunction(node: FunctionNode) {
        this._log(`${this._getPrefix(node)} async:(${node.isAsync})`);
        return true;
    }

    override visitFunctionAnnotation(node: FunctionAnnotationNode) {
        this._log(`${this._getPrefix(node)} ellipsis:(${node.isParamListEllipsis})`);
        return true;
    }

    override visitGlobal(node: GlobalNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitLambda(node: LambdaNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitList(node: ListNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitListComprehension(node: ListComprehensionNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitListComprehensionFor(node: ListComprehensionForNode) {
        this._log(`${this._getPrefix(node)} async:(${node.isAsync})`);
        return true;
    }

    override visitListComprehensionIf(node: ListComprehensionIfNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitMemberAccess(node: MemberAccessNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitModule(node: ModuleNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitModuleName(node: ModuleNameNode) {
        this._log(`${this._getPrefix(node)} leading dots:(${node.leadingDots}) trailing dot:(${node.hasTrailingDot})`);
        return true;
    }

    override visitName(node: NameNode) {
        this._log(`${this._getPrefix(node)} ${getTokenString(node.token, this._lines)} ${node.value}`);
        return true;
    }

    override visitNonlocal(node: NonlocalNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitNumber(node: NumberNode) {
        this._log(`${this._getPrefix(node)} ${node.value} int:(${node.isInteger}) imaginary:(${node.isImaginary})`);
        return true;
    }

    override visitParameter(node: ParameterNode) {
        this._log(`${this._getPrefix(node)} ${getParameterCategoryString(node.category)}`);
        return true;
    }

    override visitPass(node: PassNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitRaise(node: RaiseNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitReturn(node: ReturnNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitSet(node: SetNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitSlice(node: SliceNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitStatementList(node: StatementListNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitString(node: StringNode) {
        this._log(
            `${this._getPrefix(node)} ${getTokenString(node.token, this._lines)} ${node.value} unescape errors:(${
                node.hasUnescapeErrors
            })`
        );
        return true;
    }

    override visitStringList(node: StringListNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitSuite(node: SuiteNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitTuple(node: TupleNode) {
        this._log(`${this._getPrefix(node)} paren:(${node.enclosedInParens})`);
        return true;
    }

    override visitTry(node: TryNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitTypeAnnotation(node: TypeAnnotationNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitUnaryOperation(node: UnaryOperationNode) {
        this._log(
            `${this._getPrefix(node)} ${getTokenString(node.operatorToken, this._lines)} ${getOperatorTypeString(
                node.operator
            )}`
        );
        return true;
    }

    override visitUnpack(node: UnpackNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitWhile(node: WhileNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitWith(node: WithNode) {
        this._log(`${this._getPrefix(node)} async:(${node.isAsync})`);
        return true;
    }

    override visitWithItem(node: WithItemNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitYield(node: YieldNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }

    override visitYieldFrom(node: YieldFromNode) {
        this._log(`${this._getPrefix(node)}`);
        return true;
    }
}

function getParameterCategoryString(type: ParameterCategory) {
    switch (type) {
        case ParameterCategory.Simple:
            return 'Simple';
        case ParameterCategory.VarArgList:
            return 'VarArgList';
        case ParameterCategory.VarArgDictionary:
            return 'VarArgDictionary';
    }
}

function getArgumentCategoryString(type: ArgumentCategory) {
    switch (type) {
        case ArgumentCategory.Simple:
            return 'Simple';
        case ArgumentCategory.UnpackedList:
            return 'UnpackedList';
        case ArgumentCategory.UnpackedDictionary:
            return 'UnpackedDictionary';
        default:
            return `Unknown Value!! (${type})`;
    }
}

function getErrorExpressionCategoryString(type: ErrorExpressionCategory) {
    switch (type) {
        case ErrorExpressionCategory.MissingIn:
            return 'MissingIn';
        case ErrorExpressionCategory.MissingElse:
            return 'MissingElse';
        case ErrorExpressionCategory.MissingExpression:
            return 'MissingExpression';
        case ErrorExpressionCategory.MissingIndexOrSlice:
            return 'MissingIndexOrSlice';
        case ErrorExpressionCategory.MissingDecoratorCallName:
            return 'MissingDecoratorCallName';
        case ErrorExpressionCategory.MissingCallCloseParen:
            return 'MissingCallCloseParen';
        case ErrorExpressionCategory.MissingIndexCloseBracket:
            return 'MissingIndexCloseBracket';
        case ErrorExpressionCategory.MissingMemberAccessName:
            return 'MissingMemberAccessName';
        case ErrorExpressionCategory.MissingTupleCloseParen:
            return 'MissingTupleCloseParen';
        case ErrorExpressionCategory.MissingListCloseBracket:
            return 'MissingListCloseBracket';
        case ErrorExpressionCategory.MissingFunctionParameterList:
            return 'MissingFunctionParameterList';
        default:
            return `Unknown Value!! (${type})`;
    }
}

function getTokenString(token: Token, lines: TextRangeCollection<TextRange>) {
    let str = '(';
    str += getTokenTypeString(token.type);
    str += getNewLineInfo(token);
    str += getOperatorInfo(token);
    str += getKeywordInfo(token);
    str += getStringTokenFlags(token);
    str += `, ${getTextSpanString(token, lines)}`;
    str += ') ';
    str += JSON.stringify(token);

    return str;

    function getNewLineInfo(t: any) {
        return t.newLineType ? `, ${getNewLineTypeString(t.newLineType)}` : '';
    }

    function getOperatorInfo(t: any) {
        return t.operatorType ? `, ${getOperatorTypeString(t.operatorType)}` : '';
    }

    function getKeywordInfo(t: any) {
        return t.keywordType ? `, ${getKeywordTypeString(t.keywordType)}` : '';
    }

    function getStringTokenFlags(t: any) {
        return t.flags ? `, [${getStringTokenFlagsString(t.flags)}]` : '';
    }
}

function getTextSpanString(span: TextRange, lines: TextRangeCollection<TextRange>) {
    const range = convertOffsetsToRange(span.start, TextRange.getEnd(span), lines);
    return `(${range.start.line},${range.start.character})-(${range.end.line},${range.end.character})`;
}

function getTokenTypeString(type: TokenType) {
    switch (type) {
        case TokenType.Invalid:
            return 'Invalid';
        case TokenType.EndOfStream:
            return 'EndOfStream';
        case TokenType.NewLine:
            return 'NewLine';
        case TokenType.Indent:
            return 'Indent';
        case TokenType.Dedent:
            return 'Dedent';
        case TokenType.String:
            return 'String';
        case TokenType.Number:
            return 'Number';
        case TokenType.Identifier:
            return 'Identifier';
        case TokenType.Keyword:
            return 'Keyword';
        case TokenType.Operator:
            return 'Operator';
        case TokenType.Colon:
            return 'Colon';
        case TokenType.Semicolon:
            return 'Semicolon';
        case TokenType.Comma:
            return 'Comma';
        case TokenType.OpenParenthesis:
            return 'OpenParenthesis';
        case TokenType.CloseParenthesis:
            return 'CloseParenthesis';
        case TokenType.OpenBracket:
            return 'OpenBracket';
        case TokenType.CloseBracket:
            return 'CloseBracket';
        case TokenType.OpenCurlyBrace:
            return 'OpenCurlyBrace';
        case TokenType.CloseCurlyBrace:
            return 'CloseCurlyBrace';
        case TokenType.Ellipsis:
            return 'Ellipsis';
        case TokenType.Dot:
            return 'Dot';
        case TokenType.Arrow:
            return 'Arrow';
        case TokenType.Backtick:
            return 'Backtick';
        default:
            return `Unknown Value!! (${type})`;
    }
}

function getNewLineTypeString(type: NewLineType) {
    switch (type) {
        case NewLineType.CarriageReturn:
            return 'CarriageReturn';
        case NewLineType.LineFeed:
            return 'LineFeed';
        case NewLineType.CarriageReturnLineFeed:
            return 'CarriageReturnLineFeed';
        case NewLineType.Implied:
            return 'Implied';
        default:
            return `Unknown Value!! (${type})`;
    }
}

function getOperatorTypeString(type: OperatorType) {
    switch (type) {
        case OperatorType.Add:
            return 'Add';
        case OperatorType.AddEqual:
            return 'AddEqual';
        case OperatorType.Assign:
            return 'Assign';
        case OperatorType.BitwiseAnd:
            return 'BitwiseAnd';
        case OperatorType.BitwiseAndEqual:
            return 'BitwiseAndEqual';
        case OperatorType.BitwiseInvert:
            return 'BitwiseInvert';
        case OperatorType.BitwiseOr:
            return 'BitwiseOr';
        case OperatorType.BitwiseOrEqual:
            return 'BitwiseOrEqual';
        case OperatorType.BitwiseXor:
            return 'BitwiseXor';
        case OperatorType.BitwiseXorEqual:
            return 'BitwiseXorEqual';
        case OperatorType.Divide:
            return 'Divide';
        case OperatorType.DivideEqual:
            return 'DivideEqual';
        case OperatorType.Equals:
            return 'Equals';
        case OperatorType.FloorDivide:
            return 'FloorDivide';
        case OperatorType.FloorDivideEqual:
            return 'FloorDivideEqual';
        case OperatorType.GreaterThan:
            return 'GreaterThan';
        case OperatorType.GreaterThanOrEqual:
            return 'GreaterThanOrEqual';
        case OperatorType.LeftShift:
            return 'LeftShift';
        case OperatorType.LeftShiftEqual:
            return 'LeftShiftEqual';
        case OperatorType.LessOrGreaterThan:
            return 'LessOrGreaterThan';
        case OperatorType.LessThan:
            return 'LessThan';
        case OperatorType.LessThanOrEqual:
            return 'LessThanOrEqual';
        case OperatorType.MatrixMultiply:
            return 'MatrixMultiply';
        case OperatorType.MatrixMultiplyEqual:
            return 'MatrixMultiplyEqual';
        case OperatorType.Mod:
            return 'Mod';
        case OperatorType.ModEqual:
            return 'ModEqual';
        case OperatorType.Multiply:
            return 'Multiply';
        case OperatorType.MultiplyEqual:
            return 'MultiplyEqual';
        case OperatorType.NotEquals:
            return 'NotEquals';
        case OperatorType.Power:
            return 'Power';
        case OperatorType.PowerEqual:
            return 'PowerEqual';
        case OperatorType.RightShift:
            return 'RightShift';
        case OperatorType.RightShiftEqual:
            return 'RightShiftEqual';
        case OperatorType.Subtract:
            return 'Subtract';
        case OperatorType.SubtractEqual:
            return 'SubtractEqual';
        case OperatorType.Walrus:
            return 'Walrus';
        case OperatorType.And:
            return 'And';
        case OperatorType.Or:
            return 'Or';
        case OperatorType.Not:
            return 'Not';
        case OperatorType.Is:
            return 'Is';
        case OperatorType.IsNot:
            return 'IsNot';
        case OperatorType.In:
            return 'In';
        case OperatorType.NotIn:
            return 'NotIn';
        default:
            return `Unknown Value!! (${type})`;
    }
}

function getKeywordTypeString(type: KeywordType) {
    switch (type) {
        case KeywordType.And:
            return 'And';
        case KeywordType.As:
            return 'As';
        case KeywordType.Assert:
            return 'Assert';
        case KeywordType.Async:
            return 'Async';
        case KeywordType.Await:
            return 'Await';
        case KeywordType.Break:
            return 'Break';
        case KeywordType.Class:
            return 'Class';
        case KeywordType.Continue:
            return 'Continue';
        case KeywordType.Debug:
            return 'Debug';
        case KeywordType.Def:
            return 'Def';
        case KeywordType.Del:
            return 'Del';
        case KeywordType.Elif:
            return 'Elif';
        case KeywordType.Else:
            return 'Else';
        case KeywordType.Except:
            return 'Except';
        case KeywordType.False:
            return 'False';
        case KeywordType.Finally:
            return 'Finally';
        case KeywordType.For:
            return 'For';
        case KeywordType.From:
            return 'From';
        case KeywordType.Global:
            return 'Global';
        case KeywordType.If:
            return 'If';
        case KeywordType.Import:
            return 'Import';
        case KeywordType.In:
            return 'In';
        case KeywordType.Is:
            return 'Is';
        case KeywordType.Lambda:
            return 'Lambda';
        case KeywordType.None:
            return 'None';
        case KeywordType.Nonlocal:
            return 'Nonlocal';
        case KeywordType.Not:
            return 'Not';
        case KeywordType.Or:
            return 'Or';
        case KeywordType.Pass:
            return 'Pass';
        case KeywordType.Raise:
            return 'Raise';
        case KeywordType.Return:
            return 'Return';
        case KeywordType.True:
            return 'True';
        case KeywordType.Try:
            return 'Try';
        case KeywordType.While:
            return 'While';
        case KeywordType.With:
            return 'With';
        case KeywordType.Yield:
            return 'Yield';
        default:
            return `Unknown Value!! (${type})`;
    }
}

function getStringTokenFlagsString(flags: StringTokenFlags) {
    const str = [];

    if (flags & StringTokenFlags.SingleQuote) {
        str.push('SingleQuote');
    }

    if (flags & StringTokenFlags.DoubleQuote) {
        str.push('DoubleQuote');
    }

    if (flags & StringTokenFlags.Triplicate) {
        str.push('Triplicate');
    }

    if (flags & StringTokenFlags.Raw) {
        str.push('Raw');
    }

    if (flags & StringTokenFlags.Unicode) {
        str.push('Unicode');
    }

    if (flags & StringTokenFlags.Bytes) {
        str.push('Bytes');
    }

    if (flags & StringTokenFlags.Format) {
        str.push('Format');
    }

    if (flags & StringTokenFlags.Unterminated) {
        str.push('Unterminated');
    }

    return str.join(',');
}
