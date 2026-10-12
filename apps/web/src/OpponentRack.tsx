export default function OpponentRack({ count, name }: { count: number; name: string }) {
  return (
    <span
      className="rack opponent-rack"
      role="img"
      aria-label={`${name} has ${count} hidden tiles`}
      title={`${count} tiles in ${name}’s rack`}
    >
      {count ? (
        Array.from({ length: count }, (_, i) => (
          <i className="rack-tile" key={i} aria-hidden="true" />
        ))
      ) : (
        <small>No tiles</small>
      )}
    </span>
  );
}
