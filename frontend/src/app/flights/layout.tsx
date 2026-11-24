import "./styles.css";

export default function FlightLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="flight-theme">{children}</div>;
}
