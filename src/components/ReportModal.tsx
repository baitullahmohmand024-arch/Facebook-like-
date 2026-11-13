import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { createReport } from '../services/socialService';
import { useToast } from '../context/ToastContext';

interface ReportModalProps {
  open: boolean;
  reporterId: string;
  targetType: 'post' | 'user' | 'comment';
  targetId: string;
  targetAuthorId: string;
  targetLabel: string;
  onClose: () => void;
}

const REPORT_REASONS = [
  'Harassment or bullying',
  'Hate speech or discrimination',
  'Spam or misleading content',
  'Non-consensual or private photo',
  'Inappropriate or unsafe media',
  'Impersonation',
];

export function ReportModal({
  open,
  reporterId,
  targetType,
  targetId,
  targetAuthorId,
  targetLabel,
  onClose,
}: ReportModalProps) {
  const { showToast } = useToast();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createReport({
        reporterId,
        targetType,
        targetId,
        targetAuthorId,
        reason,
        details,
      });
      showToast({
        type: 'success',
        title: 'Report submitted',
        description: 'Thank you. Our moderation team will review this carefully.',
      });
      setDetails('');
      onClose();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Unable to submit report',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="glass-surface w-full max-w-md rounded-2xl p-6 shadow-2xl border border-white/10"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Flag className="w-4 h-4 text-[#D4AF37]" />
            <h3 id="report-modal-title" className="text-lg font-display font-semibold text-[#F8F9FA]">
              Report {targetType}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report dialog"
            className="text-[#A1A1AA] hover:text-[#F8F9FA] p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-2 text-xs text-[#A1A1AA]">
          Reporting: <span className="text-[#F8F9FA] font-medium">{targetLabel}</span>
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-[#A1A1AA]">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] focus:outline-none focus:border-[#D4AF37]"
            >
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-[#A1A1AA]">
            Additional context (optional)
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Share details that help moderators evaluate this report..."
              className="mt-1.5 w-full rounded-xl bg-[#0A0A0C] border border-white/10 px-3.5 py-2.5 text-sm text-[#F8F9FA] placeholder:text-[#71717A] focus:outline-none focus:border-[#D4AF37] resize-none"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-white/10 text-[#F8F9FA] hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="gold-gradient-btn px-4 py-2 text-sm font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </form>
    </div>
  );
}
