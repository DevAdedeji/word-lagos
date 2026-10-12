export default function DiamondIcon({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="diamond-icon"
      style={{ fontSize: size, lineHeight: 1, display: 'inline-block', flexShrink: 0 }}
    >
      💎
    </span>
  );
}
