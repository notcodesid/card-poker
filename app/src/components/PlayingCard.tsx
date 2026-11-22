import { NO_CARD, isRed, rankLabel, suitLabel } from "../lib/cards";

export function PlayingCard({
  card,
  hidden,
  small,
  highlight,
}: {
  card?: number;
  hidden?: boolean;
  small?: boolean;
  highlight?: boolean;
}) {
  const cls = `pcard${small ? " small" : ""}${highlight ? " glow" : ""}`;
  if (card === undefined || card === NO_CARD) {
    return (
      <div className={`${cls} ${hidden ? "back" : "empty"}`}>
        {hidden ? <span className="lock">◈</span> : null}
      </div>
    );
  }
  return (
    <div className={`${cls} face ${isRed(card) ? "red" : "black"}`}>
      <span className="corner">
        <span className="rank">{rankLabel(card)}</span>
        <span className="suit">{suitLabel(card)}</span>
      </span>
      <span className="pip">{suitLabel(card)}</span>
    </div>
  );
}
