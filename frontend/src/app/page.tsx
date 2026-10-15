import { Metadata } from 'next';
import { LandingNav } from './_components/landing/landing-nav';
import { LandingHero } from './_components/landing/landing-hero';
import { LandingPreview } from './_components/landing/landing-preview';
import { LandingComparison } from './_components/landing/landing-comparison';
import { LandingHowItWorks } from './_components/landing/landing-how-it-works';
import { LandingRoiCalculator } from './_components/landing/landing-roi-calculator';
import { LandingMathGuarantee } from './_components/landing/landing-math-guarantee';
import { LandingPersonas } from './_components/landing/landing-personas';
import { LandingPricing } from './_components/landing/landing-pricing';
import { LandingFaq } from './_components/landing/landing-faq';
import { LandingFooter } from './_components/landing/landing-footer';

export const metadata: Metadata = {
  title: 'Agentic Business OS | Autonomous Bookkeeping & AI Accounting',
  description:
    'Put your business bookkeeping on autopilot. Native PDF bank statement extraction, 1-click payee clustering, and 100% strict mathematical general ledger reconciliation.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary">
      <LandingNav />
      <main className="flex-1">
        <LandingHero />
        <LandingPreview />
        <LandingComparison />
        <LandingHowItWorks />
        <LandingRoiCalculator />
        <LandingMathGuarantee />
        <LandingPersonas />
        <LandingPricing />
        <LandingFaq />
      </main>
      <LandingFooter />
    </div>
  );
}
