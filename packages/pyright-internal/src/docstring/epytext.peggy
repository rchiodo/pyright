intro_paragraph
  = text (newline text)*

docstring_section
  = field_section / return_section

field_section
  = "@type" indent field_type ": " text newline
  / "@param" indent parameter ": " text (newline indented_text?)*

return_section
  = "@rtype" indent return_type ": " text newline
  / "@return" indent "the" text "of the line" text

field_type
  = [a-zA-Z_]+

parameter
  = [a-zA-Z_]+

return_type
  = [a-zA-Z_]+

indented_text
  = indent indent text

text
  = "\s*" [^\n]*

indent
  = " "*

newline
  = "\n"

