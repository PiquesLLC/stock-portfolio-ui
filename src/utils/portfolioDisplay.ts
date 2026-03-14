type PortfolioTabLike = {
  id: string;
  name: string;
  isDefault?: boolean;
  holdingsCount?: number;
};

export function normalizePortfolioTabs<T extends PortfolioTabLike>(portfolios: T[]): T[] {
  const allPortfolio = portfolios.find((p) => p.name.trim().toLowerCase() === 'all');
  const defaultPortfolio = portfolios.find((p) => p.isDefault);

  if (!allPortfolio) {
    return portfolios.map((p) => ({
      ...p,
      name: p.isDefault ? 'Portfolio 1' : p.name,
    }));
  }

  const shouldPromoteAll =
    !!defaultPortfolio &&
    defaultPortfolio.id !== allPortfolio.id &&
    (defaultPortfolio.holdingsCount ?? 0) === 0 &&
    (allPortfolio.holdingsCount ?? 0) > 0;

  if (shouldPromoteAll) {
    return portfolios
      .filter((p) => p.id !== defaultPortfolio!.id)
      .map((p) =>
        p.id === allPortfolio.id
          ? { ...p, isDefault: true, name: 'Portfolio 1' } as T
          : p
      );
  }

  return portfolios
    .filter((p) => p.id !== allPortfolio.id)
    .map((p) => ({
      ...p,
      name: p.isDefault ? 'Portfolio 1' : p.name,
    }));
}
