import { useRef, useEffect } from 'react';
import type { WizardStepKey } from './WizardStepIndicator';
import type { ColumnMappings } from '../api';

const MAX_PREVIEW_ROWS = 50;

const STEP_PROMPTS: Record<WizardStepKey, { title: string; description: string; required: boolean }> = {
  ticker: { title: 'Which column contains the ticker symbols?', description: 'e.g. AAPL, MSFT, GOOG', required: true },
  date: { title: 'Which column contains the trade dates?', description: 'e.g. 01/15/2026, 2026-01-15', required: false },
  price: { title: 'Which column contains the price per share?', description: 'e.g. 150.00, $1,234.56', required: false },
  shares: { title: 'Which column contains the number of shares?', description: 'e.g. 10, 25.5', required: false },
  totalAmount: { title: 'Which column contains the total amount?', description: 'e.g. $1,500.00 (price × shares)', required: false },
  action: { title: 'Which column contains the action type?', description: 'e.g. Buy, Sell, Purchase, Sold', required: false },
};

// Map step keys to mapping keys
const STEP_TO_MAPPING: Record<WizardStepKey, keyof ColumnMappings> = {
  ticker: 'ticker',
  date: 'date',
  price: 'price',
  shares: 'shares',
  totalAmount: 'totalAmount',
  action: 'action',
};

interface CsvPreviewTableProps {
  headers: string[];
  rows: Record<string, string>[];
  currentStep: WizardStepKey;
  mappings: ColumnMappings;
  onColumnSelect: (header: string) => void;
}

// Colors for each mapped role
function getMappingBadge(mappingKey: keyof ColumnMappings): { bg: string; text: string; label: string } {
  switch (mappingKey) {
    case 'ticker': return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'TICKER' };
    case 'date': return { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'DATE' };
    case 'price': return { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'PRICE' };
    case 'shares': return { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'SHARES' };
    case 'totalAmount': return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'AMOUNT' };
    case 'action': return { bg: 'bg-pink-500/20', text: 'text-pink-400', label: 'ACTION' };
  }
}

export function CsvPreviewTable({ headers, rows, currentStep, mappings, onColumnSelect }: CsvPreviewTableProps) {
  const prompt = STEP_PROMPTS[currentStep];
  const currentMappingKey = STEP_TO_MAPPING[currentStep];
  const currentlyMappedHeader = mappings[currentMappingKey];
  const tableRef = useRef<HTMLDivElement>(null);

  // Scroll selected column into view
  useEffect(() => {
    if (currentlyMappedHeader && tableRef.current) {
      const idx = headers.indexOf(currentlyMappedHeader);
      if (idx >= 0) {
        const th = tableRef.current.querySelector(`th[data-col="${idx}"]`);
        th?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentlyMappedHeader, headers]);

  // Find which mapping key a header is assigned to
  function getHeaderMapping(header: string): keyof ColumnMappings | null {
    for (const [key, val] of Object.entries(mappings)) {
      if (val === header) return key as keyof ColumnMappings;
    }
    return null;
  }

  const displayRows = rows.slice(0, MAX_PREVIEW_ROWS);
  const hasMore = rows.length > MAX_PREVIEW_ROWS;

  return (
    <div className="space-y-3">
      {/* Prompt */}
      <div>
        <p className="text-sm font-medium text-rh-light-text dark:text-rh-text">
          {prompt.title}
          {prompt.required && <span className="text-red-400 ml-1">*</span>}
        </p>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">{prompt.description}</p>
      </div>

      {/* Table */}
      <div ref={tableRef} className="border border-gray-200/40 dark:border-white/[0.08] rounded-xl overflow-x-auto max-h-[340px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              {headers.map((header, colIdx) => {
                const assignedMapping = getHeaderMapping(header);
                const isCurrentSelection = currentlyMappedHeader === header;
                const isAssignedElsewhere = assignedMapping != null && assignedMapping !== currentMappingKey;
                const badge = assignedMapping ? getMappingBadge(assignedMapping) : null;

                return (
                  <th
                    key={colIdx}
                    data-col={colIdx}
                    onClick={() => !isAssignedElsewhere && onColumnSelect(header)}
                    className={`px-3 py-2 text-left font-medium whitespace-nowrap cursor-pointer select-none transition-all ${
                      isCurrentSelection
                        ? 'bg-rh-green/15 text-rh-green border-b-2 border-rh-green'
                        : isAssignedElsewhere
                          ? 'bg-gray-100/50 dark:bg-white/[0.03] text-rh-light-muted/50 dark:text-rh-muted/40 cursor-not-allowed'
                          : 'bg-gray-50 dark:bg-white/[0.04] text-rh-light-muted dark:text-rh-muted hover:bg-rh-green/5 hover:text-rh-green/80'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{header}</span>
                      {badge && (
                        <span className={`${badge.bg} ${badge.text} px-1.5 py-0.5 rounded text-[9px] font-bold`}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-t border-gray-200/10 dark:border-white/[0.04]">
                {headers.map((header, colIdx) => {
                  const assignedMapping = getHeaderMapping(header);
                  const isHighlighted = currentlyMappedHeader === header;
                  return (
                    <td
                      key={colIdx}
                      className={`px-3 py-1.5 whitespace-nowrap ${
                        isHighlighted
                          ? 'bg-rh-green/5 text-rh-light-text dark:text-rh-text font-medium'
                          : assignedMapping
                            ? 'bg-gray-50/30 dark:bg-white/[0.01] text-rh-light-muted/60 dark:text-rh-muted/40'
                            : 'text-rh-light-muted dark:text-rh-muted'
                      }`}
                    >
                      {row[header] || ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <p className="text-[11px] text-rh-light-muted/50 dark:text-rh-muted/40 text-center">
          Showing {MAX_PREVIEW_ROWS} of {rows.length} rows
        </p>
      )}
    </div>
  );
}
