// This file was created from the source at: https://github.com/seikichi/restructured and modified
// to add extra features and remove the dependency on lodash
{
  // utilities
  var ParserUtil = require('./restructured/parserUtil').default;

  function mapByIndex(seq, index) {
    return seq.map(function (v) { return v[index]; });
  };

  function isNull(val) {
    return val === null;
  }

  // nodes
  // TODO: Figure out how to put the position back.
  var Elements = require('./restructured/elements').default;

  var Text = Elements.Text;

  // variables
  var currentIndentSize = 0;
  var indentIgnoreLine = null;
  var nextIndentSize = null;

  var markupEndString = null;
  var attributesIndentList = [];

  var literalBlockQuoting = null;

  var enumeratedListState = (function () {
    var nextEnumeratorType = null;
    var enumeratorStack = [];
    var currentEnumerator = null;

    return {
      begin: function () {
        enumeratorStack.push(currentEnumerator);
        currentEnumerator = null;
        nextEnumeratorType = null;
      },
      end: function () {
        currentEnumerator = enumeratorStack.pop();
        if (!isNull(currentEnumerator)) {
          nextEnumeratorType = currentEnumerator.sequence.type;
        }
      },
      set: function (e) {
        currentEnumerator = e;
        nextEnumeratorType = currentEnumerator.sequence.type;
      },
      isNext: function (e) {
        return isNull(currentEnumerator) || currentEnumerator.isNext(e);
      },
      isNextType: function (type) {
        return isNull(currentEnumerator) || nextEnumeratorType === type;
      },
    };
  }());

  var indentState = (function () {
    var indentSizeStack = [];

    return {
      push: function (indentSize) {
        indentSizeStack.push(currentIndentSize);
        currentIndentSize = indentSize;
      },
      pop: function () {
        currentIndentSize = indentSizeStack.pop();
      },
      ignore: function (line) {
        indentIgnoreLine = line;
      },

      lastIndentDiff: function () {
        if (indentSizeStack.length === 0) {
          return currentIndentSize;
        }
        return currentIndentSize - indentSizeStack[indentSizeStack.length - 1];
      },
    };
  }());

  var lineBlockState = (function () {
    var currentIndentSize = -1;
    var indentSizeStack = [];

    return {
      current: function() {
        return currentIndentSize;
      },
      push: function (indentSize) {
        indentSizeStack.push(currentIndentSize);
        currentIndentSize = indentSize;
      },
      pop: function () {
        currentIndentSize = indentSizeStack.pop();
      },
      diff: function () {
        if (indentSizeStack.length === 0) {
          return currentIndentSize;
        }
        return currentIndentSize - indentSizeStack[indentSizeStack.length - 1];
      },
    };
  }());

  var bulletListState = (function () {
    var stack = [];
    var current = null;
    return {
      pushBullet: function (bullet) {
        stack.push(current);
        current = bullet;
      },
      popBullet: function () {
        current = stack.pop();
      },
      isSameBullet: function (bullet) {
        return current === bullet;
      },
    };
  }());

  var sectionState = (function () {
    var stack = [];
    var currentIndex = -1;
    return {
      isSubSection: function (c, overline) {
        if (currentIndex === stack.length - 1) {
          for (var i = 0, len = stack.length; i < len; i++) {
            if (stack[i].c === c && stack[i].overline === overline) {
              return false;
            }
          }
          return true;
        }
        var next = stack[currentIndex + 1];
        return next.c === c && next.overline === overline;
      },
      setNextSection: function (c, overline) {
        for (var i = 0, len = stack.length; i < len; i++) {
          if (stack[i].c === c && stack[i].overline === overline) {
            currentIndex = i;
            return;
          }
        }
        stack.push({ c: c, overline: overline });
        currentIndex = stack.length - 1;
      },
      popSection: function () {
        --currentIndex;
      },
      depth: function() {
        return currentIndex + 1;
      },
    };
  }());
}

AlphanumericAscii = [A-Za-z0-9]
Eof = !.
Newline = '\n' / last:('\r' '\n'?) { return last[0] + (last[1] || ''); }
Whitespace = ' ' / '\v' / '\f' / '\t'
Endline = Newline / Eof
NormalizedToWhitespace = Whitespace / Newline
Nonspacechar = c:(!NormalizedToWhitespace .) { return c[1]; }

BlankLines =
  lines:(Whitespace* Newline &(Whitespace* Endline))*
  last:(Whitespace* Endline) {
    var ret = lines.map(function (line) { return line[0].join('') + (line[1] || ''); });
    return ret.concat(last[0].join('') + (last[1] || ''));
  }

RawLine =
  raw:(!Endline .)* Endline {
    return { raw: raw.map(function (v) { return v[1]; }).join('') };
  }

NotEmptyRawLine =
  raw:(!Endline .)+ Endline {
    return { raw: raw.map(function (v) { return v[1]; }).join('') };
  }

UnknownLine = line:NotEmptyRawLine {
  return new Elements.UnknownLine({ value: line.raw });
}

EndIndent = &(
  BlankLines?
  i:Whitespace* !NormalizedToWhitespace . &{
    return ParserUtil.calcIndentSize(i) < currentIndentSize
  })

SameIndent =
  i:Whitespace* &{
    var ignore = indentIgnoreLine === location().start.line;
    return ignore || ParserUtil.calcIndentSize(i) === currentIndentSize;
  } {
    return i.join('');
  }

DeepIndent = i:Whitespace+ &{ return ParserUtil.calcIndentSize(i) > currentIndentSize; } {
  return i.join('');
}
ShallowIndent = i:Whitespace* &{ return ParserUtil.calcIndentSize(i) < currentIndentSize; } {
  return i.join('');
}
SameOrDeepIndent = i:Whitespace* &{ return ParserUtil.calcIndentSize(i) >= currentIndentSize; } {
  return i.join('');
}

Fail$ = &{ return false; } .

PopIndent$ = &{ indentState.pop(); return true; }

FailbackIndent$ = PopIndent$ Fail$

PushCommonIndent$ =
  &DeepIndent
  &(
    w1:Whitespace+ RawLine &{
      nextIndentSize = ParserUtil.calcIndentSize(w1);
      return true;
    }
    (
      (Whitespace* Newline) /
        (&DeepIndent w2:Whitespace+ RawLine &{
          nextIndentSize = Math.min(nextIndentSize, ParserUtil.calcIndentSize(w2));
          return true;
        })
    )* &{ indentState.push(nextIndentSize); return true; }
  ) {
    return { width: currentIndentSize, offset: indentState.lastIndentDiff() };
  }

PushFirstIndent$ =
  &(i:DeepIndent c:Nonspacechar &{
    indentState.push(ParserUtil.calcIndentSize(i));
    return true;
  }) {
    return { width: currentIndentSize, offset: indentState.lastIndentDiff() };
  }

SkipIndentCheck$ = &{ indentState.ignore(location().start.line); return true; }

// Document Structure
Document =
  children:(Section / Transition / BodyElement / Unknown)*
  blanklines:BlankLines {
    return new Elements.Document({ children });
  }
Section =
  blanklines:BlankLines?
  IsSubSection
  title:(SectionWithOverline / SectionWithoutOverline)
  children:((IsSubSection Section) / (!IsSection Transition) / (!IsSection BodyElement))* {
    const depth = sectionState.depth();
    sectionState.popSection();

    return new Elements.Section({
      blanklines,
      depth,
      children: [title].concat(mapByIndex(children, 1)),
    });
  }

IsSection = &(BlankLines? SectionLine !BlankLines RawLine SectionLine) /
  &(BlankLines? RawLine SectionLine)

IsSubSection =
  &(
    BlankLines? overline:SectionLine !BlankLines RawLine underline:SectionLine &{
      if (overline.line[0] !== underline.line[0]) { return false; }
      return sectionState.isSubSection(underline.line[0], true);
    }
  ) /
  &(
    BlankLines? line:RawLine underline:SectionLine &{
      return sectionState.isSubSection(underline.line[0], false);
    }
  )

SectionWithOverline =
  &(SectionLine !BlankLines RawLine SectionLine)
  overline:SectionLine
  Whitespace* children:OnelineParagraph Newline
  underline:SectionLine {
    sectionState.setNextSection(underline.line[0], true);
    return new Elements.Title({ children });
  }

SectionWithoutOverline =
  &(!BlankLines RawLine SectionLine)
  children:OnelineParagraph Newline
  underline:SectionLine {
    sectionState.setNextSection(underline.line[0], false);
    return new Elements.Title({ children });
  }

SectionLine =
  line:('!' / '"' / '#' / '$' / '%' / '&'/ "'" / '(' / ')' /
        '*' / '+' / ',' / '-' / '.' / '/' / ':' / ';' / '<' /
        '=' / '>' / '?' / '@' / '[' / '\\' / ']' / '^' / '_' /
        '`' / '{' / '|' / '}' / '~')+ &{
    return line.length >= 2 && (new Set(line)).length === 1
  } Whitespace* Newline {
    return {line: line.join('')}
  }
Transition =
  blanklines:BlankLines? // TODO(seikichi): refactor handling of blanklines
  marker:TransitionMarker Whitespace* Newline
  &(BlankLines) {
    return new Elements.Transition({ blanklines, children: [] });
  }

TransitionMarker =
  line:('!' / '"' / '#' / '$' / '%' / '&'/ "'" / '(' / ')' /
        '*' / '+' / ',' / '-' / '.' / '/' / ':' / ';' / '<' /
        '=' / '>' / '?' / '@' / '[' / '\\' / ']' / '^' / '_' /
        '`' / '{' / '|' / '}' / '~')+ &{
    return line.length >= 4 && (new Set(line)).length === 1
  } {
    return line;
  }

// Body Element
BodyElementExceptBlockQuote =
  blanklines:BlankLines? element:(
    Directive /
    Comment /
    LiteralBlock /
    BulletList /
    EnumeratedList /
    DefinitionList /
    LineBlock /
    Paragraph
  ) {
    element.blanklines = blanklines || [];
    return element;
  }

BodyElement =
  element:(BodyElementExceptBlockQuote / BlockQuote) {
    return element;
  }
ListItem = item:(NonEmptyListItem / EmptyListItem) {
  return item;
}

PushListItemIndent$ = (
  &(
    i:Whitespace+ &Nonspacechar SkipIndentCheck$
    &{ indentState.push(location().start.column - 1); return true; }
  ) / &(BlankLines PushFirstIndent$)
) {
  return { width: currentIndentSize, offset: indentState.lastIndentDiff() };
}

NonEmptyListItem = indent:PushListItemIndent$ children:(BodyElement+ / FailbackIndent$) PopIndent$ {
  return new Elements.ListItem({ children });
}

EmptyListItem = Whitespace* Endline {
  return new Elements.ListItem({ children: [] });
}
BulletList = PushBullet$ items:(BulletListItem+ / PopBullet$ Fail$) PopBullet$ {
  return new Elements.BulletList({ bullet: items[0][0], children: mapByIndex(items, 1) });
}

Bullet = [*+\-•‣⁃]
SameBullet = b:Bullet &{ return bulletListState.isSameBullet(b); } { return b; }

PushBullet$ = &(BlankLines? SameIndent b:Bullet &{ bulletListState.pushBullet(b); return true })
PopBullet$ = &{ bulletListState.popBullet(); return true; }

BulletListItem = blanklines:BlankLines? SameIndent b:SameBullet item:ListItem {
  item.blanklines = blanklines || [];
  return [b, item];
}
EnumeratedList =
  BeginEnumeratedList$
    children:(EnumeratedListItem+ / EndEnumeratedList$ Fail$)
  EndEnumeratedList$
  &BlankLines {
    return new Elements.EnumeratedList({ children });
  }

BeginEnumeratedList$ = &(BlankLines? &{ enumeratedListState.begin(); return true; })
EndEnumeratedList$ = &{ enumeratedListState.end(); return true; }

EnumeratedListItem = blanklines:BlankLines? SameIndent e:NextEnumerator item:ListItem {
  item.blanklines = blanklines || [];
  return item;
}

Enumerator =
  s:EnumerationSequence '.' { return new Elements.Enumerator({ sequence: s, format: 'period' }); } /
  s:EnumerationSequence ')' { return new Elements.Enumerator({ sequence: s, format: 'right_parenthesis' }); } /
  '(' s:EnumerationSequence ')' { return new Elements.Enumerator({ sequence: s, format: 'parentheses' }); }

NextEnumerator = e:Enumerator &{
  if (!enumeratedListState.isNext(e)) { return false; }
  enumeratedListState.set(e);
  return true;
} { return e; }

EnumerationSequence =
  AutoEnumerationSequence /
  AcceptNumeral$ e:ArabicNumeralsEnumerationSequence { return e; } /
  AcceptUpperCaseRoman$ e:UpperCaseRomanEnumerationSequence { return e; } /
  AcceptLowerCaseRoman$ e:LowerCaseRomanEnumerationSequence { return e; } /
  AcceptUpperCaseAlphabet$ e:UpperCaseAlphabetEnumerationSequence { return e; } /
  AcceptLowerCaseAlphabet$ e:LowerCaseAlphabetEnumerationSequence { return e; }

AcceptNumeral$ = &{ return enumeratedListState.isNextType('arabic_numerals'); }
AcceptUpperCaseRoman$ = &{ return enumeratedListState.isNextType('uppercase_roman'); }
AcceptLowerCaseRoman$ = &{ return enumeratedListState.isNextType('lowercase_roman'); }
AcceptUpperCaseAlphabet$ = &{ return enumeratedListState.isNextType('uppercase_alphabet'); }
AcceptLowerCaseAlphabet$ = &{ return enumeratedListState.isNextType('lowercase_alphabet'); }

AutoEnumerationSequence = '#' { return new Elements.EnumeratorSequence({ type: 'auto', value: '#' }); }

ArabicNumeralsEnumerationSequence = head:[1-9] tail:[0-9]* {
  return new Elements.EnumeratorSequence({ type: 'arabic_numerals', value: [head].concat(tail).join('') });
} / head:[0] {
  return new Elements.EnumeratorSequence({ type: 'arabic_numerals', value: head });
}

UpperCaseAlphabetEnumerationSequence = s:[A-Z] {
  return new Elements.EnumeratorSequence({ type: 'uppercase_alphabet', value: s });
}

LowerCaseAlphabetEnumerationSequence = s:[a-z] {
  return new Elements.EnumeratorSequence({ type: 'lowercase_alphabet', value: s });
}

UpperCaseRomanEnumerationSequence = s:[IVXLCDM]+ &{ return ParserUtil.isUpperRomanNumber(s.join('')); } {
  return new Elements.EnumeratorSequence({ type: 'uppercase_roman', value: s.join('') });
}

LowerCaseRomanEnumerationSequence = s:[ivxlcdm]+ &{ return ParserUtil.isLowerRomanNumber(s.join('')); } {
  return new Elements.EnumeratorSequence({ type: 'lowercase_roman', value: s.join('') });
}
DefinitionList = children:DefinitionListItem+ &BlankLines {
  return new Elements.DefinitionList({ children });
}

DefinitionListItem =
  blanklines:BlankLines?
  SameIndent
  term:DefinitionTerm
  classifiers:(Whitespace+ ':' Whitespace+ DefinitionClassifier)* Whitespace* Newline
  indent:PushFirstIndent$
  body:(DefinitionListBody / FailbackIndent$)
  PopIndent$ {
    var classifiers = mapByIndex(classifiers, 3);
    return new Elements.DefinitionListItem({
      blanklines,
      indent,
      children: [term, ...classifiers, body],
    });
  }

DefinitionTerm = children:(InlineMarkupWithoutNewline / DefinitionTermText)+ {
  return new Elements.Term({ children });
}

DefinitionListBody = children:BodyElement+ {
  return new Elements.Definition({ children });
}

DefinitionClassifierBeggining = Whitespace+ ':' Whitespace+

DefinitionTermText = text:(!Endline !DefinitionClassifierBeggining !InlineMarkupBeggining .)+ {
  return new Elements.Text({ value: mapByIndex(text, 3).join('') });
}

DefinitionClassifier = children:(InlineMarkupWithoutNewline / DefinitionTermText)+ {
  return new Elements.Classifier({ children });
}
BlockQuote = NestedBlockQuote / SimpleBlockQuote

NestedBlockQuote =
  blanklines:BlankLines?
  indent:PushFirstIndent$
    inner:InnerBlockQuote
    &(BlankLines ShallowIndent / FailbackIndent$)
  PopIndent$
  outer:BlockQuote {
    var innerIndent = { width: indent.width, offset: indent.width - outer.indent.width };
    inner.indent = innerIndent;

    var children = [inner].concat(outer.children);
    var indent = outer.indent;
    return new Elements.BlockQuote({ indent, blanklines, children });
  }

InnerBlockQuote =
  nested:(BlockQuoteBody / FailbackIndent$)
  attribution:Attribution? {
  return new Elements.BlockQuote({ children: nested.concat(attribution || []) });
}

SimpleBlockQuote =
  blanklines:BlankLines?
  indent:PushFirstIndent$
    children:(BlockQuoteBody / FailbackIndent$)
    attribution:Attribution?
  PopIndent$ {
    return new Elements.BlockQuote({
      indent,
      blanklines,
      children: children.concat(attribution || []),
    });
  }

BlockQuoteBody =
  head:BodyElementExceptBlockQuote
  tail:(!Attribution BodyElement)* {
    return [head].concat(tail.map(function (v) { return v[1]; }));
  }

Attribution =
  blanklines:BlankLines
  SameIndent ('---' / '--' / '\u2014') Whitespace* &(!Endline .)
  body:(AttributionBodyWithIndent / AttributionBodyWithoutIndent) {
    return new Elements.Attribution({ blanklines, children: body.children });
  }

PushAttributionIndent$ = &(RawLine PushFirstIndent$)

AttributionBodyWithIndent = PushAttributionIndent$ SkipIndentCheck$ body:(Paragraph / FailbackIndent$) PopIndent$ {
  return body;
}

AttributionBodyWithoutIndent = SkipIndentCheck$ body:Paragraph { return body; }
Comment = CommentStartFromFirstLine / CommentStartFromNextLine

CommentStartFromFirstLine =
  SameIndent '..' Whitespace+ &Nonspacechar head:RawLine tail:(BlankLines? CommentBlock)? {
    var children = [new Elements.Text({ value: head.raw })];
    var indent = null;
    if (!isNull(tail)) {
      indent = tail[1].indent;
      children = children.concat(tail[1].children);
    }
    return new Elements.Comment({ indent, children });
  }

CommentStartFromNextLine =
  SameIndent '..' Whitespace* Newline comment:CommentBlock? {
    if (!isNull(comment)) {
      return comment;
    }
    return new Elements.Comment({ });
  }

CommentBlock =
  indent:PushCommonIndent$
  comments:(
    (Whitespace* Newline { return null; } / SameOrDeepIndent NotEmptyRawLine)+ /
      FailbackIndent$
  )
  PopIndent$ {
    var children = _.map(_.reject(comments, isNull), function (v) {
      var ws = v[0], raw = v[1].raw;
      var text = _.repeat(' ', ws.length - indent.width) + raw;
      return new Elements.Text({ value: text });
    });
    return new Elements.Comment({ indent, children });
  }
InlineMarkupFollowing =
  Endline / c:. &{ return ParserUtil.isInlineMarkupSuffix(c); }

InlineMarkup =
  StrongEmphasis /
  Emphasis /
  InlineLiteral /
  InlineInternalTarget /
  HyperlinkReference /
  InterpretedText /
  SubstitutionReference /
  FootnoteReference /
  CitationReference

// TODO(seikichi): support more inline literals
InlineMarkupWithoutNewline =
  StrongEmphasisWithoutNewline /
  EmphasisWithoutNewline /
  InlineLiteralWithoutNewline

MarkupEndString =
  &{ return markupEndString.length === 1 } s:(.) &{ return s === markupEndString; } /
  &{ return markupEndString.length === 2 } s:(..) &{ return s.join('') === markupEndString; } /
  &{ return markupEndString.length === 3 } s:(...) &{ return s.join('') === markupEndString; }

MarkupTextWithoutNewline =
  text:(
    !Newline
    !(
      !NormalizedToWhitespace
      (&{ return markupEndString === '``' } / !'\\')
      .
      MarkupEndString
      InlineMarkupFollowing
    )
  .)+ {
    return new Text({ value: mapByIndex(text, 2).join('') });
  }

MarkupTextWithoutIndent =
  text:MarkupTextWithoutNewline
  last:Newline? {
    if (!isNull(last)) {
      text = new Text({ value: text.value + last})
    }
    return text;
  }

MarkupTailWithoutNewline =
  text:MarkupTextWithoutNewline
  !Endline !NormalizedToWhitespace last:.
  MarkupEndString
  &InlineMarkupFollowing {
    return [new Text({ value: text.value + last })]
  }

MarkupTail =
  first:MarkupTextWithoutIndent?
  middle:(SameIndent MarkupTextWithoutIndent)*
  !Endline !NormalizedToWhitespace last:.
  MarkupEndString
  &InlineMarkupFollowing {
    var children = (isNull(first) ? [] : [first]).concat(mapByIndex(middle, 1));
    if (children.length === 0) {
      children.push(new Text({ value: '' }));
    }
    var lastText = children[children.length - 1];
    children[children.length - 1] = new Text({ value: lastText.value + last });
    return children;
  }

Emphasis =
  ('*' !'*' !NormalizedToWhitespace)
  &{ markupEndString = '*'; return true; }
  children:MarkupTail {
    return new Elements.Emphasis({ children });
  }

EmphasisWithoutNewline =
  ('*' !'*' !NormalizedToWhitespace)
  &{ markupEndString = '*'; return true; }
  children:MarkupTailWithoutNewline {
    return new Elements.Emphasis({ children });
  }

StrongEmphasis =
  ('**' !NormalizedToWhitespace)
  &{ markupEndString = '**'; return true; }
  children:MarkupTail {
    return new Elements.Strong({ children });
  }

StrongEmphasisWithoutNewline =
  ('**' !NormalizedToWhitespace)
  &{ markupEndString = '**'; return true; }
  children:MarkupTailWithoutNewline {
    return new Elements.Strong({ children });
  }

InterpretedText =
  role:(':' (!Endline !Whitespace !':' .)+ ':')?
  ('`' !NormalizedToWhitespace)
  &{ markupEndString = '`'; return true; }
  children:MarkupTail {
    var roleStr = null;
    if (!isNull(role)) {
      roleStr = _.map(role[1], function (v) { return v[3]; }).join('');
    }
    return new Elements.InterpretedText({ role: roleStr, children });
  }

// TODO(seikichi): unescaped backslash preceding a start-string end-string
InlineLiteral =
  ('``' !NormalizedToWhitespace)
  &{ markupEndString = '``'; return true; }
  children:MarkupTail {
    return new Elements.Literal({ children });
  }

InlineLiteralWithoutNewline =
  ('``' !NormalizedToWhitespace)
  &{ markupEndString = '``'; return true; }
  children:MarkupTailWithoutNewline {
    return new Elements.Literal({ children });
  }

SubstitutionReference =
  ('|' !NormalizedToWhitespace)
  &{ markupEndString = '|'; return true; }
  children:MarkupTail {
    return new Elements.SubstitutionReference({ children });
  }

InlineInternalTarget =
  ('_`' !NormalizedToWhitespace)
  &{ markupEndString = '`'; return true; }
  children:MarkupTail {
    return new Elements.InlineInternalTarget({  children });
  }

FootnoteLabel =
  label:([0-9]+ / '#' ReferenceName / '#' / '*') {
    if (_.isArray(label)) {
      return label.join('');
    }
    return label;
  }

FootnoteReference =
  '[' label:FootnoteLabel ']_' &InlineMarkupFollowing {
    return new Elements.FootnoteReference({ children: [new Text({ value: label })] });
  }

CitationReference =
  '[' label:ReferenceName ']_' &InlineMarkupFollowing {
    return new Elements.CitationReference({ children: [new Text({ value: label })] });
  }

HyperlinkReference =
  AnonymousHyperlinkReference /
  AnonymousSimpleHyperlinkReference /
  NamedHyperlinkReference /
  NamedSimpleHyperlinkReference

NamedHyperlinkReference =
  ('`' !NormalizedToWhitespace)
  &{ markupEndString = '`_'; return true; }
  children:MarkupTail {
    return new Elements.Reference({ anonymous: false, simple: false, children });
  }

NamedSimpleHyperlinkReference =
  ref:HyperlinkReferenceName '_' &InlineMarkupFollowing {
    return new Elements.Reference({ anonymous: false, simple: true, children: [new Text({ value: ref })] });
  }

AnonymousHyperlinkReference =
  ('`' !NormalizedToWhitespace)
  &{ markupEndString = '`__'; return true; }
  children:MarkupTail {
    return new Elements.Reference({ anonymous: true, simple: false, children });
    return {children};
  }

AnonymousSimpleHyperlinkReference =
  ref:HyperlinkReferenceName '__' &InlineMarkupFollowing {
    return new Elements.Reference({ anonymous: true, simple: true, children: [new Text({ value: ref })] });
  }

// Reference
ReferenceName =
  head:AlphanumericAscii
  tail:(AlphanumericAscii / [-_.:+])+ {
    return head + tail.join('');
  }

HyperlinkReferenceName =
  head:AlphanumericAscii
  tail:(AlphanumericAscii / [-.:+])+ {
    return head + tail.join('');
  }

LiteralBlock = SameIndent block:LiteralBlockWithoutIndent { return block; }

LiteralBlockWithoutIndent = IndentedLiteralBlockWithoutIndent / QuotedLiteralBlockWithoutIndent

IndentedLiteralBlockWithoutIndent =
  '::' Whitespace* Newline
  BlankLines
  indent:PushCommonIndent$
    lines:((
      Whitespace* Newline !(BlankLines? ShallowIndent) /
      &SameOrDeepIndent w:Whitespace+ RawLine
    )+ / FailbackIndent$)
  PopIndent$ {
    var children = _.map(lines, function (line) {
      if (!_.isUndefined(line[0])) {
        var indentSize = ParserUtil.calcIndentSize(line[0].join(''));
        var text = _.repeat(' ', Math.max(0, indentSize - indent.width));
      } else {
        var indentSize = ParserUtil.calcIndentSize(line[1].join(''));
        var text = _.repeat(' ', indentSize - indent.width) + line[2].raw;
      }
      return new Elements.Text({ value: text } );
    });
    return new Elements.LiteralBlock({ children });
  }

QuotedLiteralBlockWithoutIndent =
  '::' Whitespace* Newline BlankLines
  SetQuoting$
    lines:(SameIndent IsValidQuoting$ NotEmptyRawLine)+
  &BlankLines {
    var children = _.map(lines, function (line) {
      return new Elements.Text({ value: line[2].raw } );
    });
    return new Elements.LiteralBlock({ children });
  }

Quoting = ('!' / '"' / '#' / '$' / '%' / '&'/ "'" / '(' / ')' /
           '*' / '+' / ',' / '-' / '.' / '/' / ':' / ';' / '<' /
           '=' / '>' / '?' / '@' / '[' / '\\' / ']' / '^' / '_' /
           '`' / '{' / '|' / '}' / '~')

SetQuoting$ = &(SameIndent q:Quoting  &{ literalBlockQuoting = q; return true; })
IsValidQuoting$ = &(q:Quoting  &{ return literalBlockQuoting === q; })
LineBlock = NestedLineBlock / SimpleLineBlock

NestedLineBlock =
  indent:PushLineBlockIndent$
  head:Line tail:(Line / LineBlock)*
  PopLineBlockIndent$
  outer:LineBlock {
    var first = new Elements.LineBlock({ children: [head].concat(tail) });
    var children = [first].concat(outer.children);
    return new Elements.LineBlock({ children });
}

SimpleLineBlock = indent:PushLineBlockIndent$ block:(LineBolockMain / FailbackLineBlockIndent$) PopLineBlockIndent$ {
  return block;
}

LineBolockMain = head:Line tail:(Line / LineBlock)* &BlankLines {
  return new Elements.LineBlock({ children: [head, ...tail] });
}

Line = NonEmptyLine / EmptyLine

NonEmptyLine = SameIndent '| ' SameLineBlockIndent children:OnelineParagraph Newline {
  return new Elements.Line({ children });
}

EmptyLine = SameIndent '|' Whitespace* Newline {
  return new Elements.Line({ children: [] });
}

SameLineBlockIndent = i:Whitespace* &{
  return ParserUtil.calcIndentSize(i) === lineBlockState.current();
} {
  return i.join('');
}

DeepLineBlockIndent = i:Whitespace* &{
  return ParserUtil.calcIndentSize(i) > lineBlockState.current();
} {
  return i.join('');
}

PushLineBlockIndent$ =
  &(EmptyLine* SameIndent '| ' i:DeepLineBlockIndent &{
    lineBlockState.push(ParserUtil.calcIndentSize(i));
    return true;
  }) {
    return { width: lineBlockState.current(), offset: lineBlockState.diff() };
  }

PopLineBlockIndent$ = &{ lineBlockState.pop(); return true; }

FailbackLineBlockIndent$ = PopLineBlockIndent$ Fail$
// Utility for Paragraph
InlineMarkupPreceding = c:. &{ return ParserUtil.isInlineMarkupPrefix(c); } { return c; }
InlineMarkupStartString = '**' / '*' / '``' / '`' / '|' / '_`'
InlineMarkupBeggining =
  p:InlineMarkupPreceding s:InlineMarkupStartString !Endline !Whitespace f:. &{
    return !(p === '*' && s === '*') && !ParserUtil.isMatchPunctuations(p, f);
  } / InlineMarkupPreceding (InterpretedText /
                             FootnoteReference /
                             CitationReference /
                             AnonymousSimpleHyperlinkReference /
                             NamedSimpleHyperlinkReference)

Paragraph = children:(SameIndent ParagraphBlock)+ &((LiteralBlockWithoutIndent  SkipIndentCheck$) / BlankLines / EndIndent) {
  return new Elements.Paragraph({ children: _.flatten(mapByIndex(children, 1)) });
}

ParagraphBlock =
  children:(
    !(BlankLines / LiteralBlockWithoutIndent)
    (InlineMarkup / ParagraphText)
  )+
  Whitespace*
  last:(Endline / &LiteralBlockWithoutIndent) {
    var texts = mapByIndex(children, 1);
    if (last) {
      if (texts[texts.length - 1].type !== 'text') {
        return texts.concat(new Text({ value: last }));
      }
      texts[texts.length - 1] = new Text({ value: texts[texts.length - 1].value + last });
    }
    return texts;
  }

ParagraphText =
  text:(!(Endline / LiteralBlockWithoutIndent) !InlineMarkupBeggining .)+ &(Endline / LiteralBlockWithoutIndent) {
    return new Text({ value: mapByIndex(text, 2).join('') });
  } / text:(!Endline !InlineMarkupBeggining .)* last:InlineMarkupPreceding {
    return new Text({ value: mapByIndex(text, 2).join('') + last });
  }

OnelineParagraph = (InlineMarkupWithoutNewline / OnelineText)+

OnelineText =
  text:(!Endline !InlineMarkupBeggining .)+ last:(!Endline InlineMarkupPreceding)? {
    var s = mapByIndex(text, 2).join('');
    if (!isNull(last)) { s += last[1]; }
    return new Text({ value: s });
  } / text:(!Endline !InlineMarkupBeggining .)* last:(!Endline InlineMarkupPreceding) {
    var s = mapByIndex(text, 2).join('') + last[1];
    return new Text({ value: s });
  }
DirectiveType =
  first:([A-Za-z] !'::' [-_+:.]?)*
  last:[A-Za-z] {
    return _.flatMap(first, v => _.compact(v)).concat(last).join('');
  }
// Directive types are case-insensitive single words
// (alphanumerics plus isolated internal hyphens,
//  underscores, plus signs, colons, and periods; no whitespace)

Directive = DirectiveStartFromFirstLine / DirectiveStartFromNextLine

DirectiveStartFromFirstLine =
  SameIndent '..' Whitespace+ directive:DirectiveType '::' Whitespace+ &Nonspacechar head:RawLine tail:(BlankLines? DirectiveBlock)? {
    var children = [new Elements.Text({ value: head.raw })];
    var indent = null;
    if (!isNull(tail)) {
      indent = tail[1].indent;
      children = children.concat(tail[1].children);
    }
    return new Elements.Directive({ directive, indent, children });
  }

DirectiveStartFromNextLine =
  SameIndent '..' Whitespace+ directive:DirectiveType '::' Whitespace* Newline block:DirectiveBlock? {
    if (!isNull(block)) {
      return new Elements.Directive({
        directive: directive,
        indent: block.indent,
        children: block.children,
      });
    }
    return new Elements.Directive({ directive });
  }

DirectiveBlock =
  BlankLines?
  indent:PushCommonIndent$
  blocks:(
    (Whitespace* Newline { return null; } / SameOrDeepIndent NotEmptyRawLine)+ /
      FailbackIndent$
  )
  PopIndent$ {
    var children = _.map(_.reject(blocks, isNull), function (v) {
      var ws = v[0], raw = v[1].raw;
      var text = _.repeat(' ', ws.length - indent.width) + raw;
      return new Elements.Text({ value: text });
    });
    return new Elements.Directive({ indent, children });
  }

// Unknown
Unknown = blanklines:BlankLines? children:(!BlankLines UnknownLine)+ {
  return new Elements.Unknown({ blanklines, children: _.flatten(mapByIndex(children, 1)) });
}
