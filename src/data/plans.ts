export interface PlanDefinition {
  id: 'free' | 'pro' | 'premium';
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  highlight?: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'Get started with the basics',
    features: [
      'Up to 25 holdings',
      '1 watchlist',
      '3 price alerts',
      '1D / 1W / 1M charts',
      'Heatmap',
      'Basic dividend tracking',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 9.99,
    yearlyPrice: 80,
    description: 'For active investors who want more',
    highlight: true,
    features: [
      'Unlimited holdings',
      'Unlimited watchlists',
      'Unlimited price alerts',
      'All chart periods',
      'Full dividend tracking + DRIP',
      'Nala Score',
      'Plaid brokerage linking',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    monthlyPrice: 17.99,
    yearlyPrice: 160,
    description: 'AI-powered investing edge',
    features: [
      'Everything in Pro',
      'AI Stock Q&A',
      'AI Portfolio Briefing',
      'AI Behavior Coach',
      'AI Catalyst Detection',
      'Tax-loss harvesting',
      'Anomaly detection',
    ],
  },
];
