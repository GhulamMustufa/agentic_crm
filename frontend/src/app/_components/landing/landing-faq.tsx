'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, HelpCircle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: 'Can the AI make arithmetic mistakes or hallucinate my account balances?',
    answer:
      'Never. The AI model operates purely as an advisory researcher (extracting text from statements, cleaning vendor names, and proposing categories). The actual general ledger, bank balances, and journal entries are enforced by an unbreakable mathematical engine that guarantees total debits equal total credits (ΣDr = ΣCr) down to the cent. If numbers do not mathematically balance, the transaction is physically blocked from the ledger.',
  },
  {
    question: 'How is this different from QuickBooks Online or Xero?',
    answer:
      'QuickBooks and Xero are passive filing cabinets: they store data, but force you to manually type, categorize, and click "match" on hundreds of bank lines every weekend. Agentic OS is an autonomous autopilot: it automatically reads your PDF bank statements, resolves messy vendor names, groups recurring transactions into 1-click clusters, and closes your books in 15 minutes instead of 12 days.',
  },
  {
    question: 'What bank statement formats do you support?',
    answer:
      'We natively support native digital PDFs, scanned image PDFs, CSV, OFX, and QBO files from virtually any bank in the world—including Chase, Bank of America, Wells Fargo, Silicon Valley Bank, Maybank, CIMB, Barclays, HSBC, and more.',
  },
  {
    question: 'Can I export clean financial reports for my CPA at tax time?',
    answer:
      'Yes! With 1 click, you can export your audited General Ledger, Profit & Loss (Income Statement), Balance Sheet, and Trial Balance in standard CSV or PDF formats. Everything is formatted according to standard GAAP/IFRS principles so your CPA can file your taxes effortlessly.',
  },
  {
    question: 'How is my company financial data protected?',
    answer:
      'Your financial data is encrypted using bank-grade AES-256 encryption at rest and TLS 1.3 in transit. Every tenant is strictly isolated with row-level tenant security, and an immutable cryptographic audit log tracks every automated action. We never sell your financial records or train public AI models on your private data.',
  },
];

export function LandingFaq() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section id="faq" className="py-20 scroll-mt-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Badge
            variant="outline"
            className="text-xs font-semibold border-primary/30 text-primary bg-primary/5 mb-3"
          >
            <HelpCircle className="w-3.5 h-3.5 mr-1" />
            Got Questions?
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Everything you need to know about the product, accounting accuracy, security, and setup.
          </p>
        </div>

        <div className="space-y-3.5">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;

            return (
              <div
                key={faq.question}
                className="rounded-2xl border border-border/80 bg-card overflow-hidden transition-all shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-semibold text-sm sm:text-base text-foreground hover:text-primary transition-colors cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span>{faq.question}</span>
                  <div className="p-1 rounded-full bg-muted shrink-0 text-muted-foreground">
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-5 sm:px-5 sm:pb-6 pt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed border-t border-border/40 animate-in fade-in duration-150">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
