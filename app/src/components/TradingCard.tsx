import type { CardInfo } from "../lib/config";

export function TradingCard({
  card,
  price,
  selected,
  onClick,
  footer,
}: {
  card: CardInfo;
  price?: number;
  selected?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className={`tcard ${card.rarity.toLowerCase()}${selected ? " selected" : ""}${onClick ? " clickable" : ""}`}
      style={{ "--hue": card.hue } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="tcard-art">{card.glyph}</div>
      <div className="tcard-name">{card.name}</div>
      <div className="tcard-meta">
        <span>{card.rarity}</span>
        {price !== undefined && <span>${price.toFixed(0)}</span>}
      </div>
      {footer && <div className="tcard-footer">{footer}</div>}
    </div>
  );
}
