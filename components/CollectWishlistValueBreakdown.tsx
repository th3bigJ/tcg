const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

type CollectWishlistValueBreakdownProps = {
  cardValueGbp: number;
  sealedValueGbp: number;
  /** Inventory line for the Cards tile, e.g. "693 cards (151 Unique)" */
  cardInventoryLabel: string;
  /** Inventory line for the Sealed tile, e.g. "3 sealed" */
  sealedInventoryLabel: string;
};

function IconCard({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconSealed({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="m4 7 8 4 8-4M12 11v10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function CollectWishlistValueBreakdown({
  cardValueGbp,
  sealedValueGbp,
  cardInventoryLabel,
  sealedInventoryLabel,
}: CollectWishlistValueBreakdownProps) {
  const total = cardValueGbp + sealedValueGbp;

  return (
    <div className="mt-4 shrink-0 px-4">
      <div className="portfolio-value-panel">
        <div className="portfolio-value-total">
          <p className="portfolio-value-eyebrow">Total value</p>
          <p className="portfolio-value-total-amount">{gbp(total)}</p>
        </div>

        <div className="portfolio-value-split" role="group" aria-label="Value by category">
          <div className="portfolio-value-tile portfolio-value-tile--cards">
            <div className="portfolio-value-tile-label">
              <IconCard className="portfolio-value-tile-icon" />
              <span>Cards</span>
            </div>
            <p className="portfolio-value-tile-meta">{cardInventoryLabel}</p>
            <p className="portfolio-value-tile-amount">{gbp(cardValueGbp)}</p>
          </div>
          <div className="portfolio-value-tile portfolio-value-tile--sealed">
            <div className="portfolio-value-tile-label">
              <IconSealed className="portfolio-value-tile-icon" />
              <span>Sealed</span>
            </div>
            <p className="portfolio-value-tile-meta">{sealedInventoryLabel}</p>
            <p className="portfolio-value-tile-amount">{gbp(sealedValueGbp)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
