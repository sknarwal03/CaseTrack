// The E2E Vite config substitutes this module for the production Functions
// endpoint resolver. Any accidental callable request stays on the test origin;
// the E2E network guard also denies all other origins.
export function functionsEndpoint(functionName) {
  return `/__casetrack_test_functions_disabled__/${encodeURIComponent(functionName)}`;
}
