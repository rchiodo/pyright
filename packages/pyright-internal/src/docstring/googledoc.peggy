docstring
  = intro_paragraph newline? args_section?

intro_paragraph
  = text (newline text)*

args_section
  = "Args:" newline arg_definition*

arg_definition
  = indent parameter ":" text (newline indented_text?)*

parameter
  = [a-zA-Z0-9_]+

indented_text
  = indent indent text

text
  = "\s*" [^\n]*

indent
  = "    "

newline
  = "\n"
