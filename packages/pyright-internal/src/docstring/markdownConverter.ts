/*
 * markdownConverter.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Converts a Python docstring to markdown.
 */

import { parseDocString } from './parser';

export function convertDocStringToMarkdown(docString: string): string {
    return parseDocString(docString) || docString;
}

export function extractParameterDocString(functionString: string, _paramName: string): string {
    return parseDocString(functionString) || '';
}
