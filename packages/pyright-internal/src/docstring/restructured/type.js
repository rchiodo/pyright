// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// This file is copied from https://raw.githubusercontent.com/seikichi/restructured/master/src/Type.js
// with some small modifications.
const values = ['text', 'unknown_line'];

const parents = [
    // Document Structure
    'document',
    'section',
    'title',
    'transition',
    // Body Elements
    'paragraph',
    'bullet_list',
    'list_item',
    'enumerated_list',
    'definition_list',
    'definition_list_item',
    'term',
    'classifier',
    'definition',
    'field_list',
    'field',
    'field_name',
    'field_body',
    'docinfo',
    'author',
    'authors',
    'organization',
    'contact',
    'version',
    'status',
    'date',
    'copyright',
    'field',
    'topic',
    'option_list',
    'option_list_item',
    'option_group',
    'option',
    'option_string',
    'option_argument',
    'description',
    'literal_block',
    'line_block',
    'line',
    'block_quote',
    'attribution',
    'doctest_block',
    'table',
    'tgroup',
    'colspec',
    'thead',
    'tbody',
    'row',
    'entry',
    // Explicit Markup Blocks
    'footnote',
    'label',
    'citation',
    'target',
    'substitution_definition',
    'comment',
    // Inline Markups
    'emphasis',
    'strong',
    'literal',
    'reference',
    'target',
    'footnote_reference',
    'citation_reference',
    'substitution_reference',
    'reference',
    // Error Handling
    'system_message',
    'problematic',
    'unknown',
    // restructured Original Elements
    'directive',
    'interpreted_text',
];

const Type = {
    parentTypes: {},
    valueTypes: {},
};

/**
 * @param {string} str
 */
function camelize(str) {
    return str.replace(/_([a-z])/g, (_, w) => w.toUpperCase());
}

for (const type of values) {
    // @ts-expect-error Copied from the original code
    Type.valueTypes[camelize(type)] = type;
}

for (const type of parents) {
    // @ts-expect-error Copied from the original code
    Type.parentTypes[camelize(type)] = type;
}

export default Type;
