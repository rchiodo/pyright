/*
 * parser.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Converts a Python docstring to a common AST for converting to other formats.
 */

import * as epy from './epytext';
import * as goog from './googledoc';
import * as rest from './reStructuredText';

export function parseDocString(docString: string): string | undefined {
    // Try parsing with all 3 supported formats.
    const epyResult = epy.parse(docString);
    const restResult = rest.parse(docString);
    const googResult = goog.parse(docString);

    // If we have a result from any of the parsers, return it.
    if (epyResult) {
        return epyResult;
    } else if (restResult) {
        return restResult;
    } else if (googResult) {
        return googResult;
    }

    return undefined;
}
