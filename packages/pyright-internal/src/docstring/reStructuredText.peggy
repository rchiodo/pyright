// Grammar for reStructuredText that https://peggyjs.org/documentation.html uses to generate a parser

document
  = (section / paragraph / directive)*

section
  = section_title section_body

section_title
  = (overline_title / underlined_title)

overline_title
  = overline_line new_line (("=" / "-" / "~")+)

underlined_title
  = underline_line new_line (("=" / "-" / "~")+)

section_body
  = (paragraph / directive / bullet_list / enumerated_list / definition_list / block_quote / comment)*

paragraph
  = (text new_line)+

directive
  = ".." directive_name directive_arguments? new_line (directive_content new_line)*

directive_name
  = [A-Za-z0-9-_]+

directive_arguments
  = "[" directive_argument ("," directive_argument)* "]"

directive_argument
  = [^\]]+

directive_content
  = [^\n]+

bullet_list
  = (bullet_list_item new_line)+

bullet_list_item
  = ("*" / "-" / "+") " " (text new_line bullet_list_item?)+

enumerated_list
  = (enumerated_list_item new_line)+

enumerated_list_item
  = (enumerated_list_marker / "#.") " " (text new_line enumerated_list_item?)+

enumerated_list_marker
  = [0-9]+ "." / [A-Za-z]+ ")"

definition_list
  = (definition_list_item new_line)+

definition_list_item
  = definition_term "::" definition_description (new_line indentation? definition_list_item?)+

definition_term
  = text

definition_description
  = (text / paragraph)

block_quote
  = (block_quote_line (new_line block_quote_line)*)

block_quote_line
  = (">" / ">>") " " (text new_line)?

comment
  = ".." [^\n]* new_line

text
  = [^\n]+

underline_line
  = underline_character+ (new_line / end_of_file)

overline_line
  = (new_line / end_of_file) underline_character+ new_line

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

new_line
  = "\n"

end_of_file
  = !.
