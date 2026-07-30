import assert from 'node:assert/strict';
import { formatReferences } from '../build/tools/search.js';

console.log('🧪 Running formatReferences unit tests...');

// 1. Structured Document with title only
const titleOnlyRef = [
  {
    structuredDocumentInfo: {
      document: 'projects/p/locations/g/collections/d/dataStores/ds/branches/0/documents/doc1',
      structData: { key: 'value' },
      title: 'Sanitized Structured Source',
    },
  },
];

// 2. Structured Document with title and uri
const titleAndUriRef = [
  {
    structuredDocumentInfo: {
      document: 'projects/p/locations/g/collections/d/dataStores/ds/branches/0/documents/doc2',
      structData: { foo: 'bar' },
      title: 'Sanitized Structured Source',
      uri: 'https://example.invalid/sanitized-structured-source',
    },
  },
];

// 3. Structured Document with neither title nor uri (fallback test)
const fallbackRef = [
  {
    structuredDocumentInfo: {
      document: 'projects/p/locations/g/collections/d/dataStores/ds/branches/0/documents/doc3',
      structData: {},
    },
  },
];

const renderedTitleOnly = formatReferences(titleOnlyRef);
console.log('Title only rendered output:\n', renderedTitleOnly);

const renderedTitleAndUri = formatReferences(titleAndUriRef);
console.log('Title and URI rendered output:\n', renderedTitleAndUri);

const renderedFallback = formatReferences(fallbackRef);
console.log('Fallback rendered output:\n', renderedFallback);

// Assertions for structured document references preserving title and uri
assert.ok(
  renderedTitleOnly.includes('[Sanitized Structured Source](#)'),
  `Expected title "Sanitized Structured Source" in titleOnly output, got:\n${renderedTitleOnly}`
);

assert.ok(
  renderedTitleAndUri.includes('[Sanitized Structured Source](https://example.invalid/sanitized-structured-source)'),
  `Expected title and URI in titleAndUri output, got:\n${renderedTitleAndUri}`
);

assert.ok(
  renderedFallback.includes('[Structured Document 1](#)'),
  `Expected fallback "Structured Document 1" in fallback output, got:\n${renderedFallback}`
);

console.log('✅ All formatReferences unit tests passed!');
