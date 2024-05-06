{
  const trimLines = (lines) => lines.map((line) => line.trim());
}

start
  = description parameters* returns*
  
description
 = lines:line*
    { return trimLines(lines).join("\n"); }

parameters
  = "Parameters" _ section:sectionContent
    { return { type: 'Parameters', content: section }; }

returns
  = "Returns" _ section:sectionContent
    { return { type: 'Returns', content: section }; }

sectionContent
  = "-"+ _ lines:line+
    { return trimLines(lines).join("\n"); }
    
lineContent
  = [^\n]*

line
  = !("Parameters" / "Returns") text:[^\n]* "\n"
    { return text.join(""); }

_ "whitespace"
  = [ \t\n\r]*
