grammar Udseen

entry Script:
    statements+=Statement*;

Statement:
    VariableDecl
    | Assignment
    | FunctionDef
    | ObjectFunctionDef
    | ObjectMethodCall
    | IfStatement
    | WhileStatement
    | Block;

VariableDecl:
    'let' name=ID '=' value=Literal ';';

Assignment:
    name=ID '=' value=Literal ';';

FunctionDef:
    'function' name=ID '(' (params+=ID (',' params+=ID)*)? ')' block=Block;

ObjectFunctionDef:
    'ObjectFunction' ('(' typeNames+=ID (',' typeNames+=ID)* ')' '::')? name=ID '(' (params+=ID (',' params+=ID)*)? ')' block=Block;

ObjectMethodCall:
    obj=ID '.' method=ID '(' (args+=Literal (',' args+=Literal)*)? ')' ';';

IfStatement:
    'if' '(' condition=Literal ')' thenBlock=Block ('else' elseBlock=Block)?;

WhileStatement:
    'while' '(' condition=Literal ')' block=Block;

Block:
    '{' statements+=Statement* '}';

// ---- Literal types (non-recursive) ----

Literal:
    {infer NumberLiteral} value=NUMBER
    | {infer StringLiteral} value=STRING
    | {infer BooleanLiteral} value=('true' | 'false')
    | {infer NullLiteral} 'null'
    | {infer IdentifierRef} name=ID
    | {infer ArrayLiteral} '[' (elements+=Literal (',' elements+=Literal)*)? ']'
    | {infer ChoiceLiteral} 'choice' '{' items+=ChoiceItem+ '}'
    | {infer GroupLiteral} '(' elements+=Literal (',' elements+=Literal)* ')';

ChoiceItem:
    text=STRING '->' action=Literal;

// ---- Terminals ----

terminal NUMBER: /-?[0-9]+(\.[0-9]+)?/;
terminal STRING: /"([^"\\]|\\.)*"/;
terminal ID: /[_a-zA-Z][\w]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n]*/;
hidden terminal WS: /\s+/;
