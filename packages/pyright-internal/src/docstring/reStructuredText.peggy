// Grammar for reStructuredText that https://peggyjs.org/documentation.html uses to generate a parser

document
  = (section / paragraph / directive)*

section
  = section_title section_body

section_title
  = (overline_title / underlined_title)

overline_title
  = overline_line newline (("=" / "-" / "~")+)

underlined_title
  = underline_line newline (("=" / "-" / "~")+)

section_body
  = (paragraph / directive / bullet_list / enumerated_list / definition_list / block_quote / comment)*

paragraph
  = (text newline)+

directive
  = ".." directive_name directive_arguments? newline (directive_content newline)*

directive_name
  = [A-Za-z0-9-_]+

directive_arguments
  = "[" directive_argument ("," directive_argument)* "]"

directive_argument
  = [^\]]+

directive_content
  = [^\n]+

bullet_list
  = (bullet_list_item newline)+

bullet_list_item
  = ("*" / "-" / "+") " " (text newline bullet_list_item?)+

enumerated_list
  = (enumerated_list_item newline)+

enumerated_list_item
  = (enumerated_list_marker / "#.") " " (text newline enumerated_list_item?)+

enumerated_list_marker
  = [0-9]+ "." / [A-Za-z]+ ")"

definition_list
  = (definition_list_item newline)+

definition_list_item
  = definition_term "::" definition_description (newline indentation? definition_list_item?)+

definition_term
  = text

definition_description
  = (text / paragraph)

block_quote
  = (block_quote_line (newline block_quote_line)*)

block_quote_line
  = (">" / ">>") " " (text newline)?

comment
  = ".." [^\n]* newline

text
  = [^\n]+

underline_line
  = underline_character+ (newline / end_of_file)

overline_line
  = (newline / end_of_file) underline_character+ newline

underline_character
  = "=" / "-" / "~"

indentation
  = "   "

hyperlink
  = "`" hyperlink_text "`_" / "`" hyperlink_text " <" hyperlink_url ">`_"

hyperlink_text
  = [^`<\n]+

hyperlink_url
  = [^>]+
