import type { CardInfo } from "../lib/config";

export function TradingCard({
  card,
  price,
  selected,
  dimmed,
  onClick,
  footer,
}: {
  card: CardInfo;
  price?: number;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
}) {
  const cls = [
    "tcard",
    card.rarity.toLowerCase(),
    selected && "selected",
    onClick && "clickable",
    dimmed && "unowned",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} onClick={onClick}>
      <div className="tcard-art">{card.glyph}</div>
      <div className="tcard-body">
        <div className="tcard-name">{card.name}</div>
        <div className="tcard-meta">
          <span className="rarity">{card.rarity}</span>
          {price !== undefined && <span className="price">${price.toFixed(0)}</span>}
        </div>
        {footer && <div className="tcard-footer">{footer}</div>}
      </div>
    </div>
  );
}
