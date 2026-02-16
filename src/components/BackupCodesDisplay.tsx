import { useState } from 'react';

interface BackupCodesDisplayProps {
  codes: string[];
  onDone: () => void;
}

export function BackupCodesDisplay({ codes, onDone }: BackupCodesDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    const content = [
      'Nala - Backup Codes',
      `Generated: ${new Date().toLocaleDateString()}`,
      '',
      'Each code can only be used once.',
      'Store these somewhere safe.',
      '',
      ...codes,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nala-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <p className="text-sm text-yellow-400 font-medium mb-1">Save your backup codes</p>
        <p className="text-xs text-yellow-400/70">
          Each code can only be used once. Store them somewhere safe &mdash;
          you'll need these if you lose access to your authenticator or email.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 p-4 bg-rh-dark rounded-lg border border-rh-border">
        {codes.map((code, i) => (
          <div key={i} className="text-center py-1.5 font-mono text-sm text-white tracking-wider">
            {code}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCopyAll}
          className="flex-1 py-2 px-3 text-sm font-medium rounded-lg border border-rh-border
            text-rh-text hover:bg-rh-border/50 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy All'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex-1 py-2 px-3 text-sm font-medium rounded-lg border border-rh-border
            text-rh-text hover:bg-rh-border/50 transition-colors"
        >
          Download .txt
        </button>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="w-full py-2.5 bg-rh-green hover:bg-rh-green/90 text-white font-semibold rounded-lg transition-colors"
      >
        I've saved my codes
      </button>
    </div>
  );
}
