export interface PlanDefinition {
  id: 'free' | 'pro' | 'premium' | 'elite';
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
      'Up to 10 holdings',
      '1 watchlist',
      '1 price alert',
      '1D / 1W / YTD charts',
      'Heatmap',
      'Basic dividend tracking',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 9.99,
    yearlyPrice: 79,
    description: 'Connect brokerage, never enter a trade again',
    highlight: true,
    features: [
      'Unlimited holdings',
      'Unlimited watchlists',
      'Unlimited price alerts',
      'All chart periods',
      'Plaid brokerage linking',
      'Nala Score',
      'Full dividend tracking + DRIP',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    monthlyPrice: 19.99,
    yearlyPrice: 169,
    description: 'AI intelligence layer for your portfolio',
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
  {
    id: 'elite',
    name: 'Elite',
    monthlyPrice: 49.99,
    yearlyPrice: 399,
    description: 'Deep Research + everything in Premium',
    features: [
      'Everything in Premium',
      'Nala AI Deep Research (5/mo)',
      'Priority support',
      'Early access to new features',
    ],
  },
];
