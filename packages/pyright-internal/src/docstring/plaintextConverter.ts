/*
 * plaintextConverter.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Converts a Python docstring to plain text.
 */

import { parseDocString } from './parser';

export function convertDocStringToPlainText(docString: string): string {
    return parseDocString(docString) || docString;
}
