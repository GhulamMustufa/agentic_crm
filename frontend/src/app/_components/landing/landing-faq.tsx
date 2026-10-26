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
    question: 'Why should I switch from QuickBooks Online or Xero if I already pay for them?',
    answer:
      'QuickBooks and Xero are passive filing cabinets: they store your data, but force you to spend 10–14 days every month manually clicking, categorizing, and typing journal entries. When a client wire has a single-letter typo or pays via Stripe, QuickBooks breaks and leaves phantom balances. Agentic OS is an autonomous autopilot: it automatically reads bank PDFs, resolves typos, books payment processor fees, clusters recurring merchants in 1 click, and reduces your month-end close to under 15 minutes.',
  },
  {
    question: 'How does Agentic OS handle Stripe, PayPal, and merchant card processing fees?',
    answer:
      'In traditional software, when a client pays a $1,000 invoice and Stripe deposits $970.70 after a $29.30 fee, QuickBooks leaves the invoice open with an unpaid $29.30 balance. Agentic OS automatically recognizes merchant payout structures: it settles the $1,000 invoice in full, credits Accounts Receivable, deposits the $970.70 net cash, and automatically writes the $29.30 fee into Account 6030 (Merchant Processing Fees). Zero manual adjustment required.',
  },
  {
    question: 'What happens if a customer wire has a typo or slightly different company name?',
    answer:
      'Our intelligent fuzzy-matching engine strips formal corporate suffixes (LLC, Inc, Corp, Sdn Bhd, Pte Ltd) and calculates character similarity using Levenshtein distance. If you invoice "Staright Corp" and the bank wire arrives from "Starlight Corp", the system recognizes the 89% match, verifies the exact unique dollar amount, and auto-settles the open invoice without manual intervention.',
  },
  {
    question:
      'What happens if I accidentally use my company card for personal coffee or groceries?',
    answer:
      'In QuickBooks, personal charges often get mistakenly categorized into business expenses, risking severe tax penalties and piercing the corporate veil during an audit. In Agentic OS, any personal charge has a 1-click "Personal Draw" action. This routes the charge directly to Account 3020 (Owner Personal Draw / Equity Distribution), bypassing your Profit & Loss statement entirely so your business tax deductions remain 100% clean.',
  },
  {
    question: 'Can the AI make arithmetic mistakes or hallucinate my account balances?',
    answer:
      'Never. The AI model operates purely as an advisory researcher (extracting text from statements, cleaning vendor names, and proposing categories). The actual general ledger, bank balances, and journal entries are enforced by an unbreakable mathematical engine that guarantees total debits equal total credits (ΣDr = ΣCr) down to the cent. If numbers do not mathematically balance, the transaction is physically blocked from the ledger.',
  },
  {
    question: 'Can I hand these books directly to my CPA or tax accountant?',
    answer:
      'Yes! With 1 click, you can export your audited General Ledger, Profit & Loss (Income Statement), Balance Sheet, and Trial Balance in standard CSV or PDF formats. Everything is formatted according to standard GAAP/IFRS principles. Furthermore, our Period Locking feature locks closed tax periods so past numbers can never be accidentally altered after your tax return is filed.',
  },
  {
    question: 'What bank statement formats do you support?',
    answer:
      'We natively support multi-page digital PDFs, scanned image PDFs, CSV, and OFX files from virtually any bank in the world—including Chase, Mercury, Bank of America, Wells Fargo, Silicon Valley Bank, Maybank, CIMB, Barclays, HSBC, and more.',
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
            Everything you need to know about why growing businesses choose Agentic OS over legacy
            accounting software.
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
