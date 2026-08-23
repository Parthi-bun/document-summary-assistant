import { LENGTH_SPECS, type SummaryLength, type SummaryResult } from '../../shared/contract';

/** Renders a result as plain text for copy-to-clipboard. */
export function formatResultAsText(
  result: SummaryResult,
  options: { fileName?: string; length: SummaryLength },
): string {
  const lines: string[] = [];

  if (options.fileName) lines.push(`Document: ${options.fileName}`);
  lines.push(`Summary length: ${LENGTH_SPECS[options.length].label}`, '', 'SUMMARY', result.summary, '', 'KEY POINTS');
  result.keyPoints.forEach((point, index) => lines.push(`${index + 1}. ${point}`));
  lines.push('', 'IMPROVEMENT SUGGESTIONS');
  result.improvementSuggestions.forEach((suggestion, index) => lines.push(`${index + 1}. ${suggestion}`));

  return lines.join('\n');
}
